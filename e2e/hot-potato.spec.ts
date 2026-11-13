import { expect, test, devices, type Page } from '@playwright/test';
import type { GameReport, GameSummary, QuizDetail, QuizInput } from '@lbq/shared';

/**
 * « Patate chaude » (T63): a host screen and three phones, a 20 s fuse. Whoever holds the bomb
 * first answers wrong (locked 2 s), then right twice (two passes); the TV reloads mid-round and
 * gets the holder and the sub-question back. The fuse goes off: the holder loses, the others
 * survive. Only the holder's phone ever gets a sub-question, and no frame tells the right choice
 * nor the fuse before the reveal.
 *
 * Needs a database (host account, DB quiz): runs only when `E2E_DATABASE_URL` is set.
 */
test.skip(!process.env.E2E_DATABASE_URL, 'E2E_DATABASE_URL not set (needs Postgres)');

const SERVER_URL = `http://localhost:${process.env.E2E_SERVER_PORT ?? 3004}`;
const stamp = Date.now();
const SHOTS = process.env.E2E_SHOTS;

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

const recordFrames = (page: Page, into: string[]) =>
  page.on('websocket', (ws) =>
    ws.on('framereceived', (f) => into.push(typeof f.payload === 'string' ? f.payload : '')),
  );

/** Socket.IO event frames (`42["event",{…}]`) as [event, payload]. */
function events(frames: string[]): [string, Record<string, unknown>][] {
  return frames.flatMap((f) => {
    const m = /^\d+(\[.*\])$/s.exec(f);
    if (!m) return [];
    try {
      const [event, payload] = JSON.parse(m[1]!) as [string, Record<string, unknown>];
      return [[event, payload]];
    } catch {
      return [];
    }
  });
}

/** Sub-question text → its right choice. */
const SUBS = [
  { text: 'Combien font 1 + 1 ?', choices: ['3', '2', '11'], correct: 1 },
  { text: 'De quelle couleur est le ciel ?', choices: ['Bleu', 'Vert'], correct: 0 },
  { text: 'Combien de pattes a un chat ?', choices: ['2', '6', '4', '8'], correct: 2 },
  { text: 'Quelle est la capitale de la France ?', choices: ['Lyon', 'Paris'], correct: 1 },
];
const right = (text: string) => {
  const s = SUBS.find((x) => x.text === text)!;
  return s.choices[s.correct]!;
};
const wrong = (text: string) => {
  const s = SUBS.find((x) => x.text === text)!;
  return s.choices[(s.correct + 1) % s.choices.length]!;
};

