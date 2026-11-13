import { expect, test, devices, type Page, type WebSocket } from '@playwright/test';
import type { QuizDetail } from '@lbq/shared';

/**
 * « Associer » (MATCH, T67) and the quiz background picture (T68): a DB quiz with a background
 * and one MATCH question (texts and a picture); the TV shows the background and both columns,
 * Alice links every pair right, Bob swaps two; results, reveal, report.
 *
 * Needs a database (host account, DB quiz): runs only when `E2E_DATABASE_URL` is set.
 */
test.skip(!process.env.E2E_DATABASE_URL, 'E2E_DATABASE_URL not set (needs Postgres)');

const SERVER_URL = `http://localhost:${process.env.E2E_SERVER_PORT ?? 3004}`;
const svg = (fill: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"><rect width="80" height="60" fill="${fill}"/></svg>`,
  )}`;
const BACKGROUND = svg('#335533');
const FLAG = svg('#ff0000');
const PAIRS = [
  { left: { text: 'France' }, right: { text: 'Paris' } },
  { left: { text: 'Italie' }, right: { text: 'Rome' } },
  { left: { text: 'Espagne' }, right: { text: 'Madrid' } },
  { left: { text: 'Drapeau rouge', imageUrl: FLAG }, right: { text: 'Rouge' } },
];
const PARTNER: Record<string, string> = {
  France: 'Paris',
  Italie: 'Rome',
  Espagne: 'Madrid',
  'Drapeau rouge': 'Rouge',
};

async function join(page: Page, pin: string, nickname: string) {
  await page.goto(`/join?pin=${pin}`);
  await page.getByPlaceholder('Ton pseudo').fill(nickname);
  await page.getByRole('button', { name: 'Entrer' }).click();
  await expect(page.getByText('Tu es dans la partie !')).toBeVisible();
}

/** Links every left item to its partner; `swap` exchanges the partners of France and Italie. */
async function linkAll(phone: Page, swap = false) {
  const pad = phone.getByTestId('match-pad');
  await expect(pad).toBeVisible();
  const partner: Record<string, string> = swap
    ? { ...PARTNER, France: 'Rome', Italie: 'Paris' }
    : PARTNER;
  for (let l = 0; l < 4; l++) {
    const left = phone.getByTestId(`match-left-${l}`);
    const text = (await left.innerText()).replace(/^\d+\s*/, '').trim();
    await left.click();
    const target = partner[text]!;
    for (let r = 0; r < 4; r++) {
      const right = phone.getByTestId(`match-right-${r}`);
      if ((await right.innerText()).includes(target)) {
        await right.click();
        break;
      }
    }
  }
  await phone.getByRole('button', { name: 'Valider (4/4)' }).click();
}

test('« Associer » with a background picture', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const reg = await ctx.request.post(`${SERVER_URL}/api/auth/register`, {
    data: { email: `match-${Date.now()}@e2e.test`, name: 'Hôte', password: 'password123' },
  });
  expect(reg.status()).toBe(201);
  const created = await ctx.request.post(`${SERVER_URL}/api/quizzes`, {
    data: {
      title: 'Capitales',
      backgroundImageUrl: BACKGROUND,
      questions: [{ type: 'MATCH', text: 'Associe chaque pays à sa capitale', pairs: PAIRS }],
    },
  });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()) as QuizDetail;

  const host = await ctx.newPage();
  await host.goto(`/host/new?quizId=${id}`);
  await expect(host).toHaveURL(/\/host\/\d{6}$/);
  const pin = new URL(host.url()).pathname.split('/').pop()!;
  // T68: the quiz's picture behind the whole game.
  await expect(host.getByTestId('quiz-background')).toBeVisible();

  const phones: Page[] = [];
  const frames: string[] = [];
  for (const nickname of ['Alice', 'Bob']) {
    const phone = await (await browser.newContext({ ...devices['Pixel 7'] })).newPage();
    phone.on('websocket', (ws: WebSocket) =>
      ws.on('framereceived', (f) => frames.push(String(f.payload))),
    );
    await join(phone, pin, nickname);
    phones.push(phone);
  }
  await expect(phones[0]!.getByTestId('quiz-background')).toBeVisible();
  const [alice, bob] = phones as [Page, Page];

  await host.getByRole('button', { name: 'Commencer' }).click();
  await expect(host.getByTestId('match-columns')).toBeVisible({ timeout: 15_000 });
  await expect(host.getByTestId('match-columns')).toContainText('Madrid');

  await linkAll(alice);
  await expect(alice.getByText('Réponse envoyée !')).toBeVisible();
  await linkAll(bob, true);

  // Reveal: the pairs and every player's score.
  const reveal = host.getByTestId('match-reveal');
  await expect(reveal).toBeVisible({ timeout: 10_000 });
  await expect(reveal).toContainText('4 / 4');
  await expect(reveal).toContainText('2 / 4');
  await expect(alice.getByText('4 / 4 paires justes')).toBeVisible();
  await expect(bob.getByText('2 / 4 paires justes')).toBeVisible();
  // The phones never got which goes with which before the reveal.
  const beforeReveal = frames.filter((f) => f.includes('question:prompt'));
  expect(beforeReveal.length).toBeGreaterThan(0);
  for (const f of beforeReveal) expect(f).not.toContain('pairs');

  await host.getByRole('button', { name: 'Voir le podium' }).click();
  await expect(host.getByRole('heading', { name: 'Podium' })).toBeVisible();
  await host.getByRole('button', { name: 'Terminer la partie' }).click();
  await expect(host.getByRole('link', { name: "Retour à l'accueil" })).toBeVisible();

  // Report.
  const games = (await (await ctx.request.get(`${SERVER_URL}/api/games`)).json()) as {
    id: string;
  }[];
  const report = await ctx.newPage();
  await report.goto(`/reports/${games[0]!.id}`);
  await expect(report.getByTestId('match-report')).toContainText('Madrid');
  await ctx.close();
});
