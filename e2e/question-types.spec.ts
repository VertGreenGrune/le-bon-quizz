import { crc32, deflateSync } from 'node:zlib';
import { expect, test, devices, type Page } from '@playwright/test';
import type { GameReport, GameSummary, QuizDetail, QuizInput } from '@lbq/shared';

/**
 * T27 question types: one game with an ORDER, a PIN, a « Qui de nous ? » and a word cloud
 * question, a host screen and two phones, then the game report. Also checks that the phones never
 * receive the right order nor the PIN zone.
 *
 * Needs a database (host account, upload, DB quiz): runs only when `E2E_DATABASE_URL` is set.
 */
test.skip(!process.env.E2E_DATABASE_URL, 'E2E_DATABASE_URL not set (needs Postgres)');

const SERVER_URL = `http://localhost:${process.env.E2E_SERVER_PORT ?? 3004}`;
const stamp = Date.now();

/** A plain 400×240 PNG (big enough to tap a point on it). */
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

const ITEMS = ['Beetlejuice', 'Batman', 'Ed Wood'];

/** Taps the PIN picture at a point given in picture fractions. */
async function tapPicture(page: Page, x: number, y: number) {
  const picture = page.getByTestId('pin-picture');
  await expect.poll(async () => (await picture.boundingBox())?.width ?? 0).toBeGreaterThan(100);
  const box = (await picture.boundingBox())!;
  await picture.click({ position: { x: box.width * x, y: box.height * y } });
}

/** Puts the phone's ORDER list in the right order with the ↑ buttons. */
async function sortItems(page: Page) {
  for (let target = 0; target < ITEMS.length; target++) {
    const shown = await page.getByTestId('order-item').allInnerTexts();
    let at = shown.findIndex((t) => t.includes(ITEMS[target]!));
    while (at > target) {
      await page.getByRole('button', { name: `Monter ${ITEMS[target]}` }).click();
      at--;
    }
  }
}

