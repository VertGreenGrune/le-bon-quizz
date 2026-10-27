import { expect, test, devices, type Page } from '@playwright/test';
import type { QuizDetail, QuizInput } from '@lbq/shared';

/**
 * T40: TV themes. A quiz with the Halloween theme: the editor shows it, « Lancer » uses it (TV
 * theme + background + Halloween lobby music, the phone lobby follows), the answer buttons keep
 * their colors on the TV and the phone; then the start dialog overrides it with Noël.
 *
 * Needs a database (host account, DB quiz): runs only when `E2E_DATABASE_URL` is set.
 */
test.skip(!process.env.E2E_DATABASE_URL, 'E2E_DATABASE_URL not set (needs Postgres)');

const SERVER_URL = `http://localhost:${process.env.E2E_SERVER_PORT ?? 3004}`;
const stamp = Date.now();
const ANSWER_RED = 'rgb(226, 27, 60)';

async function joinPhone(phone: Page, pin: string, nickname: string) {
  await phone.goto(`/join?pin=${pin}`);
  await phone.getByPlaceholder('Ton pseudo').fill(nickname);
  await phone.getByRole('button', { name: 'Entrer' }).click();
  await expect(phone.getByText('Tu es dans la partie !')).toBeVisible();
}

test('Halloween quiz theme on the TV and the phone, overridden by Noël in the dialog', async ({
  browser,
}) => {
  const hostContext = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const reg = await hostContext.request.post(`${SERVER_URL}/api/auth/register`, {
    data: { email: `themes-${stamp}@e2e.test`, name: 'Morticia', password: 'password123' },
  });
  expect(reg.status()).toBe(201);
  const input: QuizInput = {
    title: `Frissons ${stamp}`,
    theme: 'halloween',
    questions: [
      {
        type: 'MCQ',
        text: 'Quel légume creuse-t-on pour Halloween ?',
        timeLimitSec: 60,
        basePoints: 1000,
        choices: [
          { text: 'La citrouille', isCorrect: true },
          { text: 'Le poireau', isCorrect: false },
        ],
      },
    ],
  };
  const created = await hostContext.request.post(`${SERVER_URL}/api/quizzes`, { data: input });
  expect(created.status()).toBe(201);
  const quiz = (await created.json()) as QuizDetail;
  expect(quiz.theme).toBe('halloween');

  // ---- Editor: the theme picker shows the quiz's theme ----
  const host = await hostContext.newPage();
  await host.goto(`/editor/${quiz.id}`);
  await expect(host.getByRole('radio', { name: 'Halloween' })).toHaveAttribute(
    'aria-checked',
    'true',
  );

  // ---- « Lancer » with the quiz's theme ----
  await host.goto('/editor');
  await expect(host.getByText('🎃 Halloween')).toBeVisible(); // badge in « Mes quiz »
  const lobbyMusic = host.waitForRequest(/\/sounds\/lobby-halloween\.wav$/);
  await host.getByRole('button', { name: '▶ Lancer' }).click();
  await expect(host.getByRole('combobox')).toHaveValue(''); // « Celui du quiz (🎃 Halloween) »
  await host.getByRole('button', { name: '▶ Lancer' }).last().click();
  await expect(host).toHaveURL(/\/host\/\d{6}$/);
  const pin = new URL(host.url()).pathname.split('/').pop()!;
  await expect(host.locator('main')).toHaveAttribute('data-theme', 'halloween');
  await expect(host.getByTestId('theme-background')).toBeAttached();
  await expect(host.getByTestId('theme-title')).toContainText('Soirée frissons');
  await lobbyMusic; // the lobby music is the Halloween one

  const phoneContext = await browser.newContext({ ...devices['Pixel 7'] });
  const phone = await phoneContext.newPage();
  await joinPhone(phone, pin, 'Mercredi');
  await expect(phone.locator('main')).toHaveAttribute('data-theme', 'halloween');
  await expect(phone.getByTestId('theme-background')).toBeAttached();

  // ---- The answer colors never change ----
  await host.getByRole('button', { name: 'Commencer' }).click();
  const red = phone.getByRole('button', { name: 'Réponse ▲' });
  await expect(red).toBeVisible({ timeout: 10_000 });
  await expect(red).toHaveCSS('background-color', ANSWER_RED);
  await expect(host.getByText('La citrouille')).toBeVisible();
  const tvRed = host.locator('.bg-answer-red').first();
  await expect(tvRed).toHaveCSS('background-color', ANSWER_RED);
  // The answer screen keeps the classic look on the phone (no animated layer).
  await expect(phone.getByTestId('theme-background')).toHaveCount(0);
  await phoneContext.close();

  // ---- Start dialog: Noël instead of the quiz's theme ----
  await host.goto('/editor');
  await host.getByRole('button', { name: '▶ Lancer' }).click();
  await host.getByRole('combobox').selectOption('christmas');
  await host.getByRole('button', { name: '▶ Lancer' }).last().click();
  await expect(host).toHaveURL(/\/host\/\d{6}$/);
  await expect(host.locator('main')).toHaveAttribute('data-theme', 'christmas');
  await expect(host.getByTestId('theme-title')).toContainText('Joyeux quiz de Noël');
  const pin2 = new URL(host.url()).pathname.split('/').pop()!;
  const phone2Context = await browser.newContext({ ...devices['Pixel 7'] });
  const phone2 = await phone2Context.newPage();
  await joinPhone(phone2, pin2, 'Rudolph');
  await expect(phone2.locator('main')).toHaveAttribute('data-theme', 'christmas');

  // A host reload keeps the theme (host:rejoin resync).
  await host.reload();
  await expect(host.locator('main')).toHaveAttribute('data-theme', 'christmas');
  await phone2Context.close();
  await hostContext.close();
});
