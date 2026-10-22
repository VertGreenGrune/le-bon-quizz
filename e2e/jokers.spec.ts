import { expect, test, devices, type Browser, type Page } from '@playwright/test';
import { DEMO_QUIZ, SHAPES } from '@lbq/shared';
import { answerOnPhone } from './answers';

/**
 * Jokers (T25): the server gives every player the hand `E2E_JOKER_HAND` (freeze, copy, fifty —
 * set in playwright.config.ts) instead of a random one. Alice freezes Bob, Chloé copies Bob's
 * answer, then Bob is frozen at the start of the next question.
 */
const SHOTS = process.env.E2E_SHOTS_DIR;

async function newPhone(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ ...devices['Pixel 7'] });
  return context.newPage();
}

const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
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

  // ---- Question 1 (MCQ): Alice freezes Bob, Chloé copies Bob ----
  const q1 = DEMO_QUIZ.questions[0]!;
  await expect(alice!.getByTestId('joker-bar')).toBeVisible();
  await expect(alice!.getByRole('button', { name: /^Réponse / }).first()).toBeVisible();
  await playJoker(alice!, 'Gel', 'Bob');
  await expect(host.getByTestId('joker-announcement')).toContainText('Alice a gelé Bob !');
  await expect(bob!.getByTestId('joker-toast')).toContainText('Alice a gelé Bob !');
  await shot(host, 'host-announcement');
  await expect(alice!.getByTestId('joker-bar')).toContainText('Joker joué : Gel → Bob');

  await playJoker(chloe!, 'Copieur', 'Bob');
  await expect(chloe!.getByRole('heading', { name: 'Tu copies Bob' })).toBeVisible();
  await expect(host.getByTestId('joker-announcement')).toContainText('Chloé copie quelqu');
  await shot(chloe!, 'phone-copy');

  // A 50/50 on Bob's phone hides 2 of the 3 wrong shapes.
  await playJoker(bob!, '50/50');
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

  // ---- Question 2 (true / false): Bob is frozen 5 s, the 50/50 is greyed out ----
  await expect(bob!.getByTestId('frozen-overlay')).toBeVisible();
  await expect(bob!.getByTestId('frozen-overlay')).toContainText('Gelé par Alice !');
  await shot(bob!, 'phone-frozen');
  await expect(alice!.getByRole('button', { name: 'Joker 50/50' })).toBeDisabled();
  await expect(bob!.getByTestId('frozen-overlay')).toBeHidden({ timeout: 12_000 });
  const q2 = DEMO_QUIZ.questions[1]!;
  await answerOnPhone(bob!, q2, 'right');
  for (const phone of [alice!, chloe!]) await answerOnPhone(phone, q2, 'right');
  await expect(bob!.getByRole('heading', { name: 'Correct !' })).toBeVisible();

  host.once('dialog', (dialog) => void dialog.accept()); // « Terminer la partie maintenant ? »
  await host.getByRole('button', { name: 'Terminer', exact: true }).click();
  for (const phone of [alice!, bob!, chloe!]) {
    await expect(phone.getByRole('heading', { name: 'Partie terminée' })).toBeVisible();
  }
});
