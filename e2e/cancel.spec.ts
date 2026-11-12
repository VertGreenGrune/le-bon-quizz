import { expect, test, devices, type Browser, type Page } from '@playwright/test';
import { CLASSIC_DEMO_QUIZ, SHAPES } from '@lbq/shared';

/**
 * « Annuler ma réponse » (T43) on the first demo question (a classic MCQ): Alice answers wrong,
 * cancels, answers right; Bob answers last, cancels during the 2 s « everyone answered » grace
 * and answers wrong. The results follow the second answers.
 */
const question = CLASSIC_DEMO_QUIZ.questions[0]!;
if (question.type !== 'MCQ') throw new Error('the first demo question must be an MCQ');
const right = question.choices.findIndex((c) => c.isCorrect);
const wrong = question.choices.findIndex((c) => !c.isCorrect);
const shape = (i: number) => `Réponse ${SHAPES[i]!.symbol}`;

async function join(browser: Browser, pin: string, nickname: string): Promise<Page> {
  const context = await browser.newContext({ ...devices['Pixel 7'] });
  const phone = await context.newPage();
  await phone.goto(`/join?pin=${pin}`);
  await phone.getByPlaceholder('Ton pseudo').fill(nickname);
  await phone.getByRole('button', { name: 'Entrer' }).click();
  await expect(phone.getByText('Tu es dans la partie !')).toBeVisible();
  return phone;
}

test('a player cancels an answer and answers again; the result follows the new answer', async ({
  browser,
}, testInfo) => {
  const hostContext = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const host = await hostContext.newPage();
  await host.goto('/host/new');
  await expect(host).toHaveURL(/\/host\/\d{6}$/);
  const pin = new URL(host.url()).pathname.split('/').pop()!;
  const alice = await join(browser, pin, 'Alice');
  const bob = await join(browser, pin, 'Bob');
  await host.getByRole('button', { name: 'Commencer' }).click();

  // Alice: wrong, cancel, right.
  await alice.getByRole('button', { name: shape(wrong) }).click();
  await expect(alice.getByText('Réponse envoyée !')).toBeVisible();
  await expect(host.getByText('/ 2')).toBeVisible();
  const cancel = alice.getByRole('button', { name: '↩︎ Annuler ma réponse' });
  await expect(cancel).toBeVisible();
  await alice.waitForTimeout(800); // entrance animation
  await alice.screenshot({ path: testInfo.outputPath('phone-answered.png') });
  await cancel.click();
  await expect(alice.getByRole('button', { name: shape(right) })).toBeVisible();
  await alice.getByRole('button', { name: shape(right) }).click();
  await expect(alice.getByText('Encore 2 annulations possibles')).toBeVisible();

  // Bob answers last: the TV says everyone answered, the reveal waits; Bob cancels meanwhile.
  await bob.getByRole('button', { name: shape(right) }).click();
  await expect(host.getByText('✅ Tout le monde a répondu !')).toBeVisible();
  await host.waitForTimeout(500); // entrance animation, well within the 2 s grace
  await host.screenshot({ path: testInfo.outputPath('tv-all-answered.png') });
  await bob.getByRole('button', { name: '↩︎ Annuler ma réponse' }).click();
  await expect(host.getByText('✅ Tout le monde a répondu !')).toBeHidden();
  await bob.getByRole('button', { name: shape(wrong) }).click();

  // Reveal after the 2 s grace: Alice right, Bob wrong.
  await expect(alice.getByRole('heading', { name: 'Correct !' })).toBeVisible();
  await expect(bob.getByRole('heading', { name: 'Raté !' })).toBeVisible();
  await expect(host.getByRole('button', { name: 'Suivant' })).toBeVisible();
  await host.getByRole('button', { name: 'Suivant' }).click();
  await expect(host.locator('ol > li').first()).toContainText('Alice');
});
