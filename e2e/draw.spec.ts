import { expect, test, devices, type Page } from '@playwright/test';
import type { GameReport, GameSummary, QuizDetail, QuizInput } from '@lbq/shared';

/**
 * « Dessine-moi » (T30): a host screen and 3 phones. The first player draws the secret word on
 * their phone, the TV shows the strokes live; the others guess (wrong, « Presque ! », found); the
 * reveal shows the word and keeps the drawing. Second question: the next player draws, the TV and
 * the drawer's phone are reloaded mid-drawing and get the drawing back; nobody finds it. The
 * report shows the drawing. The guessers' phones never receive the word before the reveal.
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

/** A finger stroke across the phone's canvas (from / to as fractions of its size). */
async function scribble(phone: Page, from: [number, number], to: [number, number]) {
  const box = (await phone.getByTestId('draw-canvas').boundingBox())!;
  const at = ([x, y]: [number, number]) => [box.x + x * box.width, box.y + y * box.height] as const;
  await phone.mouse.move(...at(from));
  await phone.mouse.down();
  for (let i = 1; i <= 8; i++)
    await phone.mouse.move(
      ...at([from[0] + ((to[0] - from[0]) * i) / 8, from[1] + ((to[1] - from[1]) * i) / 8]),
    );
  await phone.mouse.up();
}

async function guess(phone: Page, text: string) {
  await phone.getByRole('textbox', { name: 'Ta proposition' }).fill(text);
  await phone.getByRole('button', { name: 'Proposer' }).click();
}

