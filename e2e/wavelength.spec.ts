import { expect, test, devices, type Page } from '@playwright/test';
import type { GameReport, GameSummary, QuizDetail, QuizInput } from '@lbq/shared';

/**
 * « Sur la même longueur d'onde » (T62): a host screen and three phones. Alice (first to join) is
 * the psychic: only her phone gets the secret target. Her first clue uses a word of the scale and
 * is refused; she reloads her phone (the target comes back), then sends « Un bon thé ». Bob puts
 * the needle on the target (+1000, « 🎯 Pile dessus ! »), Chloé at the far end (0); Alice gets the
 * average (+500). Neither the TV nor Bob / Chloé receive the target before the reveal.
 *
 * Needs a database (host account, DB quiz): runs only when `E2E_DATABASE_URL` is set.
 */
test.skip(!process.env.E2E_DATABASE_URL, 'E2E_DATABASE_URL not set (needs Postgres)');

const SERVER_URL = `http://localhost:${process.env.E2E_SERVER_PORT ?? 3004}`;
const stamp = Date.now();
const SHOTS = process.env.E2E_SHOTS;

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

const recordFrames = (page: Page, into: string[]) =>
  page.on('websocket', (ws) =>
    ws.on('framereceived', (f) => into.push(typeof f.payload === 'string' ? f.payload : '')),
  );

