import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

/**
 * « 📻 Radio du thème »: the TV plays the theme's SomaFM station (mocked here with a local WAV,
 * so the run stays offline), switches back to the game music, and falls back to it when the
 * station can't be reached.
 */
const WAV = readFileSync(
  fileURLToPath(new URL('../apps/web/public/sounds/lobby.wav', import.meta.url)),
);

test('the TV plays the theme radio, and falls back to the game music', async ({ page }) => {
  let reachable = true;
  const requests: string[] = [];
  await page.route('https://ice2.somafm.com/**', (route) => {
    requests.push(route.request().url());
    return reachable
      ? route.fulfill({ status: 200, contentType: 'audio/wav', body: WAV })
      : route.abort('internetdisconnected');
  });
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/host/new');
  await expect(page.getByText('En attente des joueurs…')).toBeVisible();

  const soundButton = page.getByRole('button', { name: 'Réglages du son' });
  await soundButton.click();
  const radioChoice = page.getByTestId('ambiance-radio');
  await expect(page.getByText('Radio du thème : Secret Agent')).toBeVisible();
  await radioChoice.check();

  const radio = page.locator('audio[data-testid="theme-radio"]');
  await expect(radio).toHaveAttribute('src', 'https://ice2.somafm.com/secretagent-128-mp3');
  await expect.poll(() => radio.evaluate((el: HTMLAudioElement) => !el.paused)).toBe(true);
  expect(requests.length).toBeGreaterThan(0);

  // « Musique du jeu »: the stream stops (no src any more).
  await page.getByTestId('ambiance-game').check();
  await expect(radio).not.toHaveAttribute('src');

  // Station unreachable → message, and the game music takes over.
  reachable = false;
  await radioChoice.check();
  await expect(page.getByText('Radio injoignable : musique du jeu à la place.')).toBeVisible({
    timeout: 15_000,
  });
  await expect(radio).not.toHaveAttribute('src');
});