test('« Patate chaude »: passes, wrong answer, TV reload, explosion and report', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const hostContext = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const reg = await hostContext.request.post(`${SERVER_URL}/api/auth/register`, {
    data: { email: `potato-${stamp}@e2e.test`, name: 'Tim', password: 'password123' },
  });
  expect(reg.status()).toBe(201);
  const input: QuizInput = {
    title: `Patate ${stamp}`,
    questions: [
      {
        type: 'HOT_POTATO',
        text: 'Patate chaude : ne gardez pas la bombe !',
        timeLimitSec: 20,
        basePoints: 1000,
        potato: { questions: SUBS, fuseMinSec: 20, fuseMaxSec: 20 },
        explanation: 'La patate chaude est un jeu d’enfants : on se passe vite un objet brûlant.',
      },
    ],
  };
  const created = await hostContext.request.post(`${SERVER_URL}/api/quizzes`, { data: input });
  expect(created.status()).toBe(201);
  const { id: quizId } = (await created.json()) as QuizDetail;

  // ---- Editor: the type and its fields ----
  const host = await hostContext.newPage();
  await host.goto(`/editor/${quizId}`);
  await expect(host.getByRole('radio', { name: 'Patate chaude' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(host.getByLabel('Petite question 2', { exact: true })).toHaveValue(SUBS[1]!.text);
  await expect(host.getByLabel('Mèche : au moins')).toHaveValue('20');
  await host.getByTestId('potato-subs').scrollIntoViewIfNeeded();
  await shot(host, 'potato-editor');

  // ---- Lobby: three phones, recording what the server sends them; the TV too ----
  const tvFrames: string[] = [];
  recordFrames(host, tvFrames);
  await host.goto(`/host/new?quizId=${quizId}`);
  await expect(host).toHaveURL(/\/host\/\d{6}$/);
  const pin = new URL(host.url()).pathname.split('/').pop()!;
  const names = ['Alice', 'Bob', 'Chloé'] as const;
  const frames: Record<string, string[]> = { Alice: [], Bob: [], Chloé: [] };
  const pages: Record<string, Page> = {};
  const contexts = [];
  for (const nickname of names) {
    const context = await browser.newContext({ ...devices['Pixel 7'] });
    const page = await context.newPage();
    recordFrames(page, frames[nickname]!);
    await page.goto(`/join?pin=${pin}`);
    await page.getByPlaceholder('Ton pseudo').fill(nickname);
    await page.getByRole('button', { name: 'Entrer' }).click();
    await expect(host.getByRole('button', { name: nickname })).toBeVisible();
    pages[nickname] = page;
    contexts.push(context);
  }
  await host.getByRole('button', { name: 'Commencer' }).click();

  // ---- The round: no clock, the bomb and the holder ----
  await expect(host.getByTestId('potato-stage')).toBeVisible({ timeout: 15_000 });
  await expect(host.getByTestId('question-type')).toHaveText('💣 Patate chaude');
  const holderName = async () =>
    ((await host.getByTestId('potato-holder-name').textContent()) ?? '').trim();
  const holderPage = async () => pages[await holderName()]!;
  let first = await holderName();
  expect(names).toContain(first);
  let page = pages[first]!;
  await expect(page.getByTestId('potato-holder-pad')).toBeVisible();
  for (const n of names)
    if (n !== first)
      await expect(pages[n]!.getByTestId('potato-wait')).toContainText(`${first} a la patate !`);
  await expect(page.getByTestId('countdown')).toHaveCount(0);
  await shot(host, 'potato-tv-round');
  await shot(page, 'potato-phone-holder');
  await shot(pages[names.find((n) => n !== first)!]!, 'potato-phone-wait');

  // A wrong answer: locked, then the next sub-question.
  let text = (await page.getByTestId('potato-sub-text').textContent())!;
  await page.getByRole('button', { name: wrong(text), exact: true }).click();
  await expect(page.getByTestId('potato-locked')).toBeVisible();
  await expect(host.getByTestId('potato-wrong')).toBeVisible();
  await shot(page, 'potato-phone-wrong');
  await shot(host, 'potato-tv-wrong');
  await expect(page.getByTestId('potato-locked')).toHaveCount(0, { timeout: 4000 });
  expect(await holderName()).toBe(first);

  // Two passes.
  for (let i = 0; i < 2; i++) {
    page = await holderPage();
    text = (await page.getByTestId('potato-sub-text').textContent())!;
    const before = await holderName();
    await page.getByRole('button', { name: right(text), exact: true }).click();
    await expect.poll(holderName).not.toBe(before);
    await expect(page.getByTestId('potato-wait')).toContainText('Passée !');
  }
  await expect(host.getByTestId('potato-passes')).toHaveText('2');
  first = await holderName();

  // The TV reloads: the holder and the sub-question come back.
  await host.reload();
  await expect(host.getByTestId('potato-holder')).toContainText(first);
  await expect(host.getByTestId('potato-sub')).toBeVisible();

  // Before the reveal: a sub-question only ever reached the phone holding the bomb, and nothing
  // tells the right choice nor the fuse (20 s).
  for (const n of names) {
    for (const [event, payload] of events(frames[n]!)) {
      if (event !== 'question:prompt') continue;
      const potato = payload.potato as { sub?: unknown; holder?: { nickname: string } } | undefined;
      if (potato?.sub) expect(potato.holder?.nickname).toBe(n);
    }
  }
  for (const all of [...names.map((n) => frames[n]!), tvFrames]) {
    const text = all.join('\n');
    expect(text).not.toMatch(/"correct":/);
    expect(text).not.toMatch(/"remainingMs":\d+[^}]*"potato"/);
    expect(text).not.toMatch(/fuse(Ms|Sec)":20000/);
  }

  // ---- The fuse goes off ----
  await expect(host.getByTestId('potato-reveal')).toBeVisible({ timeout: 25_000 });
  const loser = first;
  await expect(host.getByTestId('potato-loser')).toContainText(loser);
  await expect(host.getByTestId('potato-scores').locator('li')).toHaveCount(3);
  await expect(pages[loser]!.getByRole('heading', { name: /Boum/ })).toBeVisible();
  for (const n of names)
    if (n !== loser)
      await expect(pages[n]!.getByRole('heading', { name: 'Sauvé !' })).toBeVisible();
  await expect(host.getByTestId('explanation')).toBeVisible();
  await expect(host.getByRole('button', { name: 'Voir le podium' })).toBeInViewport();
  if (SHOTS) await host.waitForTimeout(2500);
  await shot(host, 'potato-tv-reveal');
  await shot(pages[loser]!, 'potato-phone-boom');
  await shot(pages[names.find((n) => n !== loser)!]!, 'potato-phone-saved');

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
  expect(report.questions[0]!.details.potato).toMatchObject({ loser: { nickname: loser } });
  await host.goto(`/reports/${game.id}`);
  await expect(host.getByText('2 / 3 joueur')).toBeVisible();
  await expect(host.getByTestId('potato-report')).toContainText(`${loser} a explosé`);
  await shot(host, 'potato-report');

  for (const c of contexts) await c.close();
  await hostContext.close();
});
