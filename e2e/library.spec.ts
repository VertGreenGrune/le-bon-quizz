import { expect, test, devices, type APIRequestContext, type Browser } from '@playwright/test';
import type { QuizDetail, QuizInput } from '@lbq/shared';

/**
 * Library (T16): host A makes a quiz public, host B finds it in the library, copies it, then
 * launches A's quiz and plays it with one phone; A sees it was played.
 *
 * Needs a database (host accounts, DB quizzes): runs only when `E2E_DATABASE_URL` is set
 * (the Playwright config migrates it and starts the server on it), e.g.
 *   E2E_DATABASE_URL=postgresql://lbq:lbq@localhost:5432/lbq_e2e pnpm test:e2e
 */
test.skip(!process.env.E2E_DATABASE_URL, 'E2E_DATABASE_URL not set (needs Postgres)');

const SERVER_URL = `http://localhost:${process.env.E2E_SERVER_PORT ?? 3004}`;
const stamp = Date.now();

const quiz = (title: string): QuizInput => ({
  title,
  questions: [
    {
      type: 'MCQ',
      text: 'Combien de pattes a une araignée ?',
      timeLimitSec: 20,
      basePoints: 1000,
      choices: [
        { text: 'Six', isCorrect: false },
        { text: 'Huit', isCorrect: true },
      ],
    },
  ],
});

/** Registers a host in `request`'s context (sets the session cookie for its pages). */
async function register(request: APIRequestContext, name: string) {
  const res = await request.post(`${SERVER_URL}/api/auth/register`, {
    data: { email: `${name.toLowerCase()}-${stamp}@e2e.test`, name, password: 'password123' },
  });
  expect(res.status()).toBe(201);
}

async function hostContext(browser: Browser, name: string) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  await register(context.request, name);
  return { context, page: await context.newPage() };
}

test('host B launches host A’s public quiz from the library', async ({ browser }) => {
  const publicTitle = `Araignées ${stamp}`;
  const privateTitle = `Secret ${stamp}`;

  // ---- Host A: a private quiz, made public in the editor; another one stays private ----
  const a = await hostContext(browser, 'Alice');
  const created = await a.context.request.post(`${SERVER_URL}/api/quizzes`, {
    data: quiz(publicTitle),
  });
  expect(created.status()).toBe(201);
  const { id: quizId, visibility } = (await created.json()) as QuizDetail;
  expect(visibility).toBe('PRIVATE');
  await a.context.request.post(`${SERVER_URL}/api/quizzes`, { data: quiz(privateTitle) });

  await a.page.goto(`/editor/${quizId}`);
  await expect(a.page.getByRole('radio', { name: /Privé/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await a.page.getByRole('radio', { name: /Public/ }).click();
  await expect(a.page.getByText('Ils ne pourront pas le modifier.')).toBeVisible();
  await a.page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(a.page.getByRole('button', { name: 'Enregistré ✓' })).toBeVisible();
  await a.page.goto('/editor');
  const aCard = a.page.getByRole('listitem').filter({ hasText: publicTitle });
  await expect(aCard.getByText('Public')).toBeVisible();
  await expect(aCard.getByText(/jamais joué/)).toBeVisible();

  // ---- Host B: library → search → copy ----
  const b = await hostContext(browser, 'Bruno');
  await b.page.goto('/editor');
  await b.page.getByRole('link', { name: 'Bibliothèque' }).click();
  await expect(b.page.getByRole('heading', { name: 'Bibliothèque' })).toBeVisible();
  await b.page.getByRole('searchbox').fill(String(stamp));
  const card = b.page.getByRole('listitem').filter({ hasText: publicTitle });
  await expect(card).toBeVisible();
  await expect(card.getByText('par Alice')).toBeVisible();
  await expect(b.page.getByText(privateTitle)).toHaveCount(0);

  await card.getByRole('button', { name: 'Copier dans mes quiz' }).click();
  await expect(b.page.getByRole('status')).toContainText(`« ${publicTitle} (copie) »`);

  // ---- Host B launches A's quiz (solo) ----
  await card.getByRole('button', { name: '▶ Lancer' }).click();
  await b.page.getByRole('dialog').getByRole('button', { name: '▶ Lancer' }).click();
  await expect(b.page).toHaveURL(/\/host\/\d{6}$/);
  const pin = new URL(b.page.url()).pathname.split('/').pop()!;

  const phoneContext = await browser.newContext({ ...devices['Pixel 7'] });
  const phone = await phoneContext.newPage();
  await phone.goto(`/join?pin=${pin}`);
  await phone.getByPlaceholder('Ton pseudo').fill('Zoé');
  await phone.getByRole('button', { name: 'Entrer' }).click();
  await expect(b.page.getByRole('button', { name: 'Zoé' })).toBeVisible();
  await b.page.getByRole('button', { name: 'Commencer' }).click();

  await expect(
    b.page.getByRole('heading', { name: 'Combien de pattes a une araignée ?' }),
  ).toBeVisible();
  await phone.getByRole('button', { name: 'Réponse ◆' }).click();
  await expect(phone.getByRole('heading', { name: 'Correct !' })).toBeVisible();
  await b.page.getByRole('button', { name: 'Suivant' }).click();
  await b.page.getByRole('button', { name: 'Voir le podium' }).click();
  await expect(b.page.getByRole('heading', { name: 'Podium' })).toBeVisible();
  await b.page.getByRole('button', { name: 'Terminer la partie' }).click();
  await expect(b.page.getByRole('link', { name: "Retour à l'accueil" })).toBeVisible();

  // ---- B's copy is private and editable; A's quiz now counts one game ----
  await b.page.goto('/editor');
  const copy = b.page.getByRole('listitem').filter({ hasText: `${publicTitle} (copie)` });
  await expect(copy.getByText('Privé')).toBeVisible();
  await a.page.reload();
  await expect(aCard.getByText(/joué 1 fois/)).toBeVisible();

  await Promise.all([a.context.close(), b.context.close(), phoneContext.close()]);
});
