import { expect, test, devices, type Page } from '@playwright/test';
import { CLASSIC_DEMO_QUIZ } from '@lbq/shared';

/**
 * « 🔁 Enchaîner un quiz » (T48): once a quiz is over, the host starts another one in the same
 * room — same PIN, same TV, the phones go straight to the new lobby (even after a reload).
 */
test('the host chains a second quiz with the same PIN and players', async ({ browser }) => {
  const hostContext = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const host = await hostContext.newPage();
  await host.goto('/host/new');
  await expect(host).toHaveURL(/\/host\/\d{6}$/);
  const hostUrl = host.url();
  const pin = new URL(hostUrl).pathname.split('/').pop()!;

  const phones: Page[] = [];
  for (const nickname of ['Alice', 'Bob']) {
    const phone = await (await browser.newContext({ ...devices['Pixel 7'] })).newPage();
    await phone.goto(`/join?pin=${pin}`);
    await phone.getByPlaceholder('Ton pseudo').fill(nickname);
    await phone.getByRole('button', { name: 'Entrer' }).click();
    await expect(phone.getByText('Tu es dans la partie !')).toBeVisible();
    phones.push(phone);
  }

  // First quiz: started, then ended early by the host.
  await host.getByRole('button', { name: 'Commencer' }).click();
  await expect(
    host.getByText(`Question 1 / ${CLASSIC_DEMO_QUIZ.questions.length}`).first(),
  ).toBeVisible();
  host.once('dialog', (d) => void d.accept());
  await host.getByRole('button', { name: 'Terminer', exact: true }).click();
  for (const phone of phones) {
    await expect(phone.getByRole('heading', { name: 'Partie terminée' })).toBeVisible();
    await expect(phone.getByText(/enchaîne un autre quiz/)).toBeVisible();
  }

  // Chain: pick the quiz, then the options.
  await host.getByRole('button', { name: '🔁 Enchaîner un quiz' }).click();
  const dialog = host.getByRole('dialog', { name: '🔁 Enchaîner un quiz' });
  await dialog.getByRole('button', { name: new RegExp(CLASSIC_DEMO_QUIZ.title) }).click();
  await host.getByRole('button', { name: '▶ Lancer' }).click();

  // Same room: same URL / PIN, the players are already in the new lobby.
  await expect(host.getByText('En attente des joueurs…')).toBeHidden();
  expect(host.url()).toBe(hostUrl);
  await expect(host.getByText(pin, { exact: true })).toBeVisible();
  for (const nickname of ['Alice', 'Bob'])
    await expect(host.getByRole('button', { name: nickname })).toBeVisible();
  for (const phone of phones) await expect(phone.getByText('Tu es dans la partie !')).toBeVisible();
  // « 🌙 Classement de la soirée » (T66): the quizzes before this one, on the TV and the phones.
  await expect(host.getByTestId('evening-panel')).toContainText('après 1 quiz');
  await expect(phones[0]!.getByTestId('evening-line')).toContainText('🌙 Soirée');

  // The phone's session goes on: a reload comes back to the new lobby.
  await phones[0]!.reload();
  await expect(phones[0]!.getByText('Tu es dans la partie !')).toBeVisible();

  // The chained quiz plays from 0.
  await host.getByRole('button', { name: 'Commencer' }).click();
  await expect(
    host.getByText(`Question 1 / ${CLASSIC_DEMO_QUIZ.questions.length}`).first(),
  ).toBeVisible();
  for (const phone of phones) await expect(phone.getByText(/Question 1/).first()).toBeVisible();
});