test('ordre, point sur l’image, « Qui de nous ? » and word cloud, up to the report', async ({
  browser,
}) => {
  const hostContext = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const reg = await hostContext.request.post(`${SERVER_URL}/api/auth/register`, {
    data: { email: `types-${stamp}@e2e.test`, name: 'Tim', password: 'password123' },
  });
  expect(reg.status()).toBe(201);
  const uploaded = await hostContext.request.post(`${SERVER_URL}/api/uploads/image`, {
    multipart: { file: { name: 'carte.png', mimeType: 'image/png', buffer: png(400, 240) } },
  });
  expect(uploaded.status()).toBe(201);
  const { url: imageUrl } = (await uploaded.json()) as { url: string };

  const base = { timeLimitSec: 60, basePoints: 1000 as const };
  const input: QuizInput = {
    title: `Nouveaux types ${stamp}`,
    questions: [
      { ...base, type: 'ORDER', text: 'Du plus ancien au plus récent', items: ITEMS },
      {
        ...base,
        type: 'PIN',
        text: 'Où est le trésor ?',
        imageUrl,
        zone: { x: 0.25, y: 0.5, radius: 0.15 },
      },
      {
        ...base,
        basePoints: 0,
        type: 'WHO_OF_US',
        text: 'Qui rate toujours son train ?',
        majorityBonus: true,
      },
      { ...base, basePoints: 0, type: 'WORD_CLOUD', text: 'Tim Burton en un mot' },
    ],
  };
  const created = await hostContext.request.post(`${SERVER_URL}/api/quizzes`, { data: input });
  expect(created.status()).toBe(201);
  const { id: quizId } = (await created.json()) as QuizDetail;

  // ---- Editor: the ORDER question shows its items in the right order ----
  const host = await hostContext.newPage();
  await host.goto(`/editor/${quizId}`);
  await expect(host.getByRole('radio', { name: 'Ordre' })).toHaveAttribute('aria-checked', 'true');
  await expect(host.getByRole('textbox', { name: 'Élément 1' })).toHaveValue('Beetlejuice');
  await expect(host.getByRole('textbox', { name: 'Élément 3' })).toHaveValue('Ed Wood');

  // ---- Lobby: two phones, recording what the server sends them ----
  await host.goto(`/host/new?quizId=${quizId}`);
  await expect(host).toHaveURL(/\/host\/\d{6}$/);
  const pin = new URL(host.url()).pathname.split('/').pop()!;
  const frames: string[] = [];
  const phones = await Promise.all(
    ['Alice', 'Bob'].map(async (nickname) => {
      const context = await browser.newContext({ ...devices['Pixel 7'] });
      const page = await context.newPage();
      page.on('websocket', (ws) =>
        ws.on('framereceived', (f) => frames.push(typeof f.payload === 'string' ? f.payload : '')),
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

  // ---- 1. Ordre: Alice sorts the list, Bob sends it as shown (never in the right order) ----
  await expect(host.getByRole('heading', { name: 'Du plus ancien au plus récent' })).toBeVisible();
  await expect(host.getByText('📱 Remets dans l’ordre sur ton téléphone')).toBeVisible();
  await expect(alice.getByRole('heading', { name: 'Remets dans l’ordre' })).toBeVisible();
  await sortItems(alice);
  await alice.getByRole('button', { name: 'Valider' }).click();
  await expect(alice.getByText('Réponse envoyée !')).toBeVisible();
  await bob.getByRole('button', { name: 'Valider' }).click();
  await expect(alice.getByRole('heading', { name: 'Correct !' })).toBeVisible();
  await expect(alice.getByText('3 / 3 bien placés')).toBeVisible();
  await expect(bob.getByRole('heading', { name: 'Raté !' })).toBeVisible();
  await expect(bob.getByText('0 / 3 bien placé')).toBeVisible();
  await expect(host.getByRole('listitem').filter({ hasText: 'Beetlejuice' })).toContainText('✓ 1');
  // T50: each player's list beside the right order (Alice all green, Bob none in place).
  const rows = host.getByTestId('order-answers').getByRole('listitem');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Alice');
  await expect(rows.nth(0)).toContainText('3 / 3');
  await expect(rows.nth(1)).toContainText('Bob');
  await expect(rows.nth(1)).toContainText('0 / 3');
  await host.getByRole('button', { name: 'Suivant' }).click();
  await host.getByRole('button', { name: 'Question suivante' }).click();

  // ---- 2. Point sur l'image: Alice taps the zone, Bob far away ----
  await expect(host.getByText('📍 Touche l’image sur ton téléphone')).toBeVisible();
  await expect(alice.getByRole('heading', { name: 'Touche l’image' })).toBeVisible();
  // Zoom: a drag only moves the picture (no pin), ＋ zooms, the wheel zooms around the cursor;
  // the pin is still measured on the picture as shown, so Alice lands in the zone when zoomed.
  const viewport = alice.getByTestId('pin-viewport');
  await expect.poll(async () => (await viewport.boundingBox())?.width ?? 0).toBeGreaterThan(100);
  const vp = (await viewport.boundingBox())!;
  await alice.getByRole('button', { name: 'Zoomer', exact: true }).click();
  await alice.mouse.move(vp.x + vp.width * 0.6, vp.y + vp.height * 0.6);
  await alice.mouse.down();
  await alice.mouse.move(vp.x + vp.width * 0.4, vp.y + vp.height * 0.4, { steps: 5 });
  await alice.mouse.up();
  await expect(alice.getByTestId('pin-mark')).toHaveCount(0); // dragging doesn't place a pin
  await alice.getByRole('button', { name: 'Voir toute l’image' }).click();
  const target = { x: vp.x + vp.width * 0.25, y: vp.y + vp.height * 0.5 };
  await alice.mouse.move(target.x, target.y);
  await alice.mouse.wheel(0, -200);
  await alice.mouse.wheel(0, -200);
  await alice.mouse.click(target.x, target.y);
  await expect(alice.getByTestId('pin-mark')).toBeVisible();
  await alice.getByRole('button', { name: 'Valider' }).click();
  await tapPicture(bob, 0.95, 0.9);
  await bob.getByRole('button', { name: 'Valider' }).click();
  await expect(alice.getByRole('heading', { name: 'Correct !' })).toBeVisible();
  await expect(bob.getByRole('heading', { name: 'Raté !' })).toBeVisible();
  await expect(host.getByText('1 / 2 dans la zone')).toBeVisible();
  await host.getByRole('button', { name: 'Suivant' }).click();
  await host.getByRole('button', { name: 'Question suivante' }).click();

  // ---- 3. « Qui de nous ? »: both vote for Bob ----
  await expect(host.getByText('🗳️ Vote sur ton téléphone')).toBeVisible();
  await alice.getByRole('button', { name: 'Voter pour Bob' }).click();
  await expect(alice.getByText('Réponse envoyée !')).toBeVisible();
  await bob.getByRole('button', { name: 'Voter pour Bob' }).click();
  await expect(host.getByText('🏆 Légende vivante')).toBeVisible();
  await expect(host.getByText('2 votes')).toBeVisible();
  await expect(bob.getByText('2 votes pour toi !')).toBeVisible();
  await expect(alice.getByText('+ 200 pts : tu as voté comme la majorité !')).toBeVisible();
  await host.getByRole('button', { name: 'Suivant' }).click();
  await host.getByRole('button', { name: 'Question suivante' }).click();

  // ---- 4. Nuage de mots ----
  await expect(host.getByText('☁️ Écris un mot sur ton téléphone')).toBeVisible();
  await alice.getByLabel('Ta réponse').fill('Génial');
  await alice.getByRole('button', { name: 'Valider' }).click();
  await bob.getByLabel('Ta réponse').fill('génial !');
  await bob.getByRole('button', { name: 'Valider' }).click();
  await expect(host.getByTestId('word-cloud')).toHaveText('Génial');
  await expect(alice.getByText('Merci pour ta réponse !')).toBeVisible();
  await host.getByRole('button', { name: 'Voir le podium' }).click();
  await host.getByRole('button', { name: 'Terminer la partie' }).click();

  // The phones got the shuffled items and the picture, never the order nor the zone.
  const phoneData = frames.join('\n');
  expect(phoneData).toContain('question:prompt');
  expect(phoneData).toContain('/uploads/');
  expect(phoneData).not.toContain('"zone"');
  expect(phoneData).not.toContain('radius');
  expect(phoneData).not.toContain('majorityBonus');
  expect(phoneData).not.toContain(JSON.stringify(ITEMS));

  // ---- Report ----
  // Saved right after « Terminer la partie » (asynchronously).
  const findGame = async () => {
    const res = await hostContext.request.get(`${SERVER_URL}/api/games`);
    return ((await res.json()) as GameSummary[]).find((g) => g.quizTitle === input.title);
  };
  await expect.poll(findGame).toBeDefined();
  const game = (await findGame())!;
  const report = (await (
    await hostContext.request.get(`${SERVER_URL}/api/games/${game.id}`)
  ).json()) as GameReport;
  expect(report.questions.map((q) => [q.type, q.correctCount])).toEqual([
    ['ORDER', 1],
    ['PIN', 1],
    ['WHO_OF_US', 0],
    ['WORD_CLOUD', 0],
  ]);
  await host.goto(`/reports/${game.id}`);
  await host.getByRole('combobox').selectOption('quiz');
  await expect(host.getByText('bien placé par 1 / 2').first()).toBeVisible();
  await expect(host.getByText('👑 Bob')).toBeVisible();
  await expect(host.getByText('Génial', { exact: false }).last()).toBeVisible();
  await expect(host.getByText('2 / 2 joueurs ont répondu — pas de bonne réponse')).toBeVisible();

  await Promise.all([hostContext.close(), ...phones.map((p) => p.context.close())]);
});
