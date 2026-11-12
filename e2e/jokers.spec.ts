import { expect, test, devices, type Browser, type Page } from '@playwright/test';
import { CLASSIC_DEMO_QUIZ, SHAPES } from '@lbq/shared';
import { answerOnPhone } from './answers';

/**
 * Jokers (T25, T42): the server gives every player the hand `E2E_JOKER_HAND` (freeze, copy, fifty,
 * double — set in playwright.config.ts) instead of a random one. During the intro of question 1,
 * Alice freezes Bob (frozen on this question), Chloé copies Bob's answer, Bob plays a 50/50; on
 * question 2 Alice answers, then plays Double ou rien while the others answer.
 */
const SHOTS = process.env.E2E_SHOTS_DIR;

async function newPhone(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ ...devices['Pixel 7'] });
  return context.newPage();
}

const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  await page.waitForTimeout(600); // let the entrance animations end
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

/** Opens a joker of the bar and taps the target (or « Jouer »). */
async function playJoker(phone: Page, name: string, target?: string) {
  await phone.getByRole('button', { name: `Joker ${name}` }).click();
  const sheet = phone.getByRole('dialog', { name: `Joker ${name}` });
  await expect(sheet).toBeVisible();
  if (target) await sheet.getByRole('button', { name: target }).click();
  else await sheet.getByRole('button', { name: 'Jouer' }).click();
  await expect(sheet).toBeHidden();
}

