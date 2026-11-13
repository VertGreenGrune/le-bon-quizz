import { expect, test, type Page } from '@playwright/test';
import { CLASSIC_DEMO_QUIZ, type QuizDetail } from '@lbq/shared';
import { answerOnPhone } from './answers';

/**
 * « 🧪 Tester » (T66): from the editor, one question is played in a test game opened in a new
 * tab; the TV opens a phone window; nothing is saved (no history, no « joué » count).
 *
 * Needs a database (host account, DB quiz): runs only when `E2E_DATABASE_URL` is set.
 */
test.skip(!process.env.E2E_DATABASE_URL, 'E2E_DATABASE_URL not set (needs Postgres)');

const SERVER_URL = `http://localhost:${process.env.E2E_SERVER_PORT ?? 3004}`;

test('test one question from the editor', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const reg = await ctx.request.post(`${SERVER_URL}/api/auth/register`, {
    data: { email: `test-${Date.now()}@e2e.test`, name: 'Testeur', password: 'password123' },
  });
  expect(reg.status()).toBe(201);
  const { id: _id, ...input } = CLASSIC_DEMO_QUIZ;
  const created = await ctx.request.post(`${SERVER_URL}/api/quizzes`, { data: input });
  const { id } = (await created.json()) as QuizDetail;

  const editor = await ctx.newPage();
  await editor.goto(`/editor/${id}`);
  const q = 2;
  await editor
    .getByRole('navigation', { name: 'Questions' })
    .getByRole('button', { name: new RegExp(`^${q + 1}`) })
    .click();
  const [tv] = await Promise.all([
    ctx.waitForEvent('page'),
    editor.getByRole('button', { name: '🧪 Tester cette question' }).click(),
  ]);
  await expect(tv).toHaveURL(/\/host\/\d{6}$/);
  await expect(tv.getByTestId('test-badge')).toBeVisible();
  await expect(tv.getByTestId('test-lobby')).toContainText('rien n’est enregistré');

  // « 📱 Ouvrir un téléphone »: a small window on the join page of this game.
  const [phone] = (await Promise.all([
    ctx.waitForEvent('page'),
    tv.getByRole('button', { name: '📱 Ouvrir un téléphone' }).click(),
  ])) as [Page, unknown];
  await expect(phone).toHaveURL(/\/join\?pin=\d{6}$/);
  await phone.getByPlaceholder('Ton pseudo').fill('Moi');
  await phone.getByRole('button', { name: 'Entrer' }).click();
  await expect(phone.getByText('Partie de test')).toBeVisible();

  // Only that question.
  await tv.getByRole('button', { name: 'Commencer' }).click();
  const question = CLASSIC_DEMO_QUIZ.questions[q]!;
  await expect(tv.getByText('Question 1 / 1').first()).toBeVisible();
  await expect(tv.getByRole('heading', { name: question.text })).toBeVisible();
  await answerOnPhone(phone, question, 'right');
  await tv.getByRole('button', { name: 'Voir le podium' }).click();
  await expect(tv.getByRole('heading', { name: 'Podium' })).toBeVisible();
  await tv.getByRole('button', { name: 'Terminer la partie' }).click();
  await expect(tv.getByRole('link', { name: "Retour à l'accueil" })).toBeVisible();

  // Nothing saved.
  const games = await ctx.request.get(`${SERVER_URL}/api/games`);
  expect(await games.json()).toEqual([]);
  const quizzes = (await (await ctx.request.get(`${SERVER_URL}/api/quizzes`)).json()) as {
    id: string;
    playCount: number;
  }[];
  expect(quizzes.find((x) => x.id === id)?.playCount).toBe(0);
  await ctx.close();
});
