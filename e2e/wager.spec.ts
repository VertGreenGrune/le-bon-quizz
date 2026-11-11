import { expect, test, devices, type Page } from '@playwright/test';
import type { GameReport, GameSummary, QuizDetail, QuizInput } from '@lbq/shared';

/**
 * « Paris sur les réponses » (T61): a host screen and three phones. Everest = 8849 m. Alice
 * guesses 8000, Bob 7000 then changes it to 8848, Chloé 9000. Bets: Alice and Bob on 8848 (the
 * winning guess: biggest ≤ 8849), Chloé on « Plus petit que tout ». Alice +1000, Bob +1000 +500
 * (author), Chloé 0. Nobody — phones nor TV — receives 8849 before the reveal.
 *
 * Needs a database (host account, DB quiz): runs only when `E2E_DATABASE_URL` is set.
 */
test.skip(!process.env.E2E_DATABASE_URL, 'E2E_DATABASE_URL not set (needs Postgres)');

const SERVER_URL = `http://localhost:${process.env.E2E_SERVER_PORT ?? 3004}`;
const stamp = Date.now();
const SHOTS = process.env.E2E_SHOTS;
/** 8849 as a JSON value (ids and tokens are strings, so only values are looked at). */
const ANSWER_VALUE = /[:,[]8849[,\]}]/;

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

/** `last`: everyone has guessed, the bets start at once (no « Estimation enregistrée »). */
async function guess(page: Page, value: string, last = false) {
  await page.getByLabel('Ton estimation').fill(value);
  await page.getByRole('button', { name: 'Valider' }).click();
  if (!last) await expect(page.getByText('Estimation enregistrée !')).toBeVisible();
}

