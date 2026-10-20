import { defineConfig, devices } from '@playwright/test';

// Own ports so the e2e run never collides with `pnpm dev` (3001 / 5173).
const SERVER_PORT = Number(process.env.E2E_SERVER_PORT ?? 3004);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5184);
const SERVER_URL = `http://localhost:${SERVER_PORT}`;
const WEB_URL = `http://localhost:${WEB_PORT}`;

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
      command: 'node --import tsx src/index.ts',
      cwd: 'apps/server',
      url: `${SERVER_URL}/health`,
      env: { PORT: String(SERVER_PORT) },
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
