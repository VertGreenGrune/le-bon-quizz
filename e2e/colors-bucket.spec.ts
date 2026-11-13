import { deflateSync } from 'node:zlib';
import { expect, test, devices, type Page } from '@playwright/test';
import type { QuizDetail, QuizInput } from '@lbq/shared';

/**
 * « Couleurs perdues » with the paint bucket (T65). The host's picture has three colored areas
 * (pink, mauve, green) and a second pink square, separated by black lines. In the editor the
 * host taps the four areas: the regions are found by flood fill, their colors measured, and the
 * picture with the zones in white (`blankImageUrl`) is uploaded. In the game the TV and the
 * phones show the blank picture during the answers, the phones are offered exactly the 3 colors
 * of the picture, and their frames carry no zone color nor the colored picture before the reveal.
 *
 * Needs a database (host account, DB quiz): runs only when `E2E_DATABASE_URL` is set.
 */
test.skip(!process.env.E2E_DATABASE_URL, 'E2E_DATABASE_URL not set (needs Postgres)');

const SERVER_URL = `http://localhost:${process.env.E2E_SERVER_PORT ?? 3004}`;
const stamp = Date.now();
const SHOTS = process.env.E2E_SHOTS;

async function shot(page: Page, name: string, fullPage = false) {
  if (!SHOTS) return;
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage });
}

const PINK = '#f4a6c0';
const MAUVE = '#7b4fa1';
const GREEN = '#3c8f4a';
const W = 480;
const H = 300;

/** Pixel color of the test picture: 3 bands split by 10-px black lines, a pink square in the green. */
function colorAt(x: number, y: number): [number, number, number] {
  if (x >= 155 && x < 165) return [0, 0, 0];
  if (x >= 315 && x < 325) return [0, 0, 0];
  if (x < 155) return [244, 166, 192];
  if (x < 315) return [123, 79, 161];
  if (x >= 380 && x < 440 && y >= 100 && y < 200) return [244, 166, 192];
  if (x >= 370 && x < 450 && y >= 90 && y < 210) return [0, 0, 0];
  return [60, 143, 74];
}

