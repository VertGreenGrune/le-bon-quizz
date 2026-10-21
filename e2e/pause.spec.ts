import { expect, test, devices, type Browser, type Page } from '@playwright/test';
import { DEMO_QUIZ } from '@lbq/shared';
import { answerOnPhone, resultHeading, type Plan } from './answers';

/**
 * Auto-pause (T21): a player who still has to answer loses the connection → the game pauses,
 * then resumes with a 3-2-1 countdown once they are back (same phone, reopened tab, or another
 * phone taking over the nickname).
 */
const plan = (q: number): Plan => (DEMO_QUIZ.questions[q]!.type === 'POLL' ? 'vote' : 'right');

async function newPhone(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ ...devices['Pixel 7'] });
  return context.newPage();
}

async function startGame(browser: Browser, nicknames: string[]) {
  const hostContext = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const host = await hostContext.newPage();
  await host.goto('/host/new');
  await expect(host).toHaveURL(/\/host\/\d{6}$/);
  const pin = new URL(host.url()).pathname.split('/').pop()!;
  const phones: Page[] = [];
  for (const nickname of nicknames) {
    const phone = await newPhone(browser);
    await phone.goto(`/join?pin=${pin}`);
    await phone.getByPlaceholder('Ton pseudo').fill(nickname);
    await phone.getByRole('button', { name: 'Entrer' }).click();
    await expect(phone.getByText('Tu es dans la partie !')).toBeVisible();
    phones.push(phone);
  }
  await host.getByRole('button', { name: 'Commencer' }).click();
  return { host, pin, phones };
}

/** Everyone answers question `q`, then the host goes on to the next question (or the podium). */
async function playQuestion(host: Page, phones: Page[], q: number, answered: Page[] = []) {
  const question = DEMO_QUIZ.questions[q]!;
  for (const phone of phones) {
    if (!answered.includes(phone)) await answerOnPhone(phone, question, plan(q));
  }
  for (const phone of phones) {
    await expect(
      phone.getByRole('heading', { name: resultHeading(question, plan(q)) }),
    ).toBeVisible();
  }
  await host.getByRole('button', { name: 'Suivant' }).click();
  const last = q === DEMO_QUIZ.questions.length - 1;
  await host.getByRole('button', { name: last ? 'Voir le podium' : 'Question suivante' }).click();
}

async function finishGame(host: Page, phones: Page[], from: number) {
  for (let q = from; q < DEMO_QUIZ.questions.length; q++) await playQuestion(host, phones, q);
  await expect(host.getByRole('heading', { name: 'Podium' })).toBeVisible();
  await host.getByRole('button', { name: 'Terminer la partie' }).click();
  for (const phone of phones) {
    await expect(phone.getByRole('heading', { name: 'Partie terminée' })).toBeVisible();
  }
}

/**
 * Host + phones wait for `nickname`, timer frozen. A silent drop (offline, no TCP close) is only
 * seen after the server heartbeat (≤ 10 s) + the 2 s grace.
 */
async function expectPausedFor(host: Page, others: Page[], nickname: string) {
  const overlay = host.getByTestId('host-pause');
  await expect(overlay).toBeVisible({ timeout: 20_000 });
  await expect(overlay.getByText(`En attente de ${nickname}…`)).toBeVisible();
  await expect(overlay.getByRole('button', { name: `Continuer sans ${nickname}` })).toBeVisible();
  await expect(overlay.getByRole('button', { name: 'Exclure' })).toBeVisible();
  for (const phone of others) {
    await expect(phone.getByRole('heading', { name: 'Partie en pause' })).toBeVisible();
    await expect(phone.getByText(`On attend ${nickname}…`)).toBeVisible();
  }
}

