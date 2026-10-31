import { expect, test, devices, type Page } from '@playwright/test';
import type { GameReport, GameSummary, QuizDetail, QuizInput } from '@lbq/shared';

/**
 * T44 « ✅ Accepter aussi cette réponse »: the quiz marks the wrong choice (Sydney); Bob picked the
 * real answer (Canberra) → the host accepts it from the remote → Bob's phone shows the accepted
 * result and the leaderboard has his points. Then a typed answer accepted from the TV, and the
 * report says what was accepted.
 *
 * Needs a database (host account, DB quiz): runs only when `E2E_DATABASE_URL` is set.
 */
test.skip(!process.env.E2E_DATABASE_URL, 'E2E_DATABASE_URL not set (needs Postgres)');

const SERVER_URL = `http://localhost:${process.env.E2E_SERVER_PORT ?? 3004}`;
const stamp = Date.now();

test('the host accepts a refused answer from the remote and the TV', async ({
  browser,
  baseURL,
}) => {
  const tvContext = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const reg = await tvContext.request.post(`${SERVER_URL}/api/auth/register`, {
    data: { email: `accept-${stamp}@e2e.test`, name: 'Anna', password: 'password123' },
  });
  expect(reg.status()).toBe(201);
  const input: QuizInput = {
    title: `Accepter ${stamp}`,
    questions: [
      {
        type: 'MCQ',
        text: 'Quelle est la capitale de l’Australie ?',
        timeLimitSec: 60,
        basePoints: 1000,
        // The mistake: Sydney marked right.
        choices: [
          { text: 'Sydney', isCorrect: true },
          { text: 'Canberra', isCorrect: false },
          { text: 'Melbourne', isCorrect: false },
        ],
      },
      {
        type: 'TYPE_ANSWER',
        text: 'Le plus grand océan ?',
        timeLimitSec: 60,
        basePoints: 1000,
        acceptedAnswers: ['Atlantique'],
        typoTolerance: true,
      },
    ],
  };
  const created = await tvContext.request.post(`${SERVER_URL}/api/quizzes`, { data: input });
  expect(created.status()).toBe(201);
  const { id: quizId } = (await created.json()) as QuizDetail;

  // ---- TV + remote ----
  const tv = await tvContext.newPage();
  tv.on('dialog', (d) => void d.accept());
  await tv.goto(`/host/new?quizId=${quizId}`);
  await expect(tv).toHaveURL(/\/host\/\d{6}$/);
  const pin = new URL(tv.url()).pathname.split('/').pop()!;
  await tv.getByRole('button', { name: /📱 Télécommande/ }).click();
  const link = new URL((await tv.getByTestId('remote-link').getAttribute('href'))!);
  const remoteContext = await browser.newContext({ ...devices['Pixel 7'] });
  const remote = await remoteContext.newPage();
  await remote.goto(`${baseURL}${link.pathname}${link.hash}`);
  await expect(tv.getByText('✅ Télécommande connectée')).toBeVisible();
  await tv.getByRole('button', { name: 'Fermer' }).click();

  // ---- Two players ----
  const phones = await Promise.all(
    ['Alice', 'Bob'].map(async (nickname) => {
      const context = await browser.newContext({ ...devices['Pixel 7'] });
      const page = await context.newPage();
      await page.goto(`/join?pin=${pin}`);
      await page.getByPlaceholder('Ton pseudo').fill(nickname);
      await page.getByRole('button', { name: 'Entrer' }).click();
      await expect(tv.getByRole('button', { name: nickname })).toBeVisible();
      return { context, page };
    }),
  );
  const [alice, bob] = phones.map((p) => p.page) as [Page, Page];
  await remote.getByTestId('remote-main').click(); // « Commencer »

  // ---- Question 1: the quiz's answer is wrong ----
  await expect(
    tv.getByRole('heading', { name: 'Quelle est la capitale de l’Australie ?' }),
  ).toBeVisible();
  await alice.getByRole('button', { name: 'Réponse ▲' }).click(); // Sydney
  await bob.getByRole('button', { name: 'Réponse ◆' }).click(); // Canberra
  await expect(bob.getByRole('heading', { name: 'Raté !' })).toBeVisible();
  await expect(alice.getByRole('heading', { name: 'Correct !' })).toBeVisible();

  const panel = remote.getByTestId('accept-panel');
  await expect(panel).toContainText('Corriger la réponse');
  await panel
    .getByRole('listitem')
    .filter({ hasText: 'Canberra' })
    .getByRole('button', { name: '✅ Accepter' })
    .click();
  await expect(bob.getByRole('heading', { name: 'Correct !' })).toBeVisible();
  await expect(bob.getByTestId('accepted-note')).toHaveText(
    /^✅ Réponse acceptée par l’animateur\s!$/,
  );
  await expect(bob.getByText(/^\+ \d+ pts$/)).toBeVisible();
  await expect(alice.getByRole('heading', { name: 'Correct !' })).toBeVisible();
  await expect(alice.getByTestId('accepted-note')).toHaveCount(0);
  await expect(tv.getByTestId('accepted-tag')).toHaveText('✅ Acceptée');
  await expect(panel.getByRole('listitem').filter({ hasText: 'Canberra' })).toContainText(
    '✅ Acceptée',
  );

  // ---- The leaderboard has Bob's points ----
  await remote.getByTestId('remote-main').click(); // « Suivant » → classement
  await expect(remote.getByTestId('remote-phase')).toHaveText('Classement');
  await expect(tv.getByTestId('gain')).toHaveCount(2);
  for (const gain of await tv.getByTestId('gain').all()) await expect(gain).not.toHaveText('+0');
  // Once accepted, it's too late after « Suivant »: no more buttons.
  await expect(tv.getByTestId('accept-button')).toHaveCount(0);

  // ---- Question 2: a typed answer accepted from the TV ----
  await remote.getByTestId('remote-main').click();
  await expect(tv.getByRole('heading', { name: 'Le plus grand océan ?' })).toBeVisible();
  for (const [page, text] of [
    [alice, 'Pacifique'],
    [bob, 'Atlantique'],
  ] as const) {
    await page.getByRole('textbox', { name: 'Ta réponse' }).fill(text);
    await page.getByRole('button', { name: 'Valider' }).click();
  }
  await expect(alice.getByRole('heading', { name: 'Raté !' })).toBeVisible();
  // The remote lists every typed group.
  await expect(panel.getByRole('listitem')).toHaveCount(2);
  await tv
    .getByRole('listitem')
    .filter({ hasText: 'Pacifique' })
    .getByRole('button', { name: '✅ Accepter' })
    .click();
  await expect(alice.getByRole('heading', { name: 'Correct !' })).toBeVisible();
  await expect(alice.getByTestId('accepted-note')).toBeVisible();
  await expect(tv.getByTestId('accepted-tag')).toHaveText('✅ Réponse acceptée');

  await tv.getByRole('button', { name: 'Suivant' }).click();
  await tv.getByRole('button', { name: 'Voir le podium' }).click();
  await tv.getByRole('button', { name: 'Terminer la partie' }).click();

  // ---- Report ----
  const findGame = async () => {
    const res = await tvContext.request.get(`${SERVER_URL}/api/games`);
    return ((await res.json()) as GameSummary[]).find((g) => g.quizTitle === input.title);
  };
  await expect.poll(findGame).toBeDefined();
  const game = (await findGame())!;
  const report = (await (
    await tvContext.request.get(`${SERVER_URL}/api/games/${game.id}`)
  ).json()) as GameReport;
  expect(report.questions[0]).toMatchObject({
    correctIndexes: [0, 1],
    correctCount: 2,
    details: { accepted: { choiceIndexes: [1] } },
  });
  expect(report.questions[1]).toMatchObject({
    correctCount: 2,
    details: { accepted: { texts: ['Pacifique'] } },
  });
  await tv.goto(`/reports/${game.id}`);
  await expect(tv.getByTestId('report-accepted')).toHaveText([
    /par l’animateur\s: Canberra$/,
    /par l’animateur\s: « Pacifique »$/,
  ]);

  await Promise.all([
    tvContext.close(),
    remoteContext.close(),
    ...phones.map((p) => p.context.close()),
  ]);
});
