import { expect, test } from '@playwright/test';
import { DEMO_QUIZ, type QuizDetail } from '@lbq/shared';

/**
 * The quiz editor on a small phone (375 px): no horizontal scrolling on any question type (the
 * demo has one of each), the type is a drop-down list and the save / launch buttons sit in a bar
 * at the bottom of the screen.
 *
 * Needs a database (host account, DB quiz): runs only when `E2E_DATABASE_URL` is set.
 */
test.skip(!process.env.E2E_DATABASE_URL, 'E2E_DATABASE_URL not set (needs Postgres)');

const SERVER_URL = `http://localhost:${process.env.E2E_SERVER_PORT ?? 3004}`;

test('the editor fits a phone screen', async ({ browser }) => {
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 740 },
    isMobile: true,
    hasTouch: true,
  });
  const reg = await ctx.request.post(`${SERVER_URL}/api/auth/register`, {
    data: { email: `phone-${Date.now()}@e2e.test`, name: 'Tel', password: 'password123' },
  });
  expect(reg.status()).toBe(201);
  const { id: _id, ...input } = DEMO_QUIZ;
  const created = await ctx.request.post(`${SERVER_URL}/api/quizzes`, { data: input });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()) as QuizDetail;

  const page = await ctx.newPage();
  await page.goto(`/editor/${id}`);
  const bar = page.getByTestId('phone-actions');
  await expect(bar.getByRole('button', { name: '▶ Lancer' })).toBeVisible();
  await expect(bar.getByRole('button', { name: 'Enregistré ✓' })).toBeVisible();

  const width = () => page.evaluate(() => document.documentElement.scrollWidth);
  const tabs = page.getByRole('navigation', { name: 'Questions' }).getByRole('button', {
    name: /^\d+/,
  });
  const count = await tabs.count();
  expect(count).toBe(DEMO_QUIZ.questions.length);
  for (let i = 0; i < count; i++) {
    await tabs.nth(i).evaluate((b) => (b as HTMLButtonElement).click());
    await expect(page.getByTestId('type-select')).toHaveValue(DEMO_QUIZ.questions[i]!.type);
    expect(await width(), `question ${i + 1}`).toBeLessThanOrEqual(375);
  }
  await ctx.close();
});
