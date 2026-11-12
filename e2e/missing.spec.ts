import { deflateSync } from 'node:zlib';
import { expect, test, devices, type Page } from '@playwright/test';
import type { GameReport, GameSummary, QuizDetail, QuizInput } from '@lbq/shared';

/**
 * « Qu'est-ce qui a disparu ? » (T59): a host screen and two phones (Pixel 7, iPhone SE). The TV
 * shows the picture « avant » while memorizing — the phones get nothing of it —, then « après »;
 * the phones get only « après » and tap where the white square was; reveal with the zone and the
 * pins, avant / après toggle; report. The phones' frames are checked for leaks (« avant », zone).
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

/** The element that disappears: a white square centred on (0.7, 0.3) of a 400×300 picture. */
const ZONE = { x: 0.7, y: 0.3, radius: 0.1 };

/** A 400×300 PNG in four colored quarters, with (`withSquare`) or without the white square. */
function picture(withSquare: boolean): Buffer {
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
  const half = 24;
  const cx = ZONE.x * width;
  const cy = ZONE.y * height;
  const rows = Array.from({ length: height }, (_, y) => {
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x++) {
      const square = withSquare && Math.abs(x - cx) < half && Math.abs(y - cy) < half;
      const c = square ? [255, 255, 255] : rgb[(y < height / 2 ? 0 : 2) + (x < width / 2 ? 0 : 1)]!;
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

/** Taps the phone's picture at a point given in picture fractions. */
async function tapPicture(page: Page, x: number, y: number) {
  const pic = page.getByTestId('pin-picture');
  await expect.poll(async () => (await pic.boundingBox())?.width ?? 0).toBeGreaterThan(100);
  const box = (await pic.boundingBox())!;
  await pic.click({ position: { x: box.width * x, y: box.height * y } });
}

const fileName = (url: string) => url.split('/').pop()!;

test('« Qu’est-ce qui a disparu ? »: « avant » on the TV, « après » on the phones, reveal and report', async ({
  browser,
}) => {
  const hostContext = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const reg = await hostContext.request.post(`${SERVER_URL}/api/auth/register`, {
    data: { email: `missing-${stamp}@e2e.test`, name: 'Tim', password: 'password123' },
  });
  expect(reg.status()).toBe(201);
  const upload = async (name: string, buffer: Buffer) => {
    const res = await hostContext.request.post(`${SERVER_URL}/api/uploads/image`, {
      multipart: { file: { name, mimeType: 'image/png', buffer } },
    });
    expect(res.status()).toBe(201);
    return ((await res.json()) as { url: string }).url;
  };
  const avant = await upload('avant.png', picture(true));
  const apres = await upload('apres.png', picture(false));
  expect(fileName(avant)).not.toBe(fileName(apres));
  const input: QuizInput = {
    title: `Disparu ${stamp}`,
    questions: [
      {
        type: 'MISSING',
        text: 'Qu’est-ce qui a disparu du tableau ?',
        imageUrl: avant,
        missingImageUrl: apres,
        zone: ZONE,
        memoSec: 6,
        timeLimitSec: 30,
        basePoints: 1000,
        explanation: 'Le carré blanc était en haut à droite.',
      },
    ],
  };
  const created = await hostContext.request.post(`${SERVER_URL}/api/quizzes`, { data: input });
  expect(created.status()).toBe(201);
  const { id: quizId } = (await created.json()) as QuizDetail;

  // ---- Editor: two pictures, the zone on « avant », avant / après toggle ----
  const host = await hostContext.newPage();
  await host.goto(`/editor/${quizId}`);
  await expect(host.getByRole('radio', { name: 'Qu’est-ce qui a disparu ?' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  const fields = host.getByTestId('missing-fields');
  await expect(fields.getByRole('button', { name: 'Avant' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(fields.getByTestId('pin-picture').locator('img')).toHaveAttribute(
    'src',
    new RegExp(fileName(avant)),
  );
  await shot(host, 'missing-editor', true);
  await fields.getByRole('button', { name: 'Après' }).click();
  await expect(fields.getByTestId('pin-picture').locator('img')).toHaveAttribute(
    'src',
    new RegExp(fileName(apres)),
  );

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
  const noLeak = (all: string) => {
    expect(all).not.toContain(fileName(avant));
    expect(all).not.toContain('"radius"');
    expect(all).not.toContain('"zone"');
  };
  await host.getByRole('button', { name: 'Commencer' }).click();

  // ---- Stage 1: « avant » on the TV, nothing on the phones ----
  await expect(host.getByTestId('missing-stage')).toHaveText(
    '👀 Regardez bien l’image : un élément va disparaître !',
  );
  await expect(host.getByTestId('question-type')).toHaveText('🔍 Qu’est-ce qui a disparu ?');
  await expect(host.getByTestId('missing-picture')).toHaveAttribute('data-side', 'avant');
  await expect(host.getByTestId('missing-picture')).toHaveAttribute(
    'src',
    new RegExp(fileName(avant)),
  );
  await expect(alice.getByTestId('missing-memo')).toBeVisible();
  await expect(bob.getByTestId('missing-memo')).toBeVisible();
  await expect(alice.getByTestId('pin-picture')).toHaveCount(0);
  for (const f of [frames.Alice!, frames.Bob!]) {
    const all = f.join('\n');
    noLeak(all);
    expect(all).not.toContain(fileName(apres));
  }
  await shot(host, 'missing-tv-memo');
  await shot(alice, 'missing-phone-memo');

  // ---- Stage 2: « après » everywhere, the phones tap where the square was ----
  await expect(host.getByTestId('missing-stage')).toHaveText(
    '🔍 Quelque chose a disparu ! Touchez l’endroit sur vos téléphones',
    { timeout: 15_000 },
  );
  await expect(host.getByTestId('missing-picture')).toHaveAttribute('data-side', 'apres');
  // The element disappears during a 1 s blackout (no fade), then « après » shows at once.
  await expect(host.getByTestId('missing-blackout')).toBeVisible();
  await expect(host.getByTestId('missing-blackout')).toBeHidden({ timeout: 3_000 });
  await expect(alice.getByTestId('pin-picture').locator('img')).toHaveAttribute(
    'src',
    new RegExp(fileName(apres)),
  );
  await shot(host, 'missing-tv-answer');
  await tapPicture(alice, 0.72, 0.31);
  await shot(alice, 'missing-phone-answer');
  // Bob (iPhone SE): « Valider » on screen; first a tap far away, cancelled, then near the zone.
  await tapPicture(bob, 0.1, 0.9);
  const validate = bob.getByRole('button', { name: 'Valider' });
  await expect(validate).toBeInViewport({ ratio: 1 });
  await shot(bob, 'missing-phone-se-answer');
  await validate.click();
  await expect(bob.getByText('Réponse envoyée !')).toBeVisible();
  await bob.getByRole('button', { name: /Annuler ma réponse/ }).click();
  await expect(bob.getByText('Réponse envoyée !')).toHaveCount(0);
  await expect(bob.getByTestId('pin-picture')).toHaveCount(1);
  await tapPicture(bob, 0.87, 0.3); // 0.07 beyond the zone: partial points
  await bob.getByRole('button', { name: 'Valider' }).click();
  for (const f of [frames.Alice!, frames.Bob!]) noLeak(f.join('\n'));
  await alice.getByRole('button', { name: 'Valider' }).click();

  // ---- Reveal ----
  await expect(host.getByTestId('missing-reveal')).toBeVisible({ timeout: 10_000 });
  await expect(host.getByTestId('missing-found')).toHaveText('1 / 2 dans la zone');
  await expect(alice.getByRole('heading', { name: 'Correct !' })).toBeVisible();
  await expect(bob.getByRole('heading', { name: 'Presque !' })).toBeVisible();
  const revealImg = host
    .getByTestId('missing-reveal')
    .getByTestId('pin-picture')
    .locator('img')
    .first();
  await expect(revealImg).toHaveAttribute('src', new RegExp(fileName(avant)));
  await shot(host, 'missing-tv-reveal');
  await shot(bob, 'missing-phone-result');
  await host.getByRole('button', { name: 'Après', exact: true }).click();
  await expect(revealImg).toHaveAttribute('src', new RegExp(fileName(apres)));
  await shot(host, 'missing-tv-reveal-apres');

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
  expect(report.questions[0]!.details.missing).toMatchObject({
    imageUrl: avant,
    missingImageUrl: apres,
    zone: ZONE,
  });
  expect(
    report.questions[0]!.details.missing!.pins.map((p) => [p.nickname, p.correct]).sort(),
  ).toEqual([
    ['Alice', true],
    ['Bob', false],
  ]);
  await host.goto(`/reports/${game.id}`);
  await expect(host.getByText('trouvé l’élément disparu').first()).toBeVisible();
  await shot(host, 'missing-report', true);

  for (const p of phones) await p.context.close();
  await hostContext.close();
});
