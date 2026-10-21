import { expect, test, devices, type APIRequestContext } from '@playwright/test';
import type { QuizDetail, QuizInput } from '@lbq/shared';

/**
 * Media questions (T22): a question with a sound clip and a blurred picture is played. The host
 * screen plays the clip and the picture clears up; the phone never receives the sound nor the
 * picture. Also checks the editor's copyright warning when the quiz is made public.
 *
 * Needs a database (host account, uploads, DB quiz): runs only when `E2E_DATABASE_URL` is set.
 */
test.skip(!process.env.E2E_DATABASE_URL, 'E2E_DATABASE_URL not set (needs Postgres)');

const SERVER_URL = `http://localhost:${process.env.E2E_SERVER_PORT ?? 3004}`;
const stamp = Date.now();

/** A tiny valid PNG (1×1). */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

/** `seconds` of a quiet 440 Hz tone, 8 kHz mono 16-bit WAV. */
function wav(seconds: number): Buffer {
  const rate = 8000;
  const samples = rate * seconds;
  const buf = Buffer.alloc(44 + samples * 2);
  buf.write('RIFF', 0, 'latin1');
  buf.writeUInt32LE(36 + samples * 2, 4);
  buf.write('WAVEfmt ', 8, 'latin1');
  buf.writeUInt32LE(16, 16); // fmt chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'latin1');
  buf.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    buf.writeInt16LE(Math.round(2000 * Math.sin((2 * Math.PI * 440 * i) / rate)), 44 + i * 2);
  }
  return buf;
}

async function upload(request: APIRequestContext, kind: 'image' | 'audio', name: string) {
  const [mimeType, buffer] = kind === 'image' ? ['image/png', PNG] : ['audio/wav', wav(8)];
  const res = await request.post(`${SERVER_URL}/api/uploads/${kind}`, {
    multipart: { file: { name, mimeType, buffer } },
  });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { url: string }).url;
}

test('sound clip + blurred picture on the host screen only', async ({ browser }) => {
  const host = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const reg = await host.request.post(`${SERVER_URL}/api/auth/register`, {
    data: { email: `media-${stamp}@e2e.test`, name: 'Mel', password: 'password123' },
  });
  expect(reg.status()).toBe(201);
  const imageUrl = await upload(host.request, 'image', 'affiche.png');
  const audioUrl = await upload(host.request, 'audio', 'generique.wav');

  const input: QuizInput = {
    title: `Blind test ${stamp}`,
    questions: [
      {
        type: 'MCQ',
        text: 'Quel est ce générique ?',
        imageUrl,
        imageEffect: 'blur',
        audio: { url: audioUrl, startSec: 1, durationSec: 5 },
        timeLimitSec: 20,
        basePoints: 1000,
        choices: [
          { text: 'Batman', isCorrect: true },
          { text: 'Superman', isCorrect: false },
        ],
      },
    ],
  };
  const created = await host.request.post(`${SERVER_URL}/api/quizzes`, { data: input });
  expect(created.status()).toBe(201);
  const { id: quizId } = (await created.json()) as QuizDetail;

  // ---- Editor: effect + sound shown; making the quiz public warns about the rights ----
  const page = await host.newPage();
  await page.goto(`/editor/${quizId}`);
  await expect(page.getByRole('radio', { name: 'Flou' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('button', { name: "▶ Écouter l'extrait" })).toBeVisible();
  const warning = 'Vous devez avoir les droits sur les images et sons partagés publiquement.';
  await expect(page.getByText(warning)).toHaveCount(0);
  await page.getByRole('radio', { name: /Public/ }).click();
  await expect(page.getByText(warning)).toBeVisible();
  await page.getByRole('radio', { name: /Privé/ }).click();
  await expect(page.getByText(warning)).toHaveCount(0);

  // ---- Game: one phone, recording everything the server sends it ----
  await page.goto(`/host/new?quizId=${quizId}`);
  await expect(page).toHaveURL(/\/host\/\d{6}$/);
  const pin = new URL(page.url()).pathname.split('/').pop()!;

  const phoneContext = await browser.newContext({ ...devices['Pixel 7'] });
  const phone = await phoneContext.newPage();
  const frames: string[] = [];
  phone.on('websocket', (ws) =>
    ws.on('framereceived', (f) => frames.push(typeof f.payload === 'string' ? f.payload : '')),
  );
  await phone.goto(`/join?pin=${pin}`);
  await phone.getByPlaceholder('Ton pseudo').fill('Zoé');
  await phone.getByRole('button', { name: 'Entrer' }).click();
  await expect(page.getByRole('button', { name: 'Zoé' })).toBeVisible();
  await page.getByRole('button', { name: 'Commencer' }).click();

  await expect(page.getByRole('heading', { name: 'Quel est ce générique ?' })).toBeVisible();
  await expect(page.getByTestId('listen-badge')).toContainText('Écoutez bien !');

  // The clip plays (from the excerpt start) once ANSWERING starts.
  const clip = page.locator('audio[data-testid="question-clip"]');
  await expect
    .poll(() => clip.evaluate((el: HTMLAudioElement) => !el.paused && el.currentTime > 1), {
      timeout: 15_000,
    })
    .toBe(true);

  // The picture clears up over the answering time.
  const img = page.locator('img[data-effect="blur"]');
  const blurPx = () =>
    img.evaluate((el: HTMLImageElement) => Number(/blur\(([\d.]+)px\)/.exec(el.style.filter)?.[1]));
  const first = await blurPx();
  expect(first).toBeGreaterThan(15);
  expect(first).toBeLessThanOrEqual(30);
  await expect.poll(blurPx, { timeout: 10_000 }).toBeLessThan(first - 2);

  // Answering on the phone: the reveal stops the clip and shows the picture clear.
  await phone.getByRole('button', { name: 'Réponse ▲' }).click();
  await expect(phone.getByRole('heading', { name: 'Correct !' })).toBeVisible();
  await expect.poll(() => clip.evaluate((el: HTMLAudioElement) => el.paused)).toBe(true);
  await expect(img).toHaveCount(1);
  expect(await img.evaluate((el: HTMLImageElement) => el.style.filter)).toBe('');

  // The phone got the question (prompt) but never the media.
  expect(frames.some((f) => f.includes('question:prompt'))).toBe(true);
  for (const f of frames) {
    expect(f).not.toContain('/uploads/');
    expect(f).not.toContain('audio');
    expect(f).not.toContain('imageEffect');
  }

  await Promise.all([host.close(), phoneContext.close()]);
});
