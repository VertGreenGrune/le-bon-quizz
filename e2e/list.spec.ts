import { expect, test, devices, type Page } from '@playwright/test';
import type { GameReport, GameSummary, QuizDetail, QuizInput } from '@lbq/shared';

/**
 * « Liste chrono » (T57): a host screen and two phones. Alice finds every item (a typo, another
 * spelling, a repeat), Bob only one; the TV counts them live without showing them, then reveals
 * every item with its finders; the report keeps it. The phones never receive the items before.
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

async function guess(page: Page, text: string) {
  await page.getByLabel('Une réponse').fill(text);
  await page.getByRole('button', { name: 'OK' }).click();
}

test('« Liste chrono »: live counts on the TV, partial points, reveal and report', async ({
  browser,
}) => {
  const hostContext = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const reg = await hostContext.request.post(`${SERVER_URL}/api/auth/register`, {
    data: { email: `list-${stamp}@e2e.test`, name: 'Tim', password: 'password123' },
  });
  expect(reg.status()).toBe(201);
  const input: QuizInput = {
    title: `Liste chrono ${stamp}`,
    questions: [
      {
        type: 'LIST',
        text: 'Citez les 4 Tortues Ninja',
        items: ['Leonardo | Léonard', 'Michelangelo', 'Donatello', 'Raphael | Raphaël'],
        typoTolerance: true,
        timeLimitSec: 60,
        basePoints: 1000,
        explanation: 'Leurs noms viennent de peintres de la Renaissance.',
      },
    ],
  };
  const created = await hostContext.request.post(`${SERVER_URL}/api/quizzes`, { data: input });
  expect(created.status()).toBe(201);
  const { id: quizId } = (await created.json()) as QuizDetail;

  // ---- Editor: the type and its items, one per line ----
  const host = await hostContext.newPage();
  await host.goto(`/editor/${quizId}`);
  await expect(host.getByRole('radio', { name: 'Liste chrono' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(host.getByLabel('Éléments à trouver')).toHaveValue(
    'Leonardo | Léonard\nMichelangelo\nDonatello\nRaphael | Raphaël',
  );
  await shot(host, 'list-editor');

  // ---- Lobby: two phones, recording what the server sends them ----
  await host.goto(`/host/new?quizId=${quizId}`);
  await expect(host).toHaveURL(/\/host\/\d{6}$/);
  const pin = new URL(host.url()).pathname.split('/').pop()!;
  const frames: Record<string, string[]> = { Alice: [], Bob: [] };
  const phones = await Promise.all(
    ['Alice', 'Bob'].map(async (nickname) => {
      const context = await browser.newContext({ ...devices['Pixel 7'] });
      const page = await context.newPage();
      page.on('websocket', (ws) =>
        ws.on('framereceived', (f) =>
          frames[nickname]!.push(typeof f.payload === 'string' ? f.payload : ''),
        ),
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

  // ---- Answering ----
  await expect(host.getByTestId('question-type')).toHaveText('📝 Liste chrono');
  await expect(alice.getByTestId('list-count')).toHaveText('0 / 4');
  await guess(alice, 'leonard');
  await expect(alice.getByTestId('list-feedback')).toHaveText('✅ Leonardo !');
  await guess(alice, 'Michelangel');
  await expect(alice.getByTestId('list-count')).toHaveText('2 / 4');
  await guess(alice, 'Leonardo');
  await expect(alice.getByTestId('list-feedback')).toHaveText('Déjà trouvé : Leonardo');
  await guess(alice, 'Splinter');
  await expect(alice.getByTestId('list-feedback')).toHaveText('Non, pas « Splinter »…');
  await guess(bob, 'donatello');
  await expect(bob.getByTestId('list-found')).toHaveText('Donatello');

  // The TV: numbered boxes lit by finds, counts per player — never the items.
  const players = host.getByTestId('list-players').getByRole('listitem');
  await expect(players.nth(0)).toContainText('Alice');
  await expect(players.nth(0)).toContainText('2/4');
  await expect(players.nth(1)).toContainText('1/4');
  await expect(host.getByTestId('list-items')).not.toContainText('Leonardo');
  await shot(host, 'list-tv-answering');
  await shot(alice, 'list-phone-answering');

  // Bob reloads: his phone gets back what he found.
  await bob.reload();
  await expect(bob.getByTestId('list-count')).toHaveText('1 / 4');

  await guess(alice, 'Donatello');
  await guess(alice, 'Raphaël');
  await expect(alice.getByText('🏆 Liste complète ! On attend les autres…')).toBeVisible();
  // Bob's phone only ever got what he found himself (the TV shows the rest at the reveal).
  const bobFrames = frames.Bob!.join('\n');
  expect(bobFrames).toContain('Donatello');
  for (const item of ['Leonardo', 'Michelangelo', 'Raphael']) expect(bobFrames).not.toContain(item);

  // ---- Reveal (host skips the rest of the time) ----
  await host.getByRole('button', { name: 'Passer' }).click();
  await expect(host.getByTestId('list-items')).toContainText('Michelangelo');
  await expect(host.getByTestId('list-items').getByRole('listitem').nth(0)).toContainText(
    'Leonardo',
  );
  await expect(alice.getByRole('heading', { name: 'Liste complète !' })).toBeVisible();
  await expect(alice.getByText('4 / 4 trouvés')).toBeVisible();
  await expect(bob.getByRole('heading', { name: 'Presque !' })).toBeVisible();
  await expect(bob.getByText('Il manquait : Leonardo, Michelangelo, Raphael')).toBeVisible();
  await expect(bob.getByText('+ 250 pts')).toBeVisible();
  await shot(host, 'list-tv-reveal');
  await shot(bob, 'list-phone-result');

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
  expect(report.questions[0]!.details.list!.players.map((p) => p.found)).toEqual([4, 1]);
  await host.goto(`/reports/${game.id}`);
  await expect(host.getByText('Alice 4/4 · Bob 1/4')).toBeVisible();
  await shot(host, 'list-report');

  for (const p of phones) await p.context.close();
  await hostContext.close();
});
