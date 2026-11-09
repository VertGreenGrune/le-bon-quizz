import { expect, test, devices } from '@playwright/test';

/**
 * T47 « 📺 Afficher sur la TV »: a Fire TV (960 × 540 browser) opens /tv and shows a code; the
 * host types it on their device → the TV becomes the host screen and the host's device the
 * « Télécommande », which starts the game while a phone plays. Demo quiz: no database needed.
 */
test('the host sends the game to a TV with its code', async ({ browser }) => {
  const tvContext = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const tv = await tvContext.newPage();
  await tv.goto('/tv');
  const codeText = tv.getByTestId('tv-code');
  await expect(codeText).toHaveText(/^\d{4}$/);
  const code = (await codeText.textContent())!;
  await tv.keyboard.press('Enter'); // « Activer le son » has the focus (the remote's OK)
  await expect(tv.getByRole('button', { name: '🔊 Son activé' })).toBeVisible();

  const pcContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pc = await pcContext.newPage();
  await pc.goto('/host/new');
  await expect(pc).toHaveURL(/\/host\/\d{6}$/);
  const pin = new URL(pc.url()).pathname.split('/').pop()!;

  await pc.getByRole('button', { name: '📺 Afficher sur la TV' }).click();
  await expect(pc.getByTestId('tv-url')).toContainText('/tv');
  const input = pc.getByLabel('Code de la TV');
  await input.fill(code === '0000' ? '0001' : '0000');
  await pc.getByRole('button', { name: 'Envoyer sur la TV' }).click();
  await expect(pc.getByRole('alert')).toContainText('Aucune TV');
  await input.fill(code);
  await pc.getByRole('button', { name: 'Envoyer sur la TV' }).click();

  // The TV is now the host screen, the PC the remote.
  await expect(tv).toHaveURL(new RegExp(`/host/${pin}$`));
  await expect(tv.getByText(pin).first()).toBeVisible();
  await expect(tv.getByRole('button', { name: '📺 Afficher sur la TV' })).toHaveCount(0);
  await expect(pc).toHaveURL(new RegExp(`/remote/${pin}$`));

  const phoneContext = await browser.newContext({ ...devices['Pixel 7'] });
  const phone = await phoneContext.newPage();
  await phone.goto(`/join?pin=${pin}`);
  await phone.getByPlaceholder('Ton pseudo').fill('Alice');
  await phone.getByRole('button', { name: 'Entrer' }).click();
  await expect(tv.getByText('Alice').first()).toBeVisible();

  await pc.getByRole('button', { name: /Commencer/ }).click();
  await expect(tv.getByText(/Question 1 \//)).toBeVisible();

  await Promise.all([tvContext.close(), pcContext.close(), phoneContext.close()]);
});
