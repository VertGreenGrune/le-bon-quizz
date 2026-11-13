import { expect, test, devices, type Page } from '@playwright/test';
import {
  SHAPES,
  type GameReport,
  type GameSummary,
  type QuizDetail,
  type QuizInput,
} from '@lbq/shared';

/**
 * « Enchères » (T64): a host screen and two phones. Q1 (no bids) gives both some points; on Q2
 * they bid before seeing it — Alice 200, Bob 100 then 150. Alice answers right (+ 200), Bob wrong
 * (− 150). Nobody sees Q2 before the bids are closed, and no phone ever gets the other's bid.
 *
 * Needs a database (host account, DB quiz): runs only when `E2E_DATABASE_URL` is set.
 */
test.skip(!process.env.E2E_DATABASE_URL, 'E2E_DATABASE_URL not set (needs Postgres)');

const SERVER_URL = `http://localhost:${process.env.E2E_SERVER_PORT ?? 3004}`;
const stamp = Date.now();
const SHOTS = process.env.E2E_SHOTS;
const SECRET = 'Plus long fleuve de France';

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

async function tapShape(phone: Page, index: number) {
  await phone.getByRole('button', { name: `Réponse ${SHAPES[index]!.symbol}` }).click();
}

/** Taps « + » `steps` times then « Miser … ». */
async function placeBid(phone: Page, steps: number, amount: number) {
  for (let i = 0; i < steps; i++) await phone.getByRole('button', { name: 'Plus' }).click();
  await phone.getByRole('button', { name: `Miser ${amount}` }).click();
  await expect(phone.getByTestId('bid-sent')).toHaveText(`✅ Mise enregistrée : ${amount} pts`);
}

test('« Enchères »: bids before the question, + / − at the reveal, report', async ({ browser }) => {
  const hostContext = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const reg = await hostContext.request.post(`${SERVER_URL}/api/auth/register`, {
    data: { email: `auction-${stamp}@e2e.test`, name: 'Tim', password: 'password123' },
  });
  expect(reg.status()).toBe(201);
  const input: QuizInput = {
    title: `Enchères ${stamp}`,
    questions: [
      {
        type: 'MCQ',
        text: 'Quelle est la capitale de la France ?',
        timeLimitSec: 20,
        basePoints: 1000,
        choices: [
          { text: 'Paris', isCorrect: true },
          { text: 'Lyon', isCorrect: false },
        ],
      },
      {
        type: 'MCQ',
        text: `${SECRET} ?`,
        timeLimitSec: 20,
        basePoints: 1000,
        auction: true,
        auctionTopic: 'Géographie',
        choices: [
          { text: 'La Seine', isCorrect: false },
          { text: 'La Loire', isCorrect: true },
          { text: 'Le Rhône', isCorrect: false },
        ],
        explanation: 'La Loire mesure environ 1 000 km.',
      },
    ],
  };
  const created = await hostContext.request.post(`${SERVER_URL}/api/quizzes`, { data: input });
  expect(created.status()).toBe(201);
  const { id: quizId } = (await created.json()) as QuizDetail;

  // ---- Editor: the option and its topic ----
  const host = await hostContext.newPage();
  await host.goto(`/editor/${quizId}`);
  await host
    .getByRole('button', { name: /Plus long fleuve/ })
    .first()
    .click();
  await expect(host.getByRole('checkbox', { name: /Enchères/ })).toBeChecked();
  await expect(host.getByPlaceholder('ex. Cinéma des années 80')).toHaveValue('Géographie');
  await host.getByRole('checkbox', { name: /Enchères/ }).scrollIntoViewIfNeeded();
  await shot(host, 'auction-editor');

  // ---- Lobby: two phones, recording what the server sends; the TV too ----
  const tvFrames: string[] = [];
  host.on('websocket', (ws) =>
    ws.on('framereceived', (f) => tvFrames.push(typeof f.payload === 'string' ? f.payload : '')),
  );
  await host.goto(`/host/new?quizId=${quizId}`);
  await expect(host).toHaveURL(/\/host\/\d{6}$/);
  const pin = new URL(host.url()).pathname.split('/').pop()!;
  const frames: Record<string, string[]> = { Alice: [], Bob: [] };
  const phones = await Promise.all(
    Object.keys(frames).map(async (nickname) => {
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

  // ---- Q1, no bids: both right ----
  await tapShape(alice, 0);
  await tapShape(bob, 0);
  await expect(alice.getByRole('heading', { name: 'Correct !' })).toBeVisible();
  await host.getByRole('button', { name: 'Suivant' }).click();
  await host.getByRole('button', { name: 'Question suivante' }).click();

  // ---- Q2: the bid stage, without the question ----
  await expect(host.getByTestId('auction-bids')).toBeVisible();
  await expect(host.getByTestId('auction-topic')).toHaveText('Géographie');
  await expect(alice.getByTestId('bid-pad')).toBeVisible();
  await expect(alice.getByText('Thème : Géographie')).toBeVisible();
  await shot(alice, 'auction-phone-bid');
  await placeBid(alice, 4, 200);
  await placeBid(bob, 2, 100);
  await placeBid(bob, 1, 150); // changed
  await expect(host.locator('[data-testid="auction-player"][data-bid="yes"]')).toHaveCount(2);
  await shot(host, 'auction-tv-bids');
  await shot(bob, 'auction-phone-bid-sent');
  // Before the bids are closed, nobody has the question.
  expect(tvFrames.join('\n')).not.toContain(SECRET);
  expect([...frames.Alice!, ...frames.Bob!].join('\n')).not.toContain(SECRET);
  await host.getByRole('button', { name: 'Fermer les enchères' }).click();

  // ---- Q2 itself ----
  await expect(host.getByText(`${SECRET} ?`)).toBeVisible();
  await tapShape(alice, 1);
  await tapShape(bob, 0);

  // ---- Reveal: + 200 for Alice, − 150 for Bob ----
  const bids = host.getByTestId('auction-bid');
  await expect(bids).toHaveText([/Alice avait misé 200 : \+ 200/, /Bob avait misé 150 : − 150/]);
  await expect(alice.getByTestId('auction-result')).toHaveText('💰 Mise gagnée : + 200 !');
  await expect(bob.getByTestId('auction-result')).toHaveText('💰 Mise perdue : − 150');
  // A phone never gets the other one's bid.
  expect(frames.Alice!.join('\n')).not.toContain('"amount":150');
  expect(frames.Bob!.join('\n')).not.toContain('"amount":200');
  await expect(host.getByRole('button', { name: 'Voir le podium' })).toBeInViewport();
  if (SHOTS) await host.waitForTimeout(3000); // the bids appear one by one
  await shot(host, 'auction-tv-reveal');
  await shot(alice, 'auction-phone-won');
  await shot(bob, 'auction-phone-lost');

  // ---- Report ----
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
  expect(report.questions[1]!.details.auction?.bids.map((b) => [b.nickname, b.delta])).toEqual([
    ['Alice', 200],
    ['Bob', -150],
  ]);
  await host.goto(`/reports/${game.id}`);
  await expect(host.getByTestId('report-auction')).toContainText('Alice · 200 pts → + 200');
  await host.getByTestId('report-auction').scrollIntoViewIfNeeded();
  await shot(host, 'auction-report');

  for (const p of phones) await p.context.close();
  await hostContext.close();
});