/** « <pseudo> est de retour ! », 3-2-1, then the question goes on. */
async function expectResumed(host: Page, phones: Page[], nickname: string) {
  await expect(host.getByText(`${nickname} est de retour !`)).toBeVisible();
  await expect(host.getByTestId('host-pause')).toBeHidden({ timeout: 15_000 });
  for (const phone of phones) await expect(phone.getByTestId('pause-overlay')).toBeHidden();
}

test('a phone goes offline mid-question: the game pauses, then resumes', async ({ browser }) => {
  const { host, phones } = await startGame(browser, ['Alice', 'Bob']);
  const [alice, bob] = phones as [Page, Page];

  // Question 1: Alice answers, Bob loses the network before answering.
  const q0 = DEMO_QUIZ.questions[0]!;
  await answerOnPhone(alice, q0, plan(0));
  await expect(alice.getByText('Réponse envoyée !')).toBeVisible();
  await expect(bob.getByRole('button', { name: /^Réponse / }).first()).toBeVisible();
  await bob.context().setOffline(true);

  await expectPausedFor(host, [alice], 'Bob');
  // Frozen: the question doesn't end while Bob is away (20 s question).
  await host.waitForTimeout(3_000);
  await expect(host.getByTestId('host-pause')).toBeVisible();

  await bob.context().setOffline(false);
  await expect(host.getByText('Tout le monde est là, ça reprend !')).toBeVisible();
  await expect(alice.getByText('Ça reprend !')).toBeVisible();
  await expectResumed(host, phones, 'Bob');

  // Bob is back on his question and the game finishes normally.
  await playQuestion(host, phones, 0, [alice]);
  await finishGame(host, phones, 1);
});

test('a closed page resumes by itself, another phone can take over the nickname', async ({
  browser,
}) => {
  const { host, pin, phones } = await startGame(browser, ['Alice', 'Bob']);
  const [alice, bob] = phones as [Page, Page];
  await playQuestion(host, phones, 0);

  // Question 2: Bob closes his tab, then reopens the site on the same phone → straight back.
  await expect(bob.getByRole('button', { name: /^Réponse / }).first()).toBeVisible();
  const bobContext = bob.context();
  await bob.close();
  await expectPausedFor(host, [alice], 'Bob');
  const reopened = await bobContext.newPage();
  await reopened.goto(`/join?pin=${pin}`);
  await expect(reopened).toHaveURL(/\/play$/);
  await expectResumed(host, [alice, reopened], 'Bob');
  await expect(reopened.getByRole('button', { name: /^Réponse / }).first()).toBeVisible();

  // Bob's phone dies: he takes his place back from a friend's phone, same nickname.
  await bobContext.close();
  await expectPausedFor(host, [alice], 'Bob');
  const other = await newPhone(browser);
  await other.goto(`/join?pin=${pin}`);
  await expect(other.getByText('La partie a déjà commencé.', { exact: false })).toBeVisible();
  // A new nickname can't join a started game.
  await other.getByPlaceholder('Ton pseudo').fill('Zoé');
  await other.getByRole('button', { name: 'Reprendre ma place' }).click();
  await other.getByRole('button', { name: 'Oui, reprendre' }).click();
  await expect(other.getByText(/Aucun joueur déconnecté/)).toBeVisible();

  await other.getByPlaceholder('Ton pseudo').fill('bob');
  await other.getByRole('button', { name: 'Reprendre ma place' }).click();
  await expect(
    other.getByRole('heading', { name: 'Reprendre la partie en tant que bob ?' }),
  ).toBeVisible();
  await other.getByRole('button', { name: 'Oui, reprendre' }).click();
  await expect(other).toHaveURL(/\/play$/);
  await expect(other.getByText('Bob', { exact: true })).toBeVisible(); // his nickname, his score
  await expectResumed(host, [alice, other], 'Bob');

  const takenOver = [alice, other];
  await playQuestion(host, takenOver, 1);
  await finishGame(host, takenOver, 2);
  // Bob answered everything right (from three different pages): on the podium.
  await expect(host.getByText('Bob', { exact: true })).toBeVisible();
});
