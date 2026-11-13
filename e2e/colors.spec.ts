import { deflateSync } from 'node:zlib';
import { expect, test, devices, type Page } from '@playwright/test';
import {
  COLOR_PALETTE,
  type GameReport,
  type GameSummary,
  type QuizDetail,
  type QuizInput,
} from '@lbq/shared';

/**
 * « Couleurs perdues » (T58): a host screen and two phones (Pixel 7, iPhone SE). Question 1 =
 * zones on an uploaded picture, question 2 = a generated board of 12 shapes. The TV shows the
 * colors while memorizing, the phones get nothing of the board; then everyone puts the colors
 * back; reveal with each player's board; report. The phones' frames are checked for leaks.
 *
 * Needs a database (host account, DB quiz): runs only when `E2E_DATABASE_URL` is set.
 */
test.skip(!process.env.E2E_DATABASE_URL, 'E2E_DATABASE_URL not set (needs Postgres)');

const SERVER_URL = `http://localhost:${process.env.E2E_SERVER_PORT ?? 3004}`;
const stamp = Date.now();
const SHOTS = process.env.E2E_SHOTS;

async function shot(page: Page, name: string, fullPage = false) {
  if (!SHOTS) return;
  await page.waitForTimeout(1500); // let the entrance animations finish
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage });
}

/** A 400×300 PNG in four colored quarters: red, blue / yellow, green. */
function quarters(): Buffer {
  const width = 400;
  const height = 300;
  const rgb = [
    [225, 29, 72],
    [37, 99, 235],
    [250, 204, 21],
    [22, 163, 74],
  ];
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const rows = Array.from({ length: height }, (_, y) => {
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x++) {
      const c = rgb[(y < height / 2 ? 0 : 2) + (x < width / 2 ? 0 : 1)]!;
      row.set(c, 1 + x * 3);
    }
    return row;
  });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

const hex = (i: number) => COLOR_PALETTE[i]!.hex;
const nameOf = (h: string) => COLOR_PALETTE.find((c) => c.hex === h)!.name;

/** Paints the zones in order (each color moves the selection to the next empty zone). */
async function paint(page: Page, colors: string[]) {
  for (const c of colors) await page.getByRole('button', { name: nameOf(c), exact: true }).click();
}