test('« Dessine-moi »: live drawing, guesses, reveal, rejoin, report', async ({ browser }) => {
  const hostContext = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const reg = await hostContext.request.post(`${SERVER_URL}/api/auth/register`, {
    data: { email: `dessin-${stamp}@e2e.test`, name: 'Tim', password: 'password123' },
  });
  expect(reg.status()).toBe(201);
  const input: QuizInput = {
    title: `Dessin ${stamp}`,
    questions: [
      {
        type: 'DRAW',
        text: 'Dessine-moi…',
        words: ['Licorne'],
        timeLimitSec: 90,
        basePoints: 1000,
      },
      {
        type: 'DRAW',
        text: 'Et maintenant…',
        words: ['Fusée'],
        timeLimitSec: 90,
        basePoints: 1000,
      },
    ],
  };
  const created = await hostContext.request.post(`${SERVER_URL}/api/quizzes`, { data: input });
  expect(created.status()).toBe(201);
  const { id: quizId } = (await created.json()) as QuizDetail;

  // ---- Editor: the type and the words ----
  const host = await hostContext.newPage();
  await host.goto(`/editor/${quizId}`);
  await expect(host.getByRole('radio', { name: 'Dessine-moi' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(host.getByRole('textbox', { name: /Mots à dessiner/ })).toHaveValue('Licorne');

  // ---- Lobby: three phones (joined in order: Alice draws first), recording their frames ----
  await host.goto(`/host/new?quizId=${quizId}`);
  await expect(host).toHaveURL(/\/host\/\d{6}$/);
  const pin = new URL(host.url()).pathname.split('/').pop()!;
  const frames = new Map<string, string[]>();
  const phones: Page[] = [];
  for (const nickname of ['Alice', 'Bob', 'Chloé']) {
    const context = await browser.newContext({ ...devices['Pixel 7'] });
    const page = await context.newPage();
    frames.set(nickname, []);
    page.on('websocket', (ws) =>
      ws.on('framereceived', (f) =>
        frames.get(nickname)!.push(typeof f.payload === 'string' ? f.payload : ''),
      ),
    );
    await page.goto(`/join?pin=${pin}`);
    await page.getByPlaceholder('Ton pseudo').fill(nickname);
    await page.getByRole('button', { name: 'Entrer' }).click();
    await expect(page.getByText('Tu es dans la partie !')).toBeVisible();
    phones.push(page);
  }
  const [alice, bob, chloe] = phones as [Page, Page, Page];
  await host.getByRole('button', { name: 'Commencer' }).click();

  // ---- Question 1: Alice draws « Licorne » ----
  await expect(host.getByText('Alice va dessiner')).toBeVisible();
  await expect(bob.getByText('Alice va dessiner : devine !')).toBeVisible();
  await expect(alice.getByTestId('draw-word')).toHaveText('Licorne', { timeout: 15_000 });
  await expect(host.getByText('_______')).toBeVisible();
  await scribble(alice, [0.2, 0.3], [0.8, 0.6]);
  await scribble(alice, [0.5, 0.2], [0.5, 0.8]);
  const board = host.getByTestId('drawing');
  await expect(board).toHaveAttribute('data-strokes', '2');
  await shot(alice, 'phone-drawer');

  // Undo: the last stroke goes away on the TV; « Tout effacer » can be undone too.
  const undo = alice.getByRole('button', { name: 'Annuler le dernier trait' });
  await scribble(alice, [0.1, 0.9], [0.9, 0.9]);
  await expect(board).toHaveAttribute('data-strokes', '3');
  await undo.click();
  await expect(board).toHaveAttribute('data-strokes', '2');
  await alice.getByRole('button', { name: 'Tout effacer' }).click();
  await expect(board).toHaveAttribute('data-strokes', '0');
  await undo.click();
  await expect(board).toHaveAttribute('data-strokes', '2');

  // Phone held sideways: a bigger pad, tools on the side, everything on screen.
  const portrait = (await alice.getByTestId('draw-canvas').boundingBox())!;
  await alice.setViewportSize({ width: 915, height: 412 });
  await expect
    .poll(async () => (await alice.getByTestId('draw-canvas').boundingBox())!.height)
    .toBeGreaterThan(portrait.height * 1.15);
  const sideways = (await alice.getByTestId('draw-canvas').boundingBox())!;
  expect(sideways.y + sideways.height).toBeLessThanOrEqual(412);
  await expect(undo).toBeInViewport();
  await shot(alice, 'phone-drawer-landscape');
  await scribble(alice, [0.2, 0.8], [0.8, 0.2]);
  await expect(board).toHaveAttribute('data-strokes', '3');
  await alice.setViewportSize({ width: 412, height: 839 });

  await guess(bob, 'cheval');
  await expect(bob.getByTestId('guess-feedback')).toHaveText('Non, pas « cheval »…');
  await guess(chloe, 'Lycorn');
  await expect(chloe.getByTestId('guess-feedback')).toHaveText('Presque ! « Lycorn »');
  await shot(chloe, 'phone-guess');
  await guess(bob, 'la licorn'); // article + one typo
  await expect(bob.getByRole('heading', { name: 'Trouvé !' })).toBeVisible();
  await expect(host.getByTestId('draw-found')).toContainText('Bob');
  await expect(alice.getByText('✅ Bob a trouvé !')).toBeVisible();
  await shot(host, 'host-drawing');
  // Before the reveal, the guessers' phones never got the word.
  for (const name of ['Bob', 'Chloé'])
    expect(frames.get(name)!.join('\n').toLowerCase()).not.toContain('licorne');
  await guess(chloe, 'licorne');

  // ---- Reveal: the word, the drawing stays ----
  await expect(host.getByTestId('draw-word')).toHaveText('Licorne');
  await expect(board).toHaveAttribute('data-strokes', '3');
  await expect(host.getByTestId('draw-found')).toContainText('Chloé');
  await shot(host, 'host-reveal');
  await expect(alice.getByRole('heading', { name: 'Bien dessiné !' })).toBeVisible();
  await expect(alice.getByText('2 joueurs ont reconnu ton dessin !')).toBeVisible();
  await expect(alice.getByText('+ 1000 pts')).toBeVisible({ timeout: 5_000 });
  await expect(chloe.getByRole('heading', { name: 'Trouvé !' })).toBeVisible();
  await shot(alice, 'phone-drawer-result');

  // ---- Question 2: Bob draws; the TV and his phone reload mid-drawing ----
  await host.getByRole('button', { name: 'Suivant' }).click();
  await host.getByRole('button', { name: 'Question suivante' }).click();
  await expect(bob.getByTestId('draw-word')).toHaveText('Fusée', { timeout: 15_000 });
  await expect(alice.getByRole('textbox', { name: 'Ta proposition' })).toBeVisible();
  await scribble(bob, [0.5, 0.1], [0.5, 0.9]);
  await expect(board).toHaveAttribute('data-strokes', '1');
  await host.reload();
  await expect(host.getByTestId('drawing')).toHaveAttribute('data-strokes', '1');
  await bob.reload();
  await expect(bob.getByTestId('draw-word')).toHaveText('Fusée');
  await scribble(bob, [0.3, 0.7], [0.7, 0.7]);
  await expect(host.getByTestId('drawing')).toHaveAttribute('data-strokes', '2');
  for (const name of ['Alice', 'Chloé'])
    expect(frames.get(name)!.join('\n').toLowerCase()).not.toContain('fusée');
  await host.getByRole('button', { name: 'Passer' }).click(); // nobody finds it
  await expect(host.getByTestId('draw-word')).toHaveText('Fusée');
  await expect(host.getByText('Personne n’a trouvé…')).toBeVisible();
  await expect(bob.getByRole('heading', { name: 'Personne n’a trouvé…' })).toBeVisible();
  await expect(alice.getByRole('heading', { name: 'Pas trouvé !' })).toBeVisible();
  await expect(alice.getByText('Le mot était « Fusée »')).toBeVisible();

  // ---- To the end, then the report with the drawings ----
  await host.getByRole('button', { name: 'Suivant' }).click();
  await host.getByRole('button', { name: 'Voir le podium' }).click();
  await host.getByRole('button', { name: 'Terminer la partie' }).click();
  await expect(alice.getByRole('heading', { name: 'Partie terminée' })).toBeVisible();

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
  expect(report.questions.map((q) => [q.type, q.correctCount])).toEqual([
    ['DRAW', 2],
    ['DRAW', 0],
  ]);
  expect(report.questions[0]!.details.draw?.strokes).toHaveLength(3);
  expect(report.results.find((r) => r.nickname === 'Alice')?.score).toBe(1000);
  await host.goto(`/reports/${summary!.id}`);
  const cards = host.getByTestId('draw-report');
  await expect(cards).toHaveCount(2);
  // Hardest first: « Fusée » (nobody) comes before « Licorne ».
  await expect(cards.first()).toContainText('Fusée');
  const licorne = cards.filter({ hasText: 'Licorne' });
  await expect(licorne.getByTestId('drawing')).toHaveAttribute('data-strokes', '3');
  await expect(host.getByText('2 / 3 joueurs ont trouvé le mot')).toBeVisible();
  await shot(host, 'report');
});