test('jokers: the start dialog option, Gel and Copieur between two phones', async ({ browser }) => {
  // ---- The start dialog offers the jokers, on by default ----
  const hostContext = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const host = await hostContext.newPage();
  await host.goto('/');
  await host.getByRole('button', { name: 'Animer une partie (démo)' }).click();
  await expect(host.getByRole('checkbox', { name: /Jokers/ })).toBeChecked();
  await host.getByRole('button', { name: '▶ Lancer' }).click();
  await expect(host).toHaveURL(/\/host\/\d{6}$/);
  await expect(host.getByText('🃏 Jokers')).toBeVisible();
  const pin = new URL(host.url()).pathname.split('/').pop()!;

  const [alice, bob, chloe] = await Promise.all([1, 2, 3].map(() => newPhone(browser)));
  for (const [phone, nickname] of [
    [alice!, 'Alice'],
    [bob!, 'Bob'],
    [chloe!, 'Chloé'],
  ] as const) {
    await phone.goto(`/join?pin=${pin}`);
    await phone.getByPlaceholder('Ton pseudo').fill(nickname);
    await phone.getByRole('button', { name: 'Entrer' }).click();
    await expect(phone.getByText('Tu es dans la partie !')).toBeVisible();
  }
  await host.getByRole('button', { name: 'Commencer' }).click();

  // ---- Question 1 (MCQ), during the 8 s intro: Alice freezes Bob, Chloé copies Bob ----
  const q1 = CLASSIC_DEMO_QUIZ.questions[0]!;
  await expect(host.getByTestId('intro-jokers')).toContainText('Jouez vos jokers !');
  await expect(alice!.getByTestId('joker-bar')).toContainText('Joue tes jokers !');
  await shot(host, 'host-intro');
  await shot(alice!, 'phone-intro');
  await playJoker(alice!, 'Gel', 'Bob');
  await expect(host.getByTestId('joker-announcement')).toContainText('Alice a gelé Bob !');
  await expect(bob!.getByTestId('joker-toast')).toContainText('Alice a gelé Bob !');
  await shot(host, 'host-announcement');
  await expect(alice!.getByTestId('joker-bar')).toContainText('Joker joué : Gel → Bob');
  // Still in the intro: Chloé copies Bob, Bob plays a 50/50.
  await playJoker(chloe!, 'Copieur', 'Bob');
  await playJoker(bob!, '50/50');
  await expect(host.getByTestId('joker-announcement')).toContainText('Chloé copie quelqu');
  await expect(chloe!.getByRole('heading', { name: 'Tu copies Bob' })).toBeVisible();
  await shot(chloe!, 'phone-copy');

  // The 50/50 hides 2 of the 3 wrong shapes. Bob is frozen on this question.
  await expect(bob!.getByTestId('frozen-overlay')).toBeVisible();
  await expect(bob!.getByTestId('frozen-overlay')).toContainText('Gelé par Alice !');
  await shot(bob!, 'phone-frozen');
  await expect(bob!.getByTestId('frozen-overlay')).toBeHidden({ timeout: 12_000 });
  await expect(bob!.getByRole('button', { name: /^Réponse / })).toHaveCount(2);
  await shot(bob!, 'phone-fifty');
  const paris = q1.type === 'MCQ' ? q1.choices.findIndex((c) => c.isCorrect) : -1;
  await bob!.getByRole('button', { name: `Réponse ${SHAPES[paris]!.symbol}` }).click();
  await answerOnPhone(alice!, q1, 'wrong');
  await expect(chloe!.getByRole('heading', { name: 'Correct !' })).toBeVisible();
  await expect(chloe!.getByTestId('joker-results')).toContainText('Réponse copiée sur Bob');
  await expect(bob!.getByRole('heading', { name: 'Correct !' })).toBeVisible();
  await shot(chloe!, 'phone-copy-result');

  // ---- Leaderboard: joker icons ----
  await host.getByRole('button', { name: 'Suivant' }).click();
  await expect(host.getByTestId('joker-icons').first()).toBeVisible();
  await shot(host, 'host-leaderboard');
  await host.getByRole('button', { name: 'Question suivante' }).click();

  // ---- Question 2 (true / false): 50/50 greyed; Alice answers, then plays Double ou rien ----
  await expect(alice!.getByRole('button', { name: 'Joker 50/50' })).toHaveAttribute(
    'data-blocked',
    'Ce joker ne marche pas sur cette question',
  );
  const q2 = CLASSIC_DEMO_QUIZ.questions[1]!;
  await answerOnPhone(alice!, q2, 'right');
  await expect(alice!.getByTestId('joker-bar')).toContainText('Encore un joker');
  // Copieur is « before answering » only: the sheet says why.
  await alice!.getByRole('button', { name: 'Joker Copieur' }).click();
  await expect(alice!.getByTestId('joker-blocked')).toHaveText('🚫 Seulement avant de répondre');
  await shot(alice!, 'phone-after-answer-blocked');
  await alice!.getByRole('button', { name: 'Annuler', exact: true }).click();
  await playJoker(alice!, 'Double ou rien');
  await expect(host.getByTestId('joker-announcement')).toContainText('Alice joue Double ou rien');
  await expect(alice!.getByTestId('joker-bar')).toContainText('Joker joué : Double ou rien');
  await shot(alice!, 'phone-after-answer');
  for (const phone of [bob!, chloe!]) await answerOnPhone(phone, q2, 'right');
  await expect(alice!.getByRole('heading', { name: 'Correct !' })).toBeVisible();
  await expect(alice!.getByTestId('joker-results')).toContainText('Double ou rien');

  // ---- Question 3: Bob plays the Voleur, its wheel spins on the TV at the reveal (T51) ----
  await host.getByRole('button', { name: 'Suivant' }).click();
  await host.getByRole('button', { name: 'Question suivante' }).click();
  await expect(host.getByTestId('intro-jokers')).toBeVisible();
  await playJoker(bob!, 'Voleur'); // no target: the wheel picks among everyone
  await expect(host.getByTestId('joker-announcement')).toContainText('Bob lance la roue du Voleur');
  const q3 = CLASSIC_DEMO_QUIZ.questions[2]!;
  for (const phone of [alice!, bob!, chloe!]) await answerOnPhone(phone, q3, 'right');
  await expect(host.getByTestId('thief-wheel')).toBeVisible({ timeout: 10_000 });
  await expect(host.getByTestId('thief-wheel')).toContainText('La roue de Bob tourne');
  await expect(host.getByTestId('thief-wheel-result')).toContainText('🦹', { timeout: 10_000 });
  await shot(host, 'host-thief-wheel');
  await expect(host.getByTestId('thief-wheel-summary')).toContainText('🦹', { timeout: 10_000 });
  await expect(bob!.getByTestId('joker-results')).toContainText('🦹');
  host.once('dialog', (dialog) => void dialog.accept()); // « Terminer la partie maintenant ? »
  await host.getByRole('button', { name: 'Terminer', exact: true }).click();
  for (const phone of [alice!, bob!, chloe!]) {
    await expect(phone.getByRole('heading', { name: 'Partie terminée' })).toBeVisible();
  }
});
