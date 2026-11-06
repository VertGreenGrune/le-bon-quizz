import { expect, test, type APIRequestContext, type Browser } from '@playwright/test';
import type { QuizDetail, QuizInput } from '@lbq/shared';

/**
 * Quiz sharing (T45): Alice shares a quiz with Bruno (« Peut modifier ») and Chloé (« Peut
 * lancer »). Bruno edits it from « Partagés avec moi »; Alice, who still had the old version open,
 * gets the conflict message and reloads; Chloé can only view / copy. Needs `E2E_DATABASE_URL`.
 */
test.skip(!process.env.E2E_DATABASE_URL, 'E2E_DATABASE_URL not set (needs Postgres)');

const SERVER_URL = `http://localhost:${process.env.E2E_SERVER_PORT ?? 3004}`;
const stamp = Date.now();
const email = (name: string) => `${name.toLowerCase()}-share-${stamp}@e2e.test`;

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

async function register(request: APIRequestContext, name: string) {
  const res = await request.post(`${SERVER_URL}/api/auth/register`, {
    data: { email: email(name), name, password: 'password123' },
  });
  expect(res.status()).toBe(201);
}

async function hostContext(browser: Browser, name: string) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  await register(context.request, name);
  return { context, page: await context.newPage() };
}

test('share a quiz, co-edit it, conflict, read-only viewer', async ({ browser }) => {
  const title = `Partagé ${stamp}`;
  const a = await hostContext(browser, 'Alice');
  const b = await hostContext(browser, 'Bruno');
  const c = await hostContext(browser, 'Chloe');

  const created = await a.context.request.post(`${SERVER_URL}/api/quizzes`, { data: quiz(title) });
  const { id } = (await created.json()) as QuizDetail;

  // ---- Alice shares from the editor ----
  await a.page.goto(`/editor/${id}`);
  await a.page.getByRole('button', { name: '👥 Partager' }).click();
  const dialog = a.page.getByRole('dialog');
  await expect(dialog.getByText('Ce quiz n’est partagé avec personne.')).toBeVisible();
  await dialog.getByLabel('Adresse e-mail de l’animateur').fill('inconnu@e2e.test');
  await dialog.getByRole('button', { name: 'Partager', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Aucun compte animateur');
  await dialog.getByLabel('Adresse e-mail de l’animateur').fill(email('Bruno'));
  await dialog.getByLabel('Droits', { exact: true }).selectOption('editor');
  await dialog.getByRole('button', { name: 'Partager', exact: true }).click();
  await expect(dialog.getByText(email('Bruno'), { exact: true })).toBeVisible();
  await dialog.getByLabel('Adresse e-mail de l’animateur').fill(email('Chloe'));
  await dialog.getByLabel('Droits', { exact: true }).selectOption('viewer');
  await dialog.getByRole('button', { name: 'Partager', exact: true }).click();
  await expect(dialog.getByText(email('Chloe'), { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Fermer' }).click();

  // ---- Bruno edits it from « Partagés avec moi » ----
  await b.page.goto('/editor');
  const card = b.page.getByTestId('shared-quiz').filter({ hasText: title });
  await expect(card.getByText('Peut modifier')).toBeVisible();
  await expect(card.getByText('de Alice')).toBeVisible();
  await card.getByRole('link', { name: 'Modifier' }).click();
  await expect(b.page.getByTestId('shared-access')).toContainText('Quiz de Alice');
  await expect(b.page.getByRole('radio', { name: /Public/ })).toHaveCount(0);
  await expect(b.page.getByRole('button', { name: '👥 Partager' })).toHaveCount(0);
  await b.page.getByLabel('Titre du quiz').fill(`${title} (Bruno)`);
  await b.page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(b.page.getByRole('button', { name: 'Enregistré ✓' })).toBeVisible();

  // ---- Alice saves her stale version → conflict → reload ----
  await a.page.getByLabel('Titre du quiz').fill(`${title} (Alice)`);
  await a.page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(a.page.getByRole('alert')).toContainText('modifié par quelqu’un d’autre');
  await a.page.getByRole('button', { name: '↻ Charger la dernière version' }).click();
  await expect(a.page.getByLabel('Titre du quiz')).toHaveValue(`${title} (Bruno)`);

  // ---- Chloé: read-only, can copy ----
  await c.page.goto(`/editor/${id}`);
  await expect(c.page.getByTestId('shared-access')).toContainText('pas le modifier');
  await expect(c.page.getByLabel('Titre du quiz')).toBeDisabled();
  await expect(c.page.getByRole('button', { name: 'Enregistrer' })).toHaveCount(0);
  await c.page.getByRole('button', { name: 'Copier dans mes quiz' }).click();
  await expect(c.page.getByTestId('shared-access')).toHaveCount(0);
  await expect(c.page.getByLabel('Titre du quiz')).toHaveValue(`${title} (Bruno) (copie)`);
  await expect(c.page.getByLabel('Titre du quiz')).toBeEnabled();

  // ---- Bruno leaves the share ----
  b.page.on('dialog', (d) => void d.accept());
  await b.page.goto('/editor');
  await b.page
    .getByTestId('shared-quiz')
    .filter({ hasText: title })
    .getByRole('button', { name: 'Ne plus voir' })
    .click();
  await expect(b.page.getByTestId('shared-quiz')).toHaveCount(0);

  for (const h of [a, b, c]) await h.context.close();
});