test('« Sur la même longueur d’onde »: clue, needles, reveal and report', async ({ browser }) => {
  const hostContext = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const reg = await hostContext.request.post(`${SERVER_URL}/api/auth/register`, {
    data: { email: `wavelength-${stamp}@e2e.test`, name: 'Tim', password: 'password123' },
  });
  expect(reg.status()).toBe(201);
  const input: QuizInput = {
    title: `Onde ${stamp}`,
    questions: [
      {
        type: 'WAVELENGTH',
        text: 'Sur la même longueur d’onde : où est la cible ?',
        spectra: [{ left: 'Froid', right: 'Chaud' }],
        clueTimeSec: 60,
        timeLimitSec: 60,
        basePoints: 1000,
        explanation:
          'Wavelength est un jeu de société de 2019 : un médium fait deviner une position sur un cadran avec un seul indice.',
      },
    ],
  };
  const created = await hostContext.request.post(`${SERVER_URL}/api/quizzes`, { data: input });
  expect(created.status()).toBe(201);
  const { id: quizId } = (await created.json()) as QuizDetail;

  // ---- Editor: the type and its fields ----
  const host = await hostContext.newPage();
  await host.goto(`/editor/${quizId}`);
  await expect(host.getByRole('radio', { name: 'Sur la même longueur d’onde' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(host.getByLabel('Échelles')).toHaveValue('Froid / Chaud');
  await host.getByLabel('Échelles').scrollIntoViewIfNeeded();
  await shot(host, 'wavelength-editor');

  // ---- Lobby: three phones, recording what the server sends them; the TV too ----
  const tvFrames: string[] = [];
  recordFrames(host, tvFrames);
  await host.goto(`/host/new?quizId=${quizId}`);
  await expect(host).toHaveURL(/\/host\/\d{6}$/);
  const pin = new URL(host.url()).pathname.split('/').pop()!;
  const names = ['Alice', 'Bob', 'Chloé'];
  const frames: Record<string, string[]> = { Alice: [], Bob: [], Chloé: [] };
  const phones = [];
  for (const nickname of names) {
    const context = await browser.newContext({ ...devices['Pixel 7'] });
    const page = await context.newPage();
    recordFrames(page, frames[nickname]!);
    await page.goto(`/join?pin=${pin}`);
    await page.getByPlaceholder('Ton pseudo').fill(nickname);
    await page.getByRole('button', { name: 'Entrer' }).click();
    await expect(host.getByRole('button', { name: nickname })).toBeVisible();
    phones.push({ context, page });
  }
  const [alice, bob, chloe] = phones.map((p) => p.page) as [Page, Page, Page];
  await host.getByRole('button', { name: 'Commencer' }).click();

  // ---- Intro: who gives the clue ----
  await expect(host.getByText('Alice va voir la cible et donner un indice !')).toBeVisible();
  await shot(host, 'wavelength-tv-intro');

  // ---- Stage 1: the clue ----
  await expect(host.getByTestId('question-type')).toHaveText('🔮 Sur la même longueur d’onde');
  await expect(host.getByTestId('wavelength-stage')).toContainText('Alice cherche un indice');
  await expect(alice.getByRole('heading', { name: '🔮 Toi seul vois la cible !' })).toBeVisible();
  await expect(bob.getByRole('heading', { name: '🔮 Alice cherche un indice…' })).toBeVisible();
  await expect(alice.getByTestId('wavelength-target')).toBeVisible();
  await expect(bob.getByTestId('wavelength-target')).toHaveCount(0);
  const target = Number(/"target":(\d+)/.exec(frames.Alice!.join('\n'))![1]);
  expect(target).toBeGreaterThanOrEqual(10);
  expect(target).toBeLessThanOrEqual(90);
  await shot(host, 'wavelength-tv-clue');
  await shot(bob, 'wavelength-phone-wait');
  await alice.getByLabel('Ton indice').fill('Pas trop chaud');
  await alice.getByRole('button', { name: 'Envoyer l’indice' }).click();
  await expect(alice.getByRole('alert')).toContainText('ne doit pas reprendre');
  await shot(alice, 'wavelength-phone-clue');
  // The psychic's phone reloads: the target zone comes back.
  await alice.reload();
  await expect(alice.getByTestId('wavelength-target')).toBeVisible();
  await alice.getByLabel('Ton indice').fill('Un bon thé');
  await alice.getByRole('button', { name: 'Envoyer l’indice' }).click();

  // ---- Stage 2: the needles ----
  await expect(host.getByTestId('wavelength-clue')).toHaveText('« Un bon thé »');
  await expect(bob.getByTestId('wavelength-phone-clue')).toHaveText('« Un bon thé »');
  await expect(alice.getByRole('heading', { name: 'Les autres cherchent…' })).toBeVisible();
  if (SHOTS) await host.waitForTimeout(800);
  await shot(host, 'wavelength-tv-guess');
  await shot(alice, 'wavelength-phone-psychic');
  await bob.getByLabel('Ton aiguille').fill(String(target));
  await shot(bob, 'wavelength-phone-needle');
  await bob.getByRole('button', { name: 'Valider' }).click();
  await expect(bob.getByText('Réponse envoyée !')).toBeVisible();
  await shot(bob, 'wavelength-phone-answered');
  // Before the reveal: the target only ever reached Alice's phone.
  const leak = /"target":/;
  expect(frames.Bob!.join('\n')).not.toMatch(leak);
  expect(frames.Chloé!.join('\n')).not.toMatch(leak);
  expect(tvFrames.join('\n')).not.toMatch(leak);
  await chloe.getByLabel('Ton aiguille').fill(target > 50 ? '0' : '100');
  await chloe.getByRole('button', { name: 'Valider' }).click();

  // ---- Reveal ----
  await expect(host.getByTestId('wavelength-reveal')).toBeVisible();
  await expect(host.getByTestId('wavelength-needle')).toHaveCount(2);
  await expect(host.getByTestId('wavelength-summary')).toContainText('🎯 Pile dessus : Bob');
  await expect(host.getByTestId('wavelength-summary')).toContainText('Alice : + 500 pts');
  await expect(bob.getByRole('heading', { name: '🎯 Pile dessus !' })).toBeVisible();
  await expect(bob.getByText('+ 1000 pts')).toBeVisible();
  await expect(chloe.getByRole('heading', { name: 'Raté !' })).toBeVisible();
  await expect(alice.getByRole('heading', { name: 'Bien joué, médium !' })).toBeVisible();
  await expect(alice.getByText('+ 500 pts')).toBeVisible();
  await expect(host.getByTestId('explanation')).toBeVisible();
  await expect(host.getByRole('button', { name: 'Suivant' })).toBeInViewport();
  if (SHOTS) await host.waitForTimeout(2500);
  await shot(host, 'wavelength-tv-reveal');
  await shot(bob, 'wavelength-phone-result');
  await shot(alice, 'wavelength-phone-psychic-result');

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
  expect(report.questions[0]!.details.wavelength).toMatchObject({
    target,
    clue: 'Un bon thé',
    psychicPoints: 500,
  });
  await host.goto(`/reports/${game.id}`);
  await expect(host.getByText('1 / 3 joueur')).toBeVisible();
  await expect(host.getByTestId('wavelength-report')).toContainText('Un bon thé');
  await shot(host, 'wavelength-report');

  for (const p of phones) await p.context.close();
  await hostContext.close();
});
