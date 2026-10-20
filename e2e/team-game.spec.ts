import { expect, test, devices, type Browser, type Page } from '@playwright/test';
import { DEMO_QUIZ, SHAPES } from '@lbq/shared';

/**
 * Team mode: 1 host + 3 phones, 2 teams of unequal sizes — Rouge (Alice) vs Bleue (Bob, Chloé).
 *
 * Answer plan: Alice and Bob always right (Alice first, so she is the fastest), Chloé always
 * wrong. Team score = average per player: Rouge = Alice's points, Bleue = (Bob's + 0) / 2, so
 * Rouge wins whatever the response times.
 */
const correctIndex = DEMO_QUIZ.questions.map((q) => q.choices.findIndex((c) => c.isCorrect));
const wrongIndex = DEMO_QUIZ.questions.map((q) => q.choices.findIndex((c) => !c.isCorrect));

const PLAYERS = [
  { nickname: 'Alice', team: 'Équipe Rouge', pick: (q: number) => correctIndex[q]! },
  { nickname: 'Bob', team: 'Équipe Bleue', pick: (q: number) => correctIndex[q]! },
  { nickname: 'Chloé', team: 'Équipe Bleue', pick: (q: number) => wrongIndex[q]! },
];

async function newPhone(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ ...devices['Pixel 7'] });
  return context.newPage();
}

test('team game: players pick teams, fair team scores, team podium', async ({ browser }) => {
  // ---- Host picks "Équipes" in the start dialog ----
  const hostContext = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const host = await hostContext.newPage();
  await host.goto('/');
  await host.getByRole('button', { name: 'Animer une partie (démo)' }).click();
  await host.getByRole('button', { name: /Équipes/ }).click();
  await expect(host.getByRole('button', { name: '2', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await host.getByRole('button', { name: '▶ Lancer' }).click();
  await expect(host).toHaveURL(/\/host\/\d{6}$/);
  const pin = new URL(host.url()).pathname.split('/').pop()!;
  await expect(host.getByRole('heading', { name: /Équipe Rouge/ })).toBeVisible();
  await expect(host.getByRole('heading', { name: /Équipe Bleue/ })).toBeVisible();
  const start = host.getByRole('button', { name: 'Commencer' });

  // ---- Players join and choose their team (Chloé first picks Rouge) ----
  const phones: Page[] = [];
  for (const p of PLAYERS) {
    const phone = await newPhone(browser);
    await phone.goto(`/join?pin=${pin}`);
    await phone.getByPlaceholder('Ton pseudo').fill(p.nickname);
    await phone.getByRole('button', { name: 'Entrer' }).click();
    await expect(phone.getByRole('heading', { name: 'Choisis ton équipe' })).toBeVisible();
    await expect(start).toBeDisabled(); // a player without a team
    const pick = p.nickname === 'Chloé' ? 'Équipe Rouge' : p.team;
    await phone.getByRole('button', { name: new RegExp(pick) }).click();
    await expect(phone.getByRole('heading', { name: /Tu es dans l'équipe/ })).toBeVisible();
    phones.push(phone);
  }
  await expect(
    phones[2]!.getByRole('heading', { name: "Tu es dans l'équipe Rouge !" }),
  ).toBeVisible();

  // ---- Host moves Chloé to Bleue ----
  await host.getByRole('button', { name: 'Chloé' }).click();
  await host.getByRole('button', { name: '→ Équipe Bleue' }).click();
  await expect(
    phones[2]!.getByRole('heading', { name: "Tu es dans l'équipe Bleue !" }),
  ).toBeVisible();
  await expect(start).toBeEnabled();
  await start.click();

  // Phones show their team in the header band during the game.
  await expect(phones[0]!.getByText('Alice · Équipe Rouge')).toBeVisible();

  const total = DEMO_QUIZ.questions.length;
  for (let q = 0; q < total; q++) {
    const question = DEMO_QUIZ.questions[q]!;
    await expect(host.getByRole('heading', { name: question.text })).toBeVisible();
    for (const [i, phone] of phones.entries()) {
      const choice = PLAYERS[i]!.pick(q);
      await phone.getByRole('button', { name: `Réponse ${SHAPES[choice]!.symbol}` }).click();
    }
    // Result screen: own points + team score and rank.
    await expect(phones[0]!.getByRole('heading', { name: 'Correct !' })).toBeVisible();
    await expect(phones[0]!.getByText(/Équipe Rouge : 1re · \d+ pts/)).toBeVisible();
    await expect(phones[2]!.getByRole('heading', { name: 'Raté !' })).toBeVisible();
    await expect(phones[2]!.getByText(/Équipe Bleue : 2e · \d+ pts/)).toBeVisible();

    await host.getByRole('button', { name: 'Suivant' }).click();
    await expect(host.getByRole('heading', { name: 'Classement' })).toBeVisible();
    await expect(host.getByText("Score d'équipe = moyenne des points par joueur")).toBeVisible();
    await expect(host.locator('ol').first().locator('li').first()).toContainText('Équipe Rouge');
    await expect(host.locator('ol').first().locator('li').first()).toContainText('1 joueur');

    const isLast = q === total - 1;
    await host
      .getByRole('button', { name: isLast ? 'Voir le podium' : 'Question suivante' })
      .click();
  }

  // ---- Team podium ----
  await expect(host.getByRole('heading', { name: 'Podium des équipes' })).toBeVisible();
  await expect(host.getByText(/Meilleur joueur : Alice/)).toBeVisible();
  await expect(phones[0]!.getByRole('heading', { name: '🏆 Ton équipe gagne !' })).toBeVisible();
  await expect(phones[1]!.getByRole('heading', { name: 'Ton équipe termine 2e' })).toBeVisible();
  await expect(phones[2]!.getByText(/Tu termines 3e/)).toBeVisible();

  await host.getByRole('button', { name: 'Terminer la partie' }).click();
  for (const phone of phones) {
    await expect(phone.getByRole('heading', { name: 'Partie terminée' })).toBeVisible();
  }
});
