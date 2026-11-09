import { expect, test, devices, type Page } from '@playwright/test';
import type { GameReport, GameSummary, QuizDetail, QuizInput } from '@lbq/shared';

/**
 * « Mytho ! » (T26): a host screen and 3 phones. Every phone writes a lie (one too close to the
 * truth is refused), then votes; the TV reveals the lies one by one and the truth last; the
 * phones show who fooled whom; the report lists the lies. The phones never receive which answer
 * is the true one before the reveal.
 *
 * Needs a database (host account, DB quiz): runs only when `E2E_DATABASE_URL` is set.
 */
test.skip(!process.env.E2E_DATABASE_URL, 'E2E_DATABASE_URL not set (needs Postgres)');

const SERVER_URL = `http://localhost:${process.env.E2E_SERVER_PORT ?? 3004}`;
const SHOTS = process.env.E2E_SHOTS_DIR;
const stamp = Date.now();

const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

async function writeLie(phone: Page, lie: string) {
  await phone.getByRole('textbox', { name: 'Ton mytho' }).fill(lie);
  await phone.getByRole('button', { name: 'Valider' }).click();
}

const voteFor = (phone: Page, text: string) =>
  phone.getByRole('button', { name: new RegExp(`^Réponse [A-Z] : ${text}$`) });

test('« Mytho ! »: lies, votes, reveal one by one, report', async ({ browser }) => {
  const hostContext = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const reg = await hostContext.request.post(`${SERVER_URL}/api/auth/register`, {
    data: { email: `mytho-${stamp}@e2e.test`, name: 'Tim', password: 'password123' },
  });
  expect(reg.status()).toBe(201);
  const input: QuizInput = {
    title: `Mytho ${stamp}`,
    questions: [
      {
        type: 'BLUFF',
        text: 'Le premier court-métrage de Tim Burton s’appelle… ?',
        truth: 'Vincent',
        timeLimitSec: 60,
        voteTimeSec: 30,
        basePoints: 1000,
      },
    ],
  };
  const created = await hostContext.request.post(`${SERVER_URL}/api/quizzes`, { data: input });
  expect(created.status()).toBe(201);
  const { id: quizId } = (await created.json()) as QuizDetail;

  // ---- Editor: the type and the truth ----
  const host = await hostContext.newPage();
  await host.goto(`/editor/${quizId}`);
  await expect(host.getByRole('radio', { name: 'Mytho !' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(host.getByPlaceholder('Ex. : Vincent')).toHaveValue('Vincent');

  // ---- Lobby: three phones, recording what the server sends them ----
  await host.goto(`/host/new?quizId=${quizId}`);
  await expect(host).toHaveURL(/\/host\/\d{6}$/);
  const pin = new URL(host.url()).pathname.split('/').pop()!;
  const frames: string[] = [];
  const [alice, bob, chloe] = await Promise.all(
    ['Alice', 'Bob', 'Chloé'].map(async (nickname) => {
      const context = await browser.newContext({ ...devices['Pixel 7'] });
      const page = await context.newPage();
      page.on('websocket', (ws) =>
        ws.on('framereceived', (f) => frames.push(typeof f.payload === 'string' ? f.payload : '')),
      );
      await page.goto(`/join?pin=${pin}`);
      await page.getByPlaceholder('Ton pseudo').fill(nickname);
      await page.getByRole('button', { name: 'Entrer' }).click();
      await expect(page.getByText('Tu es dans la partie !')).toBeVisible();
      return page;
    }),
  );
  await host.getByRole('button', { name: 'Commencer' }).click();

  // ---- Stage 1: the lies ----
  await expect(host.getByText('Inventez un mytho crédible sur votre téléphone !')).toBeVisible({
    timeout: 15_000,
  });
  await expect(alice!.getByRole('heading', { name: '🤥 Invente un mytho' })).toBeVisible();
  await writeLie(alice!, 'Vinsent'); // a typo of the truth: refused
  await expect(alice!.getByRole('alert')).toContainText('Trop proche de la vraie réponse');
  await shot(alice!, 'phone-write');
  await writeLie(alice!, 'Frankenweenie');
  await expect(alice!.getByRole('heading', { name: 'Mytho enregistré !' })).toBeVisible();
  await writeLie(bob!, 'Hansel et Gretel');
  await writeLie(chloe!, 'Le Cavalier sans tête');

  // ---- Stage 2: the vote (same options on the TV and the phones) ----
  await expect(host.getByText('Laquelle est la vraie réponse ?')).toBeVisible();
  await shot(host, 'host-vote');
  await expect(voteFor(alice!, 'Frankenweenie')).toBeDisabled(); // own lie
  await expect(alice!.getByText('Ton mytho')).toBeVisible();
  await shot(alice!, 'phone-vote');
  // Nothing sent to a phone so far says which answer is true.
  expect(frames.join('\n')).not.toContain('truth');
  expect(frames.join('\n')).not.toContain('"correct"');

  await voteFor(bob!, 'Frankenweenie').click(); // fooled by Alice
  await voteFor(chloe!, 'Vincent').click();
  await voteFor(alice!, 'Vincent').click();

  // ---- Reveal: the lies one by one, the truth last ----
  const spotlight = host.getByTestId('bluff-spotlight');
  await expect(spotlight).toContainText('Mytho !');
  await expect(spotlight).toContainText('La vérité', { timeout: 15_000 });
  await expect(spotlight).toContainText('Vincent');
  await expect(spotlight).toContainText('Alice');
  await expect(host.getByTestId('bluff-reveal')).toContainText('Frankenweenie');
  await shot(host, 'host-reveal');

  await expect(alice!.getByRole('heading', { name: 'Vérité trouvée !' })).toBeVisible();
  await expect(alice!.getByTestId('bluff-result')).toContainText('a piégé 1 joueur : + 250 pts');
  await expect(bob!.getByRole('heading', { name: 'Piégé !' })).toBeVisible();
  await expect(bob!.getByTestId('bluff-result')).toContainText('Piégé par le mytho de Alice');
  await shot(bob!, 'phone-result');

  // ---- To the end, then the report ----
  await host.getByRole('button', { name: 'Suivant' }).click();
  await host.getByRole('button', { name: 'Voir le podium' }).click();
  await host.getByRole('button', { name: 'Terminer la partie' }).click();
  await expect(alice!.getByRole('heading', { name: 'Partie terminée' })).toBeVisible();

  let summary: GameSummary | undefined;
  await expect
    .poll(async () => {
      const games = (await (
        await hostContext.request.get(`${SERVER_URL}/api/games`)
      ).json()) as GameSummary[];
      summary = games[0];
      return games.length;
    })
    .toBe(1);
  const report = (await (
    await hostContext.request.get(`${SERVER_URL}/api/games/${summary!.id}`)
  ).json()) as GameReport;
  expect(report.results.map((r) => [r.nickname, r.score])).toEqual([
    ['Alice', 1250],
    ['Chloé', 1000],
    ['Bob', 0],
  ]);
  await host.goto(`/reports/${summary!.id}`);
  await expect(host.getByTestId('bluff-report')).toContainText('Frankenweenie');
  await expect(host.getByText('1 / 3 joueurs ont trouvé la vérité')).toBeHidden();
  await expect(host.getByText('2 / 3 joueurs ont trouvé la vérité')).toBeVisible();
});
