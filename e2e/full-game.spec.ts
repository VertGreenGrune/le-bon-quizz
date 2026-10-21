import { expect, test, devices, type Browser, type Page } from '@playwright/test';
import { DEMO_QUIZ } from '@lbq/shared';
import { answerOnPhone, expectHostReveal, resultHeading, type Plan } from './answers';

/**
 * 1 host (shared screen) + 3 phones play the whole demo quiz up to the podium: every question
 * type (choices, true/false, poll, typed answer, slider).
 *
 * Answer plan (so the final ranking is deterministic whatever the response times):
 * - Alice: always right       → ≥ 500 pts per scored question (6), ≥ 3000 in total
 * - Bob:   right on Q1 and Q2 → ≤ 2100 in total (streak bonus included)
 * - Chloé: always wrong       → 0
 * Everybody votes on the poll (no points).
 *
 * The host screen is reloaded in the middle of question RELOAD_AT (after one answer) and must
 * resume the game (`host:rejoin`).
 */
const vote = (q: number, plan: Plan): Plan =>
  DEMO_QUIZ.questions[q]!.type === 'POLL' ? 'vote' : plan;

const PLAYERS: { nickname: string; plan: (q: number) => Plan }[] = [
  { nickname: 'Alice', plan: (q) => vote(q, 'right') },
  { nickname: 'Bob', plan: (q) => vote(q, q < 2 ? 'right' : 'wrong') },
  { nickname: 'Chloé', plan: (q) => vote(q, 'wrong') },
];
const RELOAD_AT = 2; // 20 s question: leaves time for the reload

async function newPhone(browser: Browser): Promise<Page> {
  // Separate context per phone: own sessionStorage + own socket, like a real device.
  const context = await browser.newContext({ ...devices['Pixel 7'] });
  return context.newPage();
}

test('host + 3 players play the demo quiz to the podium', async ({ browser }) => {
  // ---- Host creates the game ----
  const hostContext = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const host = await hostContext.newPage();
  await host.goto('/host/new');
  await expect(host).toHaveURL(/\/host\/\d{6}$/);
  const pin = new URL(host.url()).pathname.split('/').pop()!;
  await expect(host.getByText(pin, { exact: true })).toBeVisible();
  await expect(host.getByText('En attente des joueurs…')).toBeVisible();

  // ---- Players join from their phones ----
  const phones: Page[] = [];
  for (const p of PLAYERS) {
    const phone = await newPhone(browser);
    await phone.goto(`/join?pin=${pin}`);
    await expect(phone.getByPlaceholder('123456')).toHaveValue(pin);
    await phone.getByPlaceholder('Ton pseudo').fill(p.nickname);
    await phone.getByRole('button', { name: 'Entrer' }).click();
    await expect(phone).toHaveURL(/\/play$/);
    await expect(phone.getByText('Tu es dans la partie !')).toBeVisible();
    await expect(host.getByRole('button', { name: p.nickname })).toBeVisible();
    phones.push(phone);
  }
  await expect(host.getByText('3', { exact: true })).toBeVisible();

  // ---- Start ----
  await host.getByRole('button', { name: 'Commencer' }).click();

  const total = DEMO_QUIZ.questions.length;
  for (let q = 0; q < total; q++) {
    const question = DEMO_QUIZ.questions[q]!;

    // Intro: question on the shared screen, "get ready" on phones.
    await expect(host.getByText(`Question ${q + 1} / ${total}`).first()).toBeVisible();
    await expect(host.getByRole('heading', { name: question.text })).toBeVisible();

    // Answering (after the ~3 s intro): shape buttons, a text field or a slider.
    for (const [i, phone] of phones.entries()) {
      await answerOnPhone(phone, question, PLAYERS[i]!.plan(q));
      // The last answer triggers the reveal right away, so its "sent" screen may be skipped.
      if (i < phones.length - 1) await expect(phone.getByText('Réponse envoyée !')).toBeVisible();

      if (q === RELOAD_AT && i === 0) {
        await host.reload();
        await expect(host.getByRole('heading', { name: question.text })).toBeVisible();
        await expect(host.getByText('/ 3')).toBeVisible(); // answer counter resynced (1 / 3)
        await expect(host.getByText('1', { exact: true })).toBeVisible();
        await expect(host.getByRole('button', { name: 'Passer' })).toBeVisible();
      }
    }

    // Everybody answered → server reveals immediately (no need to wait for the timer).
    for (const [i, phone] of phones.entries()) {
      const heading = resultHeading(question, PLAYERS[i]!.plan(q));
      await expect(phone.getByRole('heading', { name: heading })).toBeVisible();
    }
    await expectHostReveal(host, question);
    // Host reveal: "Suivant" button and the 3 answers counted.
    await expect(host.getByRole('button', { name: 'Suivant' })).toBeVisible();
    await expect(host.getByText('/ 3')).toBeVisible();

    // Leaderboard.
    await host.getByRole('button', { name: 'Suivant' }).click();
    await expect(host.getByRole('heading', { name: 'Classement' })).toBeVisible();
    await expect(host.locator('ol > li').first()).toContainText('Alice');
    await expect(phones[0]!.getByText("Regarde le classement sur l'écran")).toBeVisible();

    const isLast = q === total - 1;
    await host
      .getByRole('button', { name: isLast ? 'Voir le podium' : 'Question suivante' })
      .click();
  }

  // ---- Podium ----
  await expect(host.getByRole('heading', { name: 'Podium' })).toBeVisible();
  for (const name of ['Alice', 'Bob', 'Chloé']) {
    await expect(host.getByText(name, { exact: true })).toBeVisible();
  }
  await expect(host.getByText('0 pts', { exact: true })).toBeVisible(); // Chloé
  await expect(phones[0]!.getByRole('heading', { name: /tu es 1/i })).toBeVisible();
  await expect(phones[1]!.getByRole('heading', { name: /tu es 2/i })).toBeVisible();
  await expect(phones[2]!.getByRole('heading', { name: /tu es 3/i })).toBeVisible();

  // ---- End ----
  await host.getByRole('button', { name: 'Terminer la partie' }).click();
  await expect(host.getByRole('link', { name: "Retour à l'accueil" })).toBeVisible();
  for (const phone of phones) {
    await expect(phone.getByRole('heading', { name: 'Partie terminée' })).toBeVisible();
  }
});
