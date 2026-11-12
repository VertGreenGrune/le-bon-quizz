import { expect, test, devices, type Browser, type Page } from '@playwright/test';
import { CLASSIC_DEMO_QUIZ } from '@lbq/shared';
import { answerOnPhone } from './answers';

/**
 * « Survie » (T31) on the demo quiz, 1 heart each, without jokers: Chloé misses question 1 and
 * becomes a ghost, answers question 2 right and haunts Bob (Gel), who is frozen on question 3,
 * misses it and is eliminated too: Alice is the last survivor, the game goes to the podium
 * before the end of the quiz.
 */
const SHOTS = process.env.E2E_SHOTS_DIR;

async function newPhone(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ ...devices['Pixel 7'] });
  return context.newPage();
}

const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

test('« Survie »: hearts, a ghost haunts a survivor, the last survivor wins', async ({
  browser,
}) => {
  const [q1, q2, q3] = CLASSIC_DEMO_QUIZ.questions;

  // ---- Start dialog: Survie, 1 heart, no jokers ----
  const hostContext = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const host = await hostContext.newPage();
  await host.goto('/');
  await host.getByRole('button', { name: 'Animer une partie (démo)' }).click();
  await host.getByRole('button', { name: /Survie/ }).click();
  await host.getByRole('button', { name: '1 cœur', exact: true }).click();
  await host.getByRole('checkbox', { name: /Jokers/ }).uncheck();
  await host.getByRole('button', { name: '▶ Lancer' }).click();
  await expect(host).toHaveURL(/\/host\/\d{6}$/);
  await expect(host.getByTestId('survival-rules')).toBeVisible();
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
    await expect(phone.getByTestId('my-hearts')).toHaveText('❤️');
  }
  await expect(host.getByTestId('hearts')).toHaveCount(3);
  await shot(host, 'survival-lobby');
  await host.getByRole('button', { name: 'Commencer' }).click();
  await expect(host.getByText('💀 Survie · 3 en vie')).toBeVisible();

  // ---- Question 1: Chloé is wrong → ghost ----
  await answerOnPhone(alice!, q1!, 'right');
  await answerOnPhone(bob!, q1!, 'right');
  await answerOnPhone(chloe!, q1!, 'wrong');
  await expect(chloe!.getByTestId('eliminated-overlay')).toBeVisible();
  await expect(chloe!.getByTestId('eliminated-overlay')).toContainText('Éliminé !');
  await shot(chloe!, 'survival-phone-eliminated');
  await chloe!.getByTestId('eliminated-overlay').click();
  await expect(chloe!.getByTestId('survival-result')).toContainText('tu deviens un fantôme');
  await expect(chloe!.getByTestId('my-hearts')).toHaveText('👻 Fantôme');
  await expect(alice!.getByTestId('survival-result')).toContainText('Toujours en vie');

  await host.getByRole('button', { name: 'Suivant' }).click();
  const moment = host.getByTestId('elimination-moment');
  await expect(moment).toContainText('Éliminé !');
  await expect(moment).toContainText('Chloé');
  await shot(host, 'survival-host-eliminated');
  await expect(moment).toBeHidden({ timeout: 10_000 });
  await expect(host.getByRole('heading', { name: 'Survivants' })).toBeVisible();
  await expect(host.getByText('💀 Survie · 2 en vie')).toBeVisible();
  await host.getByRole('button', { name: 'Question suivante' }).click();

  // ---- Question 2: the ghost answers right → haunts Bob with a Gel ----
  for (const phone of [alice!, bob!, chloe!]) await answerOnPhone(phone, q2!, 'right');
  await expect(chloe!.getByTestId('survival-result')).toContainText('tu peux hanter un vivant');
  await chloe!.getByTestId('haunt-button').click();
  const sheet = chloe!.getByRole('dialog', { name: 'Hanter un vivant' });
  await expect(sheet.getByRole('button', { name: 'Chloé' })).toHaveCount(0); // living only
  await sheet.getByRole('button', { name: 'Bob' }).click();
  await expect(sheet).toBeHidden();
  await expect(host.getByTestId('joker-announcement')).toContainText('Chloé hante Bob : Gel !');
  await expect(bob!.getByTestId('joker-toast')).toContainText('Chloé hante Bob : Gel !');
  await expect(chloe!.getByTestId('haunt-button')).toBeHidden();
  await shot(host, 'survival-host-haunt');
  await host.getByRole('button', { name: 'Suivant' }).click();
  await host.getByRole('button', { name: 'Question suivante' }).click();

  // ---- Question 3: Bob is frozen, then wrong → Alice is the last survivor ----
  await expect(bob!.getByTestId('frozen-overlay')).toContainText('Gelé par Chloé !');
  await shot(bob!, 'survival-phone-frozen');
  await answerOnPhone(alice!, q3!, 'right');
  await answerOnPhone(chloe!, q3!, 'right');
  await expect(bob!.getByTestId('frozen-overlay')).toBeHidden({ timeout: 12_000 });
  await answerOnPhone(bob!, q3!, 'wrong');
  await expect(bob!.getByTestId('eliminated-overlay')).toBeVisible();

  await host.getByRole('button', { name: 'Suivant' }).click();
  await expect(moment).toContainText('Bob');
  await expect(moment).toContainText('Alice est le dernier survivant !');
  await shot(host, 'survival-host-last');
  // 4 questions left in the quiz, but the game is over.
  await host.getByRole('button', { name: 'Voir le podium' }).click();
  await expect(host.getByRole('heading', { name: 'Podium des survivants' })).toBeVisible();
  await expect(host.getByTestId('podium-survival').first()).toBeVisible();
  await expect(host.getByText(/Dernier survivant/)).toBeVisible({ timeout: 10_000 });
  await expect(
    alice!.getByRole('heading', { name: '🏆 Tu es le dernier survivant !' }),
  ).toBeVisible();
  await expect(bob!.getByText('👻 éliminé à la question 3')).toBeVisible();
  await shot(host, 'survival-host-podium');
  await shot(alice!, 'survival-phone-podium');

  await host.getByRole('button', { name: 'Terminer la partie' }).click();
  for (const phone of [alice!, bob!, chloe!]) {
    await expect(phone.getByRole('heading', { name: 'Partie terminée' })).toBeVisible();
  }
});