test('« Paris sur les réponses »: guess, bet, reveal and report', async ({ browser }) => {
  const hostContext = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const reg = await hostContext.request.post(`${SERVER_URL}/api/auth/register`, {
    data: { email: `wager-${stamp}@e2e.test`, name: 'Tim', password: 'password123' },
  });
  expect(reg.status()).toBe(201);
  const input: QuizInput = {
    title: `Paris ${stamp}`,
    questions: [
      {
        type: 'WAGER',
        text: 'Quelle est l’altitude de l’Everest ?',
        wager: { correct: 8849, unit: 'm' },
        timeLimitSec: 30,
        betTimeSec: 20,
        basePoints: 1000,
        explanation: 'Mesure sino-népalaise de 2020.',
      },
    ],
  };
  const created = await hostContext.request.post(`${SERVER_URL}/api/quizzes`, { data: input });
  expect(created.status()).toBe(201);
  const { id: quizId } = (await created.json()) as QuizDetail;

  // ---- Editor: the type and its fields ----
  const host = await hostContext.newPage();
  await host.goto(`/editor/${quizId}`);
  await expect(host.getByRole('radio', { name: 'Paris sur les réponses' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(host.getByLabel('La bonne réponse')).toHaveValue('8849');
  await host.getByLabel('La bonne réponse').scrollIntoViewIfNeeded();
  await shot(host, 'wager-editor');

  // ---- Lobby: three phones, recording what the server sends them; the TV too ----
  const tvFrames: string[] = [];
  host.on('websocket', (ws) =>
    ws.on('framereceived', (f) => tvFrames.push(typeof f.payload === 'string' ? f.payload : '')),
  );
  await host.goto(`/host/new?quizId=${quizId}`);
  await expect(host).toHaveURL(/\/host\/\d{6}$/);
  const pin = new URL(host.url()).pathname.split('/').pop()!;
  const names = ['Alice', 'Bob', 'Chloé'];
  const frames: string[] = [];
  const phones = await Promise.all(
    names.map(async (nickname) => {
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
  const [alice, bob, chloe] = phones.map((p) => p.page) as [Page, Page, Page];
  await host.getByRole('button', { name: 'Commencer' }).click();

  // ---- Stage 1: guesses ----
  await expect(host.getByTestId('question-type')).toHaveText('💰 Paris sur les réponses');
  await expect(host.getByTestId('wager-stage')).toContainText('Estimez le nombre');
  await expect(alice.getByRole('heading', { name: '🎲 Ton estimation' })).toBeVisible();
  await shot(alice, 'wager-phone-guess');
  await guess(alice, '8 000');
  await guess(bob, '7000');
  await expect(host.getByTestId('wager-guessed').getByText('Bob')).toBeVisible();
  await expect(host.getByTestId('wager-guessed').getByText('Alice')).toBeVisible();
  await shot(host, 'wager-tv-guess');
  await shot(bob, 'wager-phone-guessed');
  await bob.getByRole('button', { name: 'Changer mon estimation' }).click();
  await guess(bob, '8848');
  await guess(chloe, '9000', true);

  // ---- Stage 2: bets ----
  const slots = host.getByTestId('wager-slots');
  await expect(slots).toBeVisible();
  await expect(slots.getByRole('listitem')).toHaveText([
    /Plus petit que tout/,
    /8000 m/,
    /8848 m/,
    /9000 m/,
  ]);
  await expect(alice.getByRole('heading', { name: '💰 Ton pari' })).toBeVisible();
  if (SHOTS) await host.waitForTimeout(1000); // the slots slide in
  await shot(host, 'wager-tv-bet');
  await shot(bob, 'wager-phone-bet');
  await alice.getByRole('button', { name: 'Parier sur 8848 m' }).click();
  await expect(alice.getByText('Pari enregistré !')).toBeVisible();
  await bob.getByRole('button', { name: 'Parier sur 8848 m' }).click();
  // Before the reveal: the answer was in no frame, phone nor TV.
  expect(frames.join('\n')).not.toMatch(ANSWER_VALUE);
  expect(tvFrames.join('\n')).not.toMatch(ANSWER_VALUE);
  await chloe.getByRole('button', { name: 'Parier sur Plus petit que tout' }).click();

  // ---- Reveal ----
  await expect(host.getByTestId('wager-correct')).toContainText('8849 m');
  await expect(host.getByTestId('wager-winning')).toContainText('8848 m');
  await expect(host.getByTestId('wager-winning')).toContainText('2 paris');
  await expect(host.getByTestId('wager-points')).toContainText('Pari gagnant : + 1000 pts');
  await expect(host.getByTestId('wager-points')).toContainText('Bob : + 500 pts');
  await expect(alice.getByRole('heading', { name: 'Pari gagné !' })).toBeVisible();
  await expect(alice.getByText('+ 1000 pts')).toBeVisible();
  await expect(bob.getByText('+ 1500 pts')).toBeVisible();
  await expect(bob.getByTestId('wager-result')).toContainText('Ton estimation est la gagnante');
  await expect(chloe.getByRole('heading', { name: 'Pari perdu !' })).toBeVisible();
  await expect(chloe.getByTestId('wager-result')).toContainText('Bonne réponse : 8849 m');
  if (SHOTS) await host.waitForTimeout(2500); // the slots and points fade in
  await shot(host, 'wager-tv-reveal');
  await shot(bob, 'wager-phone-result');
  await shot(chloe, 'wager-phone-lost');

  // ---- Report ----
  await host.getByRole('button', { name: 'Suivant' }).click();
  await host.getByRole('button', { name: 'Voir le podium' }).click();
  await host.getByRole('button', { name: 'Terminer la partie' }).click();
  await expect
    .poll(async () => {
      const list = (await (
        await hostContext.request.get(`${SERVER_URL}/api/games`)
      ).json()) as GameSummary[];
      return list.some((g) => g.quizTitle === input.title);
    })
    .toBe(true);
  const games = (await (
    await hostContext.request.get(`${SERVER_URL}/api/games`)
  ).json()) as GameSummary[];
  const game = games.find((g) => g.quizTitle === input.title)!;
  const report = (await (
    await hostContext.request.get(`${SERVER_URL}/api/games/${game.id}`)
  ).json()) as GameReport;
  expect(report.questions[0]!.details.wager).toMatchObject({ correct: 8849, winning: 2 });
  await host.goto(`/reports/${game.id}`);
  await expect(host.getByText('2 / 3 joueurs ont gagné leur pari')).toBeVisible();
  await expect(host.getByTestId('wager-report')).toContainText('8848 m');
  await shot(host, 'wager-report');

  for (const p of phones) await p.context.close();
  await hostContext.close();
});