function picture(): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(W, 0);
  header.writeUInt32BE(H, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const rows = Array.from({ length: H }, (_, y) => {
    const row = Buffer.alloc(1 + W * 3);
    for (let x = 0; x < W; x++) row.set(colorAt(x, y), 1 + x * 3);
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

/** The color of a pixel of a picture, read in the page (white = a whitened zone). */
async function pixel(page: Page, url: string, x: number, y: number): Promise<string> {
  return page.evaluate(
    async ({ url, x, y }) => {
      const bitmap = await createImageBitmap(await (await fetch(url)).blob());
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
      return `${r},${g},${b}`;
    },
    { url, x, y },
  );
}

/** Paints the zones in order with the offered colors (the selection moves to the next zone). */
async function paint(page: Page, colors: string[]) {
  for (const c of colors)
    await page.getByTestId('colors-palette').locator(`[data-hex="${c}"]`).click();
}

test('« Couleurs perdues »: paint bucket in the editor, only the picture’s colors in the game', async ({
  browser,
}) => {
  const hostContext = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const reg = await hostContext.request.post(`${SERVER_URL}/api/auth/register`, {
    data: { email: `bucket-${stamp}@e2e.test`, name: 'Tim', password: 'password123' },
  });
  expect(reg.status()).toBe(201);
  const uploaded = await hostContext.request.post(`${SERVER_URL}/api/uploads/image`, {
    multipart: { file: { name: 'dessin.png', mimeType: 'image/png', buffer: picture() } },
  });
  expect(uploaded.status()).toBe(201);
  const { url: imageUrl } = (await uploaded.json()) as { url: string };
  const imageName = imageUrl.split('/').pop()!;
  // A T58 question (two round zones): the host redoes it with the paint bucket.
  const input: QuizInput = {
    title: `Pot de peinture ${stamp}`,
    questions: [
      {
        type: 'COLORS',
        text: 'Retrouve les couleurs de mon dessin',
        imageUrl,
        memoSec: 8,
        cells: 6,
        zones: [
          { x: 0.1, y: 0.1, radius: 0.05, color: '#e11d48' },
          { x: 0.5, y: 0.5, radius: 0.05, color: '#2563eb' },
        ],
        timeLimitSec: 30,
        basePoints: 1000,
      },
    ],
  };
  const created = await hostContext.request.post(`${SERVER_URL}/api/quizzes`, { data: input });
  expect(created.status()).toBe(201);
  const { id: quizId } = (await created.json()) as QuizDetail;

  // ---- Editor: paint bucket ----
  const host = await hostContext.newPage();
  await host.goto(`/editor/${quizId}`);
  const zones = host.getByTestId('bucket-zone');
  await expect(zones).toHaveCount(2);
  await host.getByRole('button', { name: 'Supprimer la zone 1' }).click();
  await host.getByRole('button', { name: 'Supprimer la zone 1' }).click();
  await expect(zones).toHaveCount(0);
  const pic = host.getByTestId('pin-picture');
  await expect(host.getByText('Chargement de l’image…')).toHaveCount(0);
  const box = (await pic.boundingBox())!;
  const tap = (x: number, y: number) =>
    pic.click({ position: { x: (x / W) * box.width, y: (y / H) * box.height } });
  await tap(60, 40); // pink band
  await tap(240, 150); // mauve band
  await tap(340, 40); // green band
  await tap(410, 150); // the pink square
  await expect(zones).toHaveCount(4);
  await expect(zones.nth(0)).toHaveAttribute('data-color', PINK);
  await expect(zones.nth(1)).toHaveAttribute('data-color', MAUVE);
  await expect(zones.nth(2)).toHaveAttribute('data-color', GREEN);
  await expect(zones.nth(3)).toHaveAttribute('data-color', PINK);
  // A tap inside a zone selects it (no new zone).
  await tap(20, 280);
  await expect(zones).toHaveCount(4);
  await expect(host.getByTestId('blank-status')).toHaveText('✅ Image aux zones blanches prête', {
    timeout: 10_000,
  });
  await shot(host, 'bucket-editor', true);
  await host.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(host.getByRole('button', { name: 'Enregistré ✓' })).toBeVisible();
  const saved = (await (
    await hostContext.request.get(`${SERVER_URL}/api/quizzes/${quizId}`)
  ).json()) as QuizDetail;
  const q = saved.questions[0]!;
  if (q.type !== 'COLORS') throw new Error('expected COLORS');
  expect(q.zones.map((z) => z.color)).toEqual([PINK, MAUVE, GREEN, PINK]);
  expect(q.zones.every((z) => 'tolerance' in z && z.tolerance === 30)).toBe(true);
  expect(q.blankImageUrl).toMatch(/\/uploads\/[0-9a-f]{32}\.png$/);
  // The blank picture: the zones white, the black lines kept.
  expect(await pixel(host, q.blankImageUrl!, 60, 40)).toBe('255,255,255');
  expect(await pixel(host, q.blankImageUrl!, 410, 150)).toBe('255,255,255');
  expect(await pixel(host, q.blankImageUrl!, 160, 150)).toBe('0,0,0');

  // The editor on a phone: no horizontal scroll.
  const small = await browser.newContext({
    viewport: { width: 375, height: 812 },
    storageState: await hostContext.storageState(),
  });
  const phoneEditor = await small.newPage();
  await phoneEditor.goto(`/editor/${quizId}`);
  await expect(phoneEditor.getByTestId('bucket-zone')).toHaveCount(4);
  await expect(phoneEditor.getByTestId('blank-status')).toHaveText(
    '✅ Image aux zones blanches prête',
  );
  expect(
    await phoneEditor.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
  await shot(phoneEditor, 'bucket-editor-phone', true);
  await small.close();

  // ---- Game ----
  await host.goto(`/host/new?quizId=${quizId}`);
  await expect(host).toHaveURL(/\/host\/\d{6}$/);
  const pin = new URL(host.url()).pathname.split('/').pop()!;
  const frames: Record<string, string[]> = { Alice: [], Bob: [] };
  const phones = await Promise.all(
    (['Alice', 'Bob'] as const).map(async (nickname) => {
      const { defaultBrowserType: _b, ...phone } = devices['Pixel 7'];
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

  // Memorizing: the colored picture on the TV.
  await expect(host.getByTestId('colors-stage')).toHaveText('👀 Mémorisez les couleurs !');
  await expect(host.getByTestId('color-board-picture')).toHaveAttribute(
    'src',
    new RegExp(imageName),
  );
  await expect(alice.getByTestId('colors-memo')).toBeVisible();
  await shot(host, 'bucket-tv-memo');

  // Answers: the blank picture everywhere, only the 3 colors offered (by hue).
  await expect(host.getByTestId('colors-stage')).toHaveText(
    '🎨 À vous ! Remettez les couleurs sur vos téléphones',
    { timeout: 15_000 },
  );
  const blankName = q.blankImageUrl!.split('/').pop()!;
  await expect(host.getByTestId('color-board-picture')).toHaveAttribute(
    'src',
    new RegExp(blankName),
  );
  await expect(host.getByTestId('offered-color')).toHaveCount(3);
  await expect(alice.getByTestId('color-board-picture')).toHaveAttribute(
    'src',
    new RegExp(blankName),
  );
  const offered = alice.getByTestId('colors-palette').getByRole('button');
  await expect(offered).toHaveCount(3);
  expect(await offered.evaluateAll((els) => els.map((e) => e.getAttribute('data-hex')))).toEqual([
    GREEN,
    MAUVE,
    PINK,
  ]);
  await expect(alice.getByTestId('color-spot')).toHaveCount(4);
  await shot(host, 'bucket-tv-answer');
  // Alice: all right. Bob gets the mauve / green bands the wrong way round, then taps the
  // mauve band far from its number: the nearest marker (zone 2) is selected.
  await paint(alice, [PINK, MAUVE, GREEN, PINK]);
  await shot(alice, 'bucket-phone-answer');
  await paint(bob, [PINK, GREEN, MAUVE, PINK]);
  const bobBoard = bob.getByTestId('color-board');
  const bb = (await bobBoard.boundingBox())!;
  await bobBoard.click({ position: { x: (300 / W) * bb.width, y: (260 / H) * bb.height } });
  await expect(bob.getByTestId('colors-zone')).toHaveText('Zone 2');
  // Before the reveal, the phones never got the zone colors nor the colored picture.
  for (const f of [frames.Alice!, frames.Bob!]) {
    const all = f.join('\n');
    expect(all).not.toContain('"color":');
    expect(all).not.toContain(`"colors":["${PINK}"`);
    expect(all).not.toContain(imageName);
  }
  await alice.getByRole('button', { name: 'Valider (4/4)' }).click();
  await bob.getByRole('button', { name: 'Valider (4/4)' }).click();

  // ---- Reveal ----
  await expect(alice.getByRole('heading', { name: 'Correct !' })).toBeVisible();
  await expect(alice.getByTestId('colors-result')).toHaveText('4 / 4 bonnes couleurs');
  await expect(bob.getByRole('heading', { name: 'Presque !' })).toBeVisible();
  await expect(bob.getByTestId('colors-result')).toHaveText('2 / 4 bonnes couleurs');
  // The result shows the colored picture, now that the answer is out.
  await expect(bob.getByTestId('color-board-picture')).toHaveAttribute(
    'src',
    new RegExp(imageName),
  );
  const answers = host.getByTestId('colors-answers').getByRole('listitem');
  await expect(answers.nth(0)).toContainText('4/4');
  await expect(answers.nth(1)).toContainText('2/4');
  await shot(host, 'bucket-tv-reveal');
  await shot(bob, 'bucket-phone-result');

  for (const p of phones) await p.context.close();
  await hostContext.close();
});
