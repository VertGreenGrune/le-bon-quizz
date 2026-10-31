import { crc32, deflateSync } from 'node:zlib';
import { expect, test, devices, type Page } from '@playwright/test';
import type { QuizDetail, QuizInput } from '@lbq/shared';

/**
 * T41: in a game with jokers, « Valider » stays visible and tappable on the tall answer screens
 * (picture to tap, list to order, slider) of a big and a small phone — the hand is a « 🃏 n »
 * button in the header there. Also: the points earned shown on the TV leaderboard, the TV's two
 * volumes and the phone's full-screen button.
 *
 * Needs a database (host account, upload, DB quiz): runs only when `E2E_DATABASE_URL` is set.
 */
test.skip(!process.env.E2E_DATABASE_URL, 'E2E_DATABASE_URL not set (needs Postgres)');

const SERVER_URL = `http://localhost:${process.env.E2E_SERVER_PORT ?? 3004}`;
const stamp = Date.now();

/** A tall plain PNG (portrait: the hardest case for the height). */
function png(width: number, height: number): Buffer {
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
  header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x5a)]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: height }, () => row)))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** « Valider » is fully on screen and nothing covers it (Playwright's click checks that). */
async function validate(page: Page) {
  const button = page.getByRole('button', { name: 'Valider' });
  await expect(button).toBeInViewport({ ratio: 1 });
  await button.click({ timeout: 5_000 });
  // Sent (the last answer goes straight to the result).
  await expect(button).toBeHidden();
}

test('« Valider » stays reachable with jokers on 2 phone sizes; gains on the TV', async ({
  browser,
}) => {
  const hostContext = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const reg = await hostContext.request.post(`${SERVER_URL}/api/auth/register`, {
    data: { email: `layout-${stamp}@e2e.test`, name: 'Tim', password: 'password123' },
  });
  expect(reg.status()).toBe(201);
  const uploaded = await hostContext.request.post(`${SERVER_URL}/api/uploads/image`, {
    multipart: { file: { name: 'affiche.png', mimeType: 'image/png', buffer: png(300, 600) } },
  });
  expect(uploaded.status()).toBe(201);
  const { url: imageUrl } = (await uploaded.json()) as { url: string };

  const base = { timeLimitSec: 60, basePoints: 1000 as const };
  const input: QuizInput = {
    title: `Mise en page ${stamp}`,
    questions: [
      {
        ...base,
        type: 'PIN',
        text: 'Où est la signature ?',
        imageUrl,
        zone: { x: 0.5, y: 0.5, radius: 0.2 },
      },
      {
        ...base,
        type: 'ORDER',
        text: 'Du plus ancien au plus récent',
        items: ['Un', 'Deux', 'Trois', 'Quatre', 'Cinq', 'Six'],
      },
      {
        ...base,
        type: 'SLIDER',
        text: 'Combien ?',
        slider: { min: 0, max: 100, step: 1, correct: 50, margin: 5 },
      },
    ],
  };
  const created = await hostContext.request.post(`${SERVER_URL}/api/quizzes`, { data: input });
  expect(created.status()).toBe(201);
  const { id: quizId } = (await created.json()) as QuizDetail;

  const host = await hostContext.newPage();
  await host.goto(`/host/new?quizId=${quizId}&jokers=1`);
  await expect(host).toHaveURL(/\/host\/\d{6}$/);
  const pin = new URL(host.url()).pathname.split('/').pop()!;

  // ---- TV: two volumes, remembered ----
  await host.getByRole('button', { name: 'Réglages du son' }).click();
  await host.getByTestId('volume-music').fill('30');
  await expect(host.getByRole('dialog', { name: 'Réglages du son' })).toContainText('30 %');
  expect(await host.evaluate(() => localStorage.getItem('lbq:host:music-volume'))).toBe('30');
  expect(await host.evaluate(() => localStorage.getItem('lbq:host:clip-volume'))).toBe('100');
  await host.keyboard.press('Escape');

  const phones = await Promise.all(
    [
      ['Alice', devices['Pixel 7']],
      ['Bob', devices['iPhone SE']],
    ].map(async ([nickname, device]) => {
      const context = await browser.newContext({ ...(device as (typeof devices)[string]) });
      const page = await context.newPage();
      await page.goto(`/join?pin=${pin}`);
      await page.getByPlaceholder('Ton pseudo').fill(nickname as string);
      await page.getByRole('button', { name: 'Entrer' }).click();
      await expect(host.getByRole('button', { name: nickname as string })).toBeVisible();
      return page;
    }),
  );
  const [alice, bob] = phones as [Page, Page];

  // ---- Phone full screen (Chromium has the API) ----
  await alice.getByTestId('fullscreen-button').click();
  await expect(alice.getByTestId('fullscreen-button')).toHaveText(/Quitter le plein écran/);
  await alice.getByTestId('fullscreen-button').click();
  await expect(alice.getByTestId('fullscreen-button')).toHaveText(/Plein écran/);

  await host.getByRole('button', { name: 'Commencer' }).click();

  // ---- 1. Point sur l'image: the hand is in the header, « Valider » reachable ----
  for (const phone of phones) {
    await expect(phone.getByRole('heading', { name: 'Touche l’image' })).toBeVisible();
    await expect(phone.getByTestId('joker-chip')).toBeVisible();
    await expect(phone.getByTestId('joker-bar')).toHaveCount(0);
    const picture = phone.getByTestId('pin-picture');
    await expect.poll(async () => (await picture.boundingBox())?.height ?? 0).toBeGreaterThan(80);
    const box = (await picture.boundingBox())!;
    await picture.click({ position: { x: box.width * 0.5, y: box.height * 0.5 } });
    await expect(phone.getByRole('button', { name: 'Zoomer', exact: true })).toBeInViewport();
  }
  // The chip opens the hand, then the usual joker sheet.
  await alice.getByTestId('joker-chip').click();
  await expect(alice.getByRole('dialog', { name: 'Mes jokers' })).toBeVisible();
  await alice.getByRole('button', { name: 'Fermer' }).click();
  await validate(alice);
  await validate(bob);
  await expect(alice.getByRole('heading', { name: 'Correct !' })).toBeVisible();
  await host.getByRole('button', { name: 'Suivant' }).click();

  // ---- TV leaderboard: what each one earned on the question ----
  await expect(host.getByRole('heading', { name: 'Classement' })).toBeVisible();
  await expect(host.getByTestId('gain')).toHaveCount(2);
  await expect(host.getByTestId('gain').first()).toHaveText(/^\+\d+$/);
  await host.getByRole('button', { name: 'Question suivante' }).click();

  // ---- 2. Ordre (6 items) and 3. Curseur ----
  for (const heading of ['Remets dans l’ordre', null]) {
    for (const phone of phones) {
      if (heading) await expect(phone.getByRole('heading', { name: heading })).toBeVisible();
      else await expect(phone.getByRole('slider')).toBeVisible();
      await expect(phone.getByTestId('joker-chip')).toBeVisible();
      await validate(phone);
    }
    await expect(host.getByRole('button', { name: 'Suivant' })).toBeVisible();
    await host.getByRole('button', { name: 'Suivant' }).click();
    if (heading) await host.getByRole('button', { name: 'Question suivante' }).click();
  }
  await expect(host.getByRole('button', { name: 'Voir le podium' })).toBeVisible();
});