test('« Couleurs perdues »: memorize on the TV, answer on the phones, reveal and report', async ({
  browser,
}) => {
  const hostContext = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const reg = await hostContext.request.post(`${SERVER_URL}/api/auth/register`, {
    data: { email: `colors-${stamp}@e2e.test`, name: 'Tim', password: 'password123' },
  });
  expect(reg.status()).toBe(201);
  const uploaded = await hostContext.request.post(`${SERVER_URL}/api/uploads/image`, {
    multipart: { file: { name: 'tableau.png', mimeType: 'image/png', buffer: quarters() } },
  });
  expect(uploaded.status()).toBe(201);
  const { url: imageUrl } = (await uploaded.json()) as { url: string };
  // Rouge, Bleu / Jaune, Vert (round zones of T58: still played, T65).
  const RIGHT = [0, 4, 2, 3].map(hex);
  const input: QuizInput = {
    title: `Couleurs perdues ${stamp}`,
    questions: [
      {
        type: 'COLORS',
        text: 'Retrouve les couleurs du tableau',
        imageUrl,
        memoSec: 8,
        cells: 6,
        zones: [
          { x: 0.25, y: 0.25, radius: 0.1, color: hex(0) },
          { x: 0.75, y: 0.25, radius: 0.1, color: hex(4) },
          { x: 0.25, y: 0.75, radius: 0.1, color: hex(2) },
          { x: 0.75, y: 0.75, radius: 0.1, color: hex(3) },
        ],
        timeLimitSec: 30,
        basePoints: 1000,
        explanation: 'Quatre quarts, quatre couleurs.',
      },
      {
        type: 'COLORS',
        text: 'Quelles couleurs avaient les formes ?',
        memoSec: 8,
        cells: 12,
        zones: [],
        timeLimitSec: 60,
        basePoints: 1000,
      },
    ],
  };
  const created = await hostContext.request.post(`${SERVER_URL}/api/quizzes`, { data: input });
  expect(created.status()).toBe(201);
  const { id: quizId } = (await created.json()) as QuizDetail;

  // ---- Editor: the zones on the picture ----
  const host = await hostContext.newPage();
  await host.goto(`/editor/${quizId}`);
  await expect(host.getByRole('radio', { name: 'Couleurs perdues' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(host.getByRole('button', { name: '🎨 Zones sur une image' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(host.getByTestId('bucket-zone').nth(1)).toHaveAttribute('data-color', hex(4));
  await shot(host, 'colors-editor', true);

  // ---- Lobby: two phones, recording what the server sends them ----
  await host.goto(`/host/new?quizId=${quizId}`);
  await expect(host).toHaveURL(/\/host\/\d{6}$/);
  const pin = new URL(host.url()).pathname.split('/').pop()!;
  const frames: Record<string, string[]> = { Alice: [], Bob: [] };
  const phones = await Promise.all(
    (
      [
        ['Alice', 'Pixel 7'],
        ['Bob', 'iPhone SE'],
      ] as const
    ).map(async ([nickname, device]) => {
      const { defaultBrowserType: _b, ...phone } = devices[device];
      const context = await browser.newContext(phone);
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

  // ---- Question 1, stage 1: the colored picture on the TV, nothing on the phones ----
  await expect(host.getByTestId('colors-stage')).toHaveText('👀 Mémorisez les couleurs !');
  await expect(host.getByTestId('question-type')).toHaveText('🖍️ Couleurs perdues');
  await expect(alice.getByTestId('colors-memo')).toBeVisible();
  await expect(bob.getByTestId('colors-memo')).toBeVisible();
  await expect(bob.getByTestId('color-board')).toHaveCount(0);
  for (const f of [frames.Alice!, frames.Bob!]) {
    const all = f.join('\n');
    expect(all).not.toContain('"spots"');
    expect(all).not.toContain(imageUrl.split('/').pop()!);
  }
  await shot(host, 'colors-tv-memo-picture');
  await shot(alice, 'colors-phone-memo');

  // ---- Stage 2: grey board, the phones answer ----
  await expect(host.getByTestId('colors-stage')).toHaveText(
    '🎨 À vous ! Remettez les couleurs sur vos téléphones',
    { timeout: 15_000 },
  );
  await expect(alice.getByTestId('colors-palette')).toBeVisible();
  // Only the 4 colors of the picture, by hue: jaune, vert, bleu, rouge (T65).
  await expect(alice.getByTestId('colors-palette').getByRole('button')).toHaveText([
    'Jaune',
    'Vert',
    'Bleu',
    'Rouge',
  ]);
  await expect(alice.getByTestId('color-spot')).toHaveCount(4);
  await shot(host, 'colors-tv-answer-picture');
  await paint(alice, RIGHT);
  await expect(alice.getByTestId('colors-zone')).toHaveText('Zone 4');
  await shot(alice, 'colors-phone-answer-picture');
  // Bob swaps the bottom two.
  await paint(bob, [0, 4, 3, 2].map(hex));
  await shot(bob, 'colors-phone-se-picture');
  await expect(bob.getByRole('button', { name: 'Valider (4/4)' })).toBeVisible();
  // Nothing of the colors reached a phone before the reveal.
  for (const f of [frames.Alice!, frames.Bob!]) {
    const all = f.join('\n');
    expect(all).not.toContain('"color":');
    expect(all).not.toContain(`"colors":${JSON.stringify(RIGHT)}`);
  }
  await alice.getByRole('button', { name: 'Valider (4/4)' }).click();
  await expect(alice.getByText('Réponse envoyée !')).toBeVisible();
  await bob.getByRole('button', { name: 'Valider (4/4)' }).click();

  // ---- Reveal ----
  const answers = host.getByTestId('colors-answers').getByRole('listitem');
  await expect(answers.nth(0)).toContainText('Alice');
  await expect(answers.nth(0)).toContainText('4/4');
  await expect(answers.nth(1)).toContainText('2/4');
  await expect(alice.getByRole('heading', { name: 'Correct !' })).toBeVisible();
  await expect(alice.getByTestId('colors-result')).toHaveText('4 / 4 bonnes couleurs');
  await expect(bob.getByRole('heading', { name: 'Presque !' })).toBeVisible();
  await expect(bob.getByTestId('colors-result')).toHaveText('2 / 4 bonnes couleurs');
  await shot(host, 'colors-tv-reveal-picture');
  await shot(bob, 'colors-phone-result');

  // ---- Question 2: a generated board of 12 shapes ----
  await host.getByRole('button', { name: 'Suivant' }).click();
  await host.getByRole('button', { name: 'Suivant' }).click();
  await expect(host.getByTestId('colors-stage')).toHaveText('👀 Mémorisez les couleurs !');
  const shapes = host.getByTestId('color-shape');
  await expect(shapes).toHaveCount(12);
  const right = await shapes.evaluateAll((els) => els.map((e) => e.getAttribute('data-color')!));
  expect(right.every((c) => COLOR_PALETTE.some((p) => p.hex === c))).toBe(true);
  await shot(host, 'colors-tv-memo-generated');
  await expect(host.getByTestId('colors-stage')).toHaveText(
    '🎨 À vous ! Remettez les couleurs sur vos téléphones',
    { timeout: 15_000 },
  );
  await expect(bob.getByTestId('color-spot')).toHaveCount(12);
  await shot(host, 'colors-tv-answer-generated');
  // Only the colors drawn on the board are offered (T65).
  await expect(bob.getByTestId('colors-palette').getByRole('button')).toHaveCount(
    new Set(right).size,
  );
  // Bob (iPhone SE) gets everything right; the palette and « Valider » stay on screen.
  await paint(bob, right);
  const validate = bob.getByRole('button', { name: 'Valider (12/12)' });
  await expect(validate).toBeInViewport({ ratio: 1 });
  await shot(bob, 'colors-phone-se-generated');
  expect(frames.Bob!.join('\n')).not.toContain(`"colors":${JSON.stringify(right)}`);
  await validate.click();
  // Alice puts a single color, then the host ends the question.
  await paint(alice, [right[0]!]);
  await alice.getByRole('button', { name: 'Valider (1/12)' }).click();
  await expect(bob.getByRole('heading', { name: 'Correct !' })).toBeVisible();
  await expect(alice.getByTestId('colors-result')).toContainText('/ 12 bonne');
  await shot(host, 'colors-tv-reveal-generated');

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
  expect(report.questions[0]!.details.colors!.answers.map((a) => a.right)).toEqual([4, 2]);
  expect(report.questions[1]!.details.colors!.colors).toEqual(right);
  await host.goto(`/reports/${game.id}`);
  await expect(host.getByText('trouvé toutes les couleurs').first()).toBeVisible();
  await shot(host, 'colors-report', true);

  for (const p of phones) await p.context.close();
  await hostContext.close();
});
