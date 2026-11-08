import { expect, test, devices, type Browser, type Page } from '@playwright/test';
import { DEMO_QUIZ } from '@lbq/shared';

/**
 * « 🔁 Quiz suivant » (T47): after a quiz, the host picks another one in the same room — the
 * phones land in the new lobby without typing the PIN again.
 */
async function newPhone(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ ...devices['Pixel 7'] });
  return context.newPage();
}

/** Host skips through the questions (nobody needs to answer) until the podium. */
async function skipToPodium(host: Page) {
  const nextQuiz = host.getByRole('button', { name: '🔁 Quiz suivant' });
  const primary = host.getByRole('button', {
    name: /^(Passer|Question suivante|Suivant|Voir le podium|Voir les résultats)$/,
  });
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline && !(await nextQuiz.isVisible())) {
    // Screens animate in and out: a click can miss, the loop simply tries again.
    await primary
      .first()
      .click({ timeout: 1000 })
      .catch(() => {});
    await host.waitForTimeout(300);
  }
  await expect(nextQuiz).toBeVisible();
}

test('next quiz in the same room: same PIN, players kept, new options', async ({ browser }) => {
  test.setTimeout(180_000);
  const hostContext = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const host = await hostContext.newPage();
  await host.goto('/');
  await host.getByRole('button', { name: 'Animer une partie (démo)' }).click();
  await host.getByRole('button', { name: '▶ Lancer' }).click();
  await expect(host).toHaveURL(/\/host\/\d{6}$/);
  const hostUrl = host.url();
  const pin = new URL(hostUrl).pathname.split('/').pop()!;

  const phones: Page[] = [];
  for (const nickname of ['Alice', 'Bob']) {
    const phone = await newPhone(browser);
    await phone.goto(`/join?pin=${pin}`);
    await phone.getByPlaceholder('Ton pseudo').fill(nickname);
    await phone.getByRole('button', { name: 'Entrer' }).click();
    await expect(phone.getByRole('heading', { name: 'Tu es dans la partie !' })).toBeVisible();
    phones.push(phone);
  }
  await host.getByRole('button', { name: 'Commencer' }).click();
  await expect(host.getByRole('heading', { name: DEMO_QUIZ.questions[0]!.text })).toBeVisible();

  // ---- The host ends the quiz early, then « Quiz suivant »: the phones wait for the next quiz ----
  host.once('dialog', (d) => void d.accept());
  await host.getByRole('button', { name: 'Terminer', exact: true }).click();
  await expect(phones[0]!.getByText(/en attente du prochain quiz/)).toBeVisible();
  await host.getByRole('button', { name: '🔁 Quiz suivant' }).click();
  const dialog = host.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: '🔁 Quiz suivant' })).toBeVisible();
  await dialog.getByRole('tab', { name: 'Démo' }).click();
  await dialog.getByRole('button', { name: new RegExp(DEMO_QUIZ.title) }).click();
  // The start options of the chosen quiz: switch to teams.
  await host.getByRole('button', { name: /Équipes/ }).click();
  await host.getByRole('button', { name: '▶ Lancer' }).click();

  // ---- Same room: same URL / PIN, new lobby with teams, nobody typed anything ----
  await expect(host.getByTestId('next-quiz-title')).toHaveText(
    `🔁 Quiz suivant : ${DEMO_QUIZ.title}`,
  );
  expect(host.url()).toBe(hostUrl);
  await expect(host.getByText(pin, { exact: true })).toBeVisible();
  await expect(host.getByRole('heading', { name: /Équipe Rouge/ })).toBeVisible();
  for (const phone of phones) {
    await expect(phone.getByRole('heading', { name: 'Choisis ton équipe' })).toBeVisible();
  }
  await phones[0]!.getByRole('button', { name: /Équipe Rouge/ }).click();
  await phones[1]!.getByRole('button', { name: /Équipe Bleue/ }).click();
  await expect(
    phones[1]!.getByRole('heading', { name: "Tu es dans l'équipe Bleue !" }),
  ).toBeVisible();

  // A phone reloaded in the new lobby comes back by itself.
  await phones[1]!.reload();
  await expect(
    phones[1]!.getByRole('heading', { name: "Tu es dans l'équipe Bleue !" }),
  ).toBeVisible();

  // ---- The new quiz is played in teams, scores from zero ----
  await host.getByRole('button', { name: 'Commencer' }).click();
  await expect(phones[0]!.getByText('Alice · Équipe Rouge')).toBeVisible();
  await skipToPodium(host);

  // ---- From the podium: « ↻ Rejouer ce quiz » — same quiz, same options, teams kept ----
  await host.getByRole('button', { name: '🔁 Quiz suivant' }).click();
  await host.getByRole('button', { name: /↻ Rejouer ce quiz/ }).click();
  await expect(host.getByRole('heading', { name: /Équipe Rouge/ })).toBeVisible();
  await expect(
    phones[0]!.getByRole('heading', { name: "Tu es dans l'équipe Rouge !" }),
  ).toBeVisible();
  await expect(
    phones[1]!.getByRole('heading', { name: "Tu es dans l'équipe Bleue !" }),
  ).toBeVisible();
  await expect(host.getByRole('button', { name: 'Commencer' })).toBeEnabled();
});
