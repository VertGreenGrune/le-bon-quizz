import { expect, test, devices, type Page } from '@playwright/test';
import type { GameReport, GameSummary, QuizDetail, QuizInput } from '@lbq/shared';

/**
 * T37: a « select all » question (2 right answers) with an explanation. Alice ticks exactly the
 * right shapes (correct), Bob only one of them (wrong); then the explanation on the TV, the phones
 * and the report. The phones never get the explanation before the reveal.
 *
 * Needs a database (host account, DB quiz): runs only when `E2E_DATABASE_URL` is set.
 */
test.skip(!process.env.E2E_DATABASE_URL, 'E2E_DATABASE_URL not set (needs Postgres)');

const SERVER_URL = `http://localhost:${process.env.E2E_SERVER_PORT ?? 3004}`;
const stamp = Date.now();
const EXPLANATION = 'Le bleu et le rouge sont les couleurs de Paris, le blanc celle du roi.';

test('« select all » question and « Le saviez-vous ? » explanation, up to the report', async ({
  browser,
}) => {
  const hostContext = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const reg = await hostContext.request.post(`${SERVER_URL}/api/auth/register`, {
    data: { email: `explain-${stamp}@e2e.test`, name: 'Marianne', password: 'password123' },
  });
  expect(reg.status()).toBe(201);
  const input: QuizInput = {
    title: `Le saviez-vous ${stamp}`,
    questions: [
      {
        type: 'MCQ',
        text: 'Quelles couleurs sont sur le drapeau français ?',
        timeLimitSec: 60,
        basePoints: 1000,
        choices: [
          { text: 'Bleu', isCorrect: true },
          { text: 'Vert', isCorrect: false },
          { text: 'Rouge', isCorrect: true },
          { text: 'Jaune', isCorrect: false },
        ],
        explanation: EXPLANATION,
      },
    ],
  };
  const created = await hostContext.request.post(`${SERVER_URL}/api/quizzes`, { data: input });
  expect(created.status()).toBe(201);
  const { id: quizId } = (await created.json()) as QuizDetail;

  // ---- Editor: the explanation field and the « several right answers » hint ----
  const host = await hostContext.newPage();
  await host.goto(`/editor/${quizId}`);
  await expect(host.getByRole('textbox', { name: 'Explication' })).toHaveValue(EXPLANATION);
  await expect(host.getByTestId('multiple-hint')).toContainText(
    'les joueurs devront toutes les cocher pour marquer',
  );

  // ---- Lobby: two phones, recording what the server sends them ----
  await host.goto(`/host/new?quizId=${quizId}`);
  await expect(host).toHaveURL(/\/host\/\d{6}$/);
  const pin = new URL(host.url()).pathname.split('/').pop()!;
  const frames: string[] = [];
  const phones = await Promise.all(
    ['Alice', 'Bob'].map(async (nickname) => {
      const context = await browser.newContext({ ...devices['Pixel 7'] });
      const page = await context.newPage();
      page.on('websocket', (ws) =>
        ws.on('framereceived', (f) => frames.push(typeof f.payload === 'string' ? f.payload : '')),
      );
      await page.goto(`/join?pin=${pin}`);
      await page.getByPlaceholder('Ton pseudo').fill(nickname);
      await page.getByRole('button', { name: 'Entrer' }).click();
      await expect(host.getByRole('button', { name: nickname })).toBeVisible();
      return { context, page };
    }),
  );
  const [alice, bob] = phones.map((p) => p.page) as [Page, Page];
  await host.getByRole('button', { name: 'Commencer' }).click();

  // ---- The question: toggles + « Valider » on the phones, a hint on the TV ----
  await expect(host.getByText('☑️ Plusieurs réponses possibles')).toBeVisible();
  await expect(alice.getByTestId('multiple-hint')).toContainText('coche toutes les bonnes');
  const validate = (page: Page) => page.getByRole('button', { name: /^Valider/ });
  await expect(validate(alice)).toBeDisabled();
  // Tick ▲ ◆ ●, untick ◆: ▲ + ● = Bleu + Rouge.
  for (const shape of ['▲', '◆', '●', '◆'])
    await alice.getByRole('button', { name: `Réponse ${shape}` }).click();
  await expect(alice.getByRole('button', { name: 'Réponse ▲' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(alice.getByRole('button', { name: 'Réponse ◆' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await validate(alice).click();
  await expect(alice.getByText('Réponse envoyée !')).toBeVisible();
  await bob.getByRole('button', { name: 'Réponse ▲' }).click();
  // Nothing about the explanation reached a phone before the reveal.
  expect(frames.join('\n')).toContain('"multiple":true');
  expect(frames.join('\n')).not.toContain('couleurs de Paris');
  await validate(bob).click();

  // ---- Reveal: exact set wins, a subset loses; the explanation everywhere ----
  await expect(alice.getByRole('heading', { name: 'Correct !' })).toBeVisible();
  await expect(alice.getByTestId('explanation')).toContainText(EXPLANATION);
  await expect(bob.getByRole('heading', { name: 'Raté !' })).toBeVisible();
  await expect(bob.getByTestId('multiple-result')).toContainText('Il fallait cocher');
  await expect(bob.getByTestId('explanation')).toContainText('Le saviez-vous ?');
  await expect(host.getByTestId('all-found')).toHaveText('1 joueur a tout trouvé');
  await expect(host.getByTestId('explanation')).toContainText(EXPLANATION);
  // Still there after a host reload during the reveal.
  await host.reload();
  await expect(host.getByTestId('explanation')).toContainText(EXPLANATION);

  await host.getByRole('button', { name: 'Voir le podium' }).click();
  await host.getByRole('button', { name: 'Terminer la partie' }).click();

  // ---- Report ----
  const findGame = async () => {
    const res = await hostContext.request.get(`${SERVER_URL}/api/games`);
    return ((await res.json()) as GameSummary[]).find((g) => g.quizTitle === input.title);
  };
  await expect.poll(findGame).toBeDefined();
  const game = (await findGame())!;
  const report = (await (
    await hostContext.request.get(`${SERVER_URL}/api/games/${game.id}`)
  ).json()) as GameReport;
  expect(report.questions[0]).toMatchObject({
    correctCount: 1,
    distribution: [2, 0, 1, 0],
    explanation: EXPLANATION,
    details: { multiple: { allFound: 1 } },
  });
  await host.goto(`/reports/${game.id}`);
  await expect(host.getByTestId('report-explanation')).toContainText(EXPLANATION);
  await expect(host.getByText('1 joueur a tout coché juste')).toBeVisible();

  await Promise.all([hostContext.close(), ...phones.map((p) => p.context.close())]);
});
