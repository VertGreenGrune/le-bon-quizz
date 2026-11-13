import { expect, test, devices, type Page } from '@playwright/test';
import type { GameReport, GameSummary, QuizDetail, QuizInput } from '@lbq/shared';

/**
 * « Pas évident ! » (T60): a host screen and four phones. Alice and Bob both say Maroc (shared:
 * 500 each), Chloé cancels « Paris » then finds Djibouti with a typo (unique: 1000 + 💎), Dan
 * says « Zaïre » (refused) and the host accepts it on the TV. The phones never receive the items
 * nor the others' answers before the reveal; the report keeps the groups.
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

async function say(page: Page, text: string) {
  await page.getByLabel('Ta réponse').fill(text);
  await page.getByRole('button', { name: 'Valider' }).click();
  await expect(page.getByText('Réponse envoyée !')).toBeVisible();
}

const ITEMS = [
  'Maroc',
  'Sénégal',
  'Égypte | Egypte',
  'Djibouti',
  'Lesotho',
  'Madagascar',
  'Burkina Faso',
  'Comores',
  'Érythrée',
  'Tchad',
  'Niger',
  'Gabon',
  'Mali',
];

test('« Pas évident ! »: rare answers score more, accept, reveal and report', async ({
  browser,
}) => {
  const hostContext = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const reg = await hostContext.request.post(`${SERVER_URL}/api/auth/register`, {
    data: { email: `pointless-${stamp}@e2e.test`, name: 'Tim', password: 'password123' },
  });
  expect(reg.status()).toBe(201);
  const input: QuizInput = {
    title: `Pas évident ${stamp}`,
    questions: [
      {
        type: 'POINTLESS',
        text: 'Citez un pays d’Afrique',
        items: ITEMS,
        typoTolerance: true,
        timeLimitSec: 30,
        basePoints: 1000,
        explanation: 'L’Afrique compte 54 pays reconnus par l’ONU.',
      },
    ],
  };
  const created = await hostContext.request.post(`${SERVER_URL}/api/quizzes`, { data: input });
  expect(created.status()).toBe(201);
  const { id: quizId } = (await created.json()) as QuizDetail;

  // ---- Editor: the type and its answers, one per line ----
  const host = await hostContext.newPage();
  await host.goto(`/editor/${quizId}`);
  await expect(host.getByRole('radio', { name: 'Pas évident !' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(host.getByLabel('Bonnes réponses')).toHaveValue(ITEMS.join('\n'));
  await host.getByLabel('Bonnes réponses').scrollIntoViewIfNeeded();
  await shot(host, 'pointless-editor');

  // ---- Lobby: four phones, recording what the server sends them ----
  await host.goto(`/host/new?quizId=${quizId}`);
  await expect(host).toHaveURL(/\/host\/\d{6}$/);
  const pin = new URL(host.url()).pathname.split('/').pop()!;
  const names = ['Alice', 'Bob', 'Chloé', 'Dan'];
  const frames: string[] = [];
  const phones = await Promise.all(
    names.map(async (nickname) => {
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
  const [alice, bob, chloe, dan] = phones.map((p) => p.page) as [Page, Page, Page, Page];
  await host.getByRole('button', { name: 'Commencer' }).click();

  // ---- Answering ----
  await expect(host.getByTestId('question-type')).toHaveText('💎 Pas évident !');
  await expect(host.getByText('💎 Une seule réponse : la plus rare possible !')).toBeVisible();
  await expect(alice.getByRole('heading', { name: 'Une seule réponse' })).toBeVisible();
  await shot(alice, 'pointless-phone-answer');
  await say(alice, 'maroc');
  await say(bob, 'Le Maroc');
  await say(chloe, 'Paris');
  await chloe.getByRole('button', { name: /Annuler ma réponse/ }).click();
  await say(chloe, 'Djibuti');
  await shot(host, 'pointless-tv-answering');
  // Before the reveal: no item, no answer of anybody in any phone's frames.
  const before = frames.join('\n').toLowerCase();
  for (const word of ['maroc', 'djibouti', 'lesotho', 'paris', 'sénégal', 'senegal'])
    expect(before).not.toContain(word);
  await say(dan, 'Zaïre');

  // ---- Reveal (everyone answered: 2 s later) ----
  const right = host.getByTestId('pointless-right');
  await expect(right).toHaveCount(2);
  await expect(right.nth(0)).toContainText('💎 Djibouti');
  await expect(right.nth(0)).toContainText('+1000');
  await expect(right.nth(1)).toContainText('Maroc');
  await expect(right.nth(1)).toContainText('+500');
  await expect(host.getByTestId('pointless-wrong')).toContainText('Zaïre');
  await expect(host.getByTestId('pointless-missed')).toContainText('Personne n’a pensé à');
  await expect(host.getByTestId('pointless-missed')).toContainText('Lesotho');
  await expect(chloe.getByRole('heading', { name: '💎 Pas évident !' })).toBeVisible();
  await expect(chloe.getByTestId('pointless-line')).toHaveText('Personne d’autre n’y a pensé !');
  await expect(chloe.getByText('+ 1000 pts')).toBeVisible();
  await expect(alice.getByRole('heading', { name: 'Bien vu !' })).toBeVisible();
  await expect(alice.getByTestId('pointless-line')).toContainText('2 joueurs ont dit Maroc');
  await expect(alice.getByText('+ 500 pts')).toBeVisible();
  await expect(dan.getByRole('heading', { name: 'Raté !' })).toBeVisible();
  await shot(host, 'pointless-tv-reveal');
  await shot(alice, 'pointless-phone-shared');

  // ---- The host accepts « Zaïre » on the TV: a new unique answer ----
  await host.getByTestId('pointless-wrong').getByTestId('accept-button').click();
  await expect(right).toHaveCount(3);
  await expect(host.getByTestId('pointless-wrong')).toHaveCount(0);
  await expect(dan.getByRole('heading', { name: '💎 Pas évident !' })).toBeVisible();
  await expect(dan.getByTestId('accepted-note')).toBeVisible();
  if (SHOTS) await host.waitForTimeout(1500); // the new row slides in
  await shot(host, 'pointless-tv-accepted');
  await shot(chloe, 'pointless-phone-unique');

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
  expect(
    report.questions[0]!.details.pointless!.answers.map((a) => [a.text, a.players.length]),
  ).toEqual([
    ['Djibouti', 1],
    ['Zaïre', 1],
    ['Maroc', 2],
  ]);
  await host.goto(`/reports/${game.id}`);
  await expect(host.getByText('4 / 4 joueurs ont donné une bonne réponse')).toBeVisible();
  await shot(host, 'pointless-report');

  for (const p of phones) await p.context.close();
  await hostContext.close();
});
