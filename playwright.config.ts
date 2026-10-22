import { defineConfig, devices } from '@playwright/test';

// Own ports so the e2e run never collides with `pnpm dev` (3001 / 5173).
const SERVER_PORT = Number(process.env.E2E_SERVER_PORT ?? 3004);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5184);
const SERVER_URL = `http://localhost:${SERVER_PORT}`;
const WEB_URL = `http://localhost:${WEB_PORT}`;
/**
 * Database for the specs that need host accounts (`e2e/library.spec.ts`, skipped without it).
 * It is migrated before the server starts; tests only add rows (unique emails), never wipe it.
 */
const DATABASE_URL = process.env.E2E_DATABASE_URL;

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // Same entry point as the server `dev` script, without --watch.
      command: `${DATABASE_URL ? 'pnpm exec prisma migrate deploy && ' : ''}node --import tsx src/index.ts`,
      cwd: 'apps/server',
      url: `${SERVER_URL}/health`,
      // Known joker hands for `e2e/jokers.spec.ts` (instead of random ones).
      env: {
        PORT: String(SERVER_PORT),
        E2E_JOKER_HAND: 'freeze,copy,fifty',
        ...(DATABASE_URL && { DATABASE_URL }),
      },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: `pnpm exec vite --port ${WEB_PORT} --strictPort`,
      cwd: 'apps/web',
      url: WEB_URL,
      env: { VITE_SERVER_URL: SERVER_URL },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
