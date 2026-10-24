import { expect, test, devices, type Page } from '@playwright/test';
import type { GameReport, GameSummary, QuizDetail, QuizInput } from '@lbq/shared';

/**
 * T28 « Buzzer »: a host screen and 3 phones. Question 1: Bob buzzes first, the host screen is
 * reloaded while he has the hand, ❌ → Bob is out, Alice buzzes, ✅ → Alice wins. Question 2:
 * nobody buzzes before the timer → nobody scores. The phones never get the answer before the
 * reveal. Then the game report.
 *
 * Needs a database (host account, DB quiz): runs only when `E2E_DATABASE_URL` is set.
 */
test.skip(!process.env.E2E_DATABASE_URL, 'E2E_DATABASE_URL not set (needs Postgres)');

const SERVER_URL = `http://localhost:${process.env.E2E_SERVER_PORT ?? 3004}`;
const stamp = Date.now();

test('buzzer round: first buzz, host reload, wrong then right answer, no winner', async ({
  browser,
}) => {
  const hostContext = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const reg = await hostContext.request.post(`${SERVER_URL}/api/auth/register`, {
    data: { email: `buzzer-${stamp}@e2e.test`, name: 'Tim', password: 'password123' },
  });
  expect(reg.status()).toBe(201);
  const input: QuizInput = {
    title: `Buzzer ${stamp}`,
    questions: [
      {
        type: 'MCQ',
        text: 'Qui a réalisé Beetlejuice ?',
        timeLimitSec: 60,
        basePoints: 1000,
        buzzer: true,
        choices: [
          { text: 'Tim Burton', isCorrect: true },
          { text: 'Sam Raimi', isCorrect: false },
        ],
      },
      {
        type: 'TYPE_ANSWER',
        text: 'Le plus grand océan ?',
        timeLimitSec: 5,
        basePoints: 1000,
        buzzer: true,
        acceptedAnswers: ['Pacifique'],
        typoTolerance: true,
      },
    ],
  };
  const created = await hostContext.request.post(`${SERVER_URL}/api/quizzes`, { data: input });
  expect(created.status()).toBe(201);
  const { id: quizId } = (await created.json()) as QuizDetail;

  // ---- Editor: the option is shown, checked ----
  const host = await hostContext.newPage();
  await host.goto(`/editor/${quizId}`);
  await expect(host.getByRole('checkbox', { name: /Buzzer/ })).toBeChecked();

  // ---- Lobby: three phones, recording what the server sends them ----
  await host.goto(`/host/new?quizId=${quizId}`);
  await expect(host).toHaveURL(/\/host\/\d{6}$/);
  const pin = new URL(host.url()).pathname.split('/').pop()!;
  const frames: string[] = [];
  const phones = await Promise.all(
    ['Alice', 'Bob', 'Chloé'].map(async (nickname) => {
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

  // ---- 1. Bob buzzes first ----
  await expect(host.getByRole('heading', { name: 'Qui a réalisé Beetlejuice ?' })).toBeVisible();
  await expect(host.getByText('Buzzez sur vos téléphones !')).toBeVisible();
  await expect(host.getByText('Tim Burton')).toHaveCount(0); // no choices on the TV
  for (const phone of [alice, bob, chloe])
    await expect(phone.getByRole('button', { name: 'BUZZ' })).toBeEnabled();
  await bob.getByRole('button', { name: 'BUZZ' }).click();
  await expect(host.getByTestId('buzzer-holder')).toContainText('Bob a buzzé !');
  await expect(bob.getByRole('heading', { name: 'À toi !' })).toBeVisible();
  await expect(alice.getByTestId('buzzer-taken')).toContainText('Bob a la main…');
  await expect(alice.getByRole('button', { name: 'BUZZ' })).toBeDisabled();

  // The timer is frozen while Bob answers out loud.
  const clock = alice.getByTestId('countdown');
  const frozenAt = await clock.innerText();
  await alice.waitForTimeout(2500);
  await expect(clock).toHaveText(frozenAt);

  // ---- The host screen is reloaded while Bob has the hand ----
  await host.reload();
  await expect(host.getByTestId('buzzer-holder')).toContainText('Bob a buzzé !');
  await host.getByRole('button', { name: /Voir la réponse/ }).click();
  await expect(host.getByTestId('buzzer-answer')).toContainText('Tim Burton');
  await host.getByRole('button', { name: '❌ Mauvaise réponse' }).click();
  await expect(host.getByTestId('buzzer-wrong')).toContainText('Bob');
  await expect(bob.getByRole('heading', { name: 'Raté !' })).toBeVisible();
  await expect(bob.getByText('Tu ne peux plus buzzer sur cette question.')).toBeVisible();
  // Nothing sent to the phones so far carries the answer.
  expect(frames.filter((f) => f.includes('Tim Burton'))).toEqual([]);

  // ---- Alice buzzes, ✅ ----
  await alice.getByRole('button', { name: 'BUZZ' }).click();
  await expect(host.getByTestId('buzzer-holder')).toContainText('Alice a buzzé !');
  await host.getByRole('button', { name: '✅ Bonne réponse' }).click();
  await expect(host.getByTestId('buzzer-reveal')).toContainText('Alice a trouvé !');
  await expect(host.getByTestId('buzzer-reveal')).toContainText('Tim Burton');
  await expect(alice.getByRole('heading', { name: 'Bien joué !' })).toBeVisible();
  await expect(alice.getByText('+ 1000 pts')).toBeVisible();
  await expect(alice.getByText('Bonne réponse : Tim Burton')).toBeVisible();
  await expect(bob.getByRole('heading', { name: 'Raté !' })).toBeVisible();
  await expect(chloe.getByRole('heading', { name: 'Alice a été plus rapide' })).toBeVisible();

  // ---- 2. Nobody buzzes before the timer ends ----
  await host.getByRole('button', { name: 'Suivant' }).click();
  await host.getByRole('button', { name: 'Question suivante' }).click();
  await expect(host.getByRole('heading', { name: 'Le plus grand océan ?' })).toBeVisible();
  await expect(chloe.getByRole('button', { name: 'BUZZ' })).toBeVisible();
  await expect(host.getByTestId('buzzer-reveal')).toContainText('Personne n’a trouvé', {
    timeout: 15_000,
  });
  await expect(chloe.getByRole('heading', { name: 'Personne n’a trouvé' })).toBeVisible();
  await expect(chloe.getByText('+ 0 pt')).toBeVisible();

  await host.getByRole('button', { name: 'Suivant' }).click();
  await host.getByRole('button', { name: 'Voir le podium' }).click();
  await host.getByRole('button', { name: 'Terminer la partie' }).click();

  // ---- Report ----
  await expect
    .poll(async () => {
      const games = (await (
        await hostContext.request.get(`${SERVER_URL}/api/games`)
      ).json()) as GameSummary[];
      return games.length;
    })
    .toBe(1);
  const [game] = (await (
    await hostContext.request.get(`${SERVER_URL}/api/games`)
  ).json()) as GameSummary[];
  const report = (await (
    await hostContext.request.get(`${SERVER_URL}/api/games/${game!.id}`)
  ).json()) as GameReport;
  expect(report.results[0]).toMatchObject({ nickname: 'Alice', score: 1000 });
  expect(report.questions[0]!.details.buzzer).toMatchObject({
    answer: ['Tim Burton'],
    winner: { nickname: 'Alice' },
    wrong: [{ nickname: 'Bob' }],
  });
  await host.goto(`/reports/${game!.id}`);
  // Hardest questions first: nobody found the ocean.
  const cards = host.getByTestId('buzzer-report');
  await expect(cards.first()).toContainText(/Trouvée par :\s*personne/);
  await expect(cards.last()).toContainText(/Trouvée par :\s*Alice\s*Mauvaises réponses :\s*Bob/);

  for (const p of phones) await p.context.close();
  await hostContext.close();
});
