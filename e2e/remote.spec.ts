import { expect, test, devices } from '@playwright/test';
import type { QuizDetail, QuizInput } from '@lbq/shared';

/**
 * T39 « Télécommande »: the TV opens the remote dialog on demand, a second phone opens the link
 * and drives the game — start, the answer in secret, ⏸ pause / ▶ reprendre, a buzzer judged ✅,
 * podium — while a player phone plays and never receives the answer. Then the TV revokes it.
 *
 * Needs a database (host account, DB quiz with a buzzer question): runs only when
 * `E2E_DATABASE_URL` is set.
 */
test.skip(!process.env.E2E_DATABASE_URL, 'E2E_DATABASE_URL not set (needs Postgres)');

const SERVER_URL = `http://localhost:${process.env.E2E_SERVER_PORT ?? 3004}`;
const stamp = Date.now();
const EXPLANATION = 'Burton a commencé comme animateur chez Disney.';

test('the host drives the game from a phone remote', async ({ browser, baseURL }) => {
  const tvContext = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const reg = await tvContext.request.post(`${SERVER_URL}/api/auth/register`, {
    data: { email: `remote-${stamp}@e2e.test`, name: 'Tim', password: 'password123' },
  });
  expect(reg.status()).toBe(201);
  const input: QuizInput = {
    title: `Télécommande ${stamp}`,
    questions: [
      {
        type: 'MCQ',
        text: 'Qui a réalisé Beetlejuice ?',
        timeLimitSec: 60,
        basePoints: 1000,
        explanation: EXPLANATION,
        choices: [
          { text: 'Tim Burton', isCorrect: true },
          { text: 'Sam Raimi', isCorrect: false },
        ],
      },
      {
        type: 'TYPE_ANSWER',
        text: 'Le plus grand océan ?',
        timeLimitSec: 60,
        basePoints: 1000,
        buzzer: true,
        acceptedAnswers: ['Pacifique'],
        typoTolerance: true,
      },
    ],
  };
  const created = await tvContext.request.post(`${SERVER_URL}/api/quizzes`, { data: input });
  expect(created.status()).toBe(201);
  const { id: quizId } = (await created.json()) as QuizDetail;

  // ---- TV: the remote QR code is only shown on demand ----
  const tv = await tvContext.newPage();
  tv.on('dialog', (d) => void d.accept());
  await tv.goto(`/host/new?quizId=${quizId}`);
  await expect(tv).toHaveURL(/\/host\/\d{6}$/);
  const pin = new URL(tv.url()).pathname.split('/').pop()!;
  await expect(tv.getByTestId('remote-qr')).toHaveCount(0);
  await tv.getByRole('button', { name: /📱 Télécommande/ }).click();
  await expect(tv.getByTestId('remote-qr')).toBeVisible();
  await expect(tv.getByText('Aucune télécommande connectée.')).toBeVisible();
  const href = (await tv.getByTestId('remote-link').getAttribute('href'))!;
  // The QR code uses the PC's LAN address; the test browser opens it on the test web server.
  const link = new URL(href);
  expect(link.pathname).toBe(`/remote/${pin}`);
  expect(link.hash.length).toBeGreaterThan(20);

  // ---- The host's phone opens the link ----
  const remoteContext = await browser.newContext({ ...devices['Pixel 7'] });
  const remote = await remoteContext.newPage();
  remote.on('dialog', (d) => void d.accept());
  await remote.goto(`${baseURL}${link.pathname}${link.hash}`);
  await expect(remote.getByTestId('remote-phase')).toHaveText("Salle d'attente");
  await expect(remote).toHaveURL(new RegExp(`/remote/${pin}$`)); // token out of the address bar
  await expect(tv.getByText('✅ Télécommande connectée')).toBeVisible();
  await tv.getByRole('button', { name: 'Fermer' }).click();
  await expect(tv.getByRole('button', { name: '📱 Télécommande connectée' })).toBeVisible();
  // A reload reconnects with the token kept on the phone.
  await remote.reload();
  await expect(remote.getByTestId('remote-phase')).toHaveText("Salle d'attente");

  // ---- A player, recording everything the server sends to their phone ----
  const phoneContext = await browser.newContext({ ...devices['Pixel 7'] });
  const phone = await phoneContext.newPage();
  const frames: string[] = [];
  phone.on('websocket', (ws) =>
    ws.on('framereceived', (f) => frames.push(typeof f.payload === 'string' ? f.payload : '')),
  );
  await phone.goto(`/join?pin=${pin}`);
  await phone.getByPlaceholder('Ton pseudo').fill('Alice');
  await phone.getByRole('button', { name: 'Entrer' }).click();
  await expect(remote.getByText('Alice')).toBeVisible();

  // ---- Start from the remote ----
  await remote.getByTestId('remote-main').click();
  await expect(tv.getByRole('heading', { name: 'Qui a réalisé Beetlejuice ?' })).toBeVisible();
  await expect(remote.getByTestId('remote-question')).toHaveText('Qui a réalisé Beetlejuice ?');
  await expect(remote.getByTestId('remote-answer')).toHaveCount(0); // hidden by default
  await remote.getByTestId('remote-peek').click();
  await expect(remote.getByTestId('remote-answer')).toContainText('Tim Burton');
  await expect(remote.getByTestId('remote-answer')).toContainText(EXPLANATION);
  await remote.getByTestId('remote-peek').click();
  await expect(remote.getByTestId('remote-answer')).toHaveCount(0);

  // ---- ⏸ Pause / ▶ Reprendre ----
  await expect(phone.getByRole('button', { name: /^Réponse / })).toHaveCount(2);
  await remote.getByRole('button', { name: '⏸ Pause' }).click();
  await expect(tv.getByRole('heading', { name: "⏸ Pause demandée par l'animateur" })).toBeVisible();
  await expect(phone.getByTestId('pause-overlay')).toContainText(
    "⏸ Pause demandée par l'animateur",
  );
  const timer = remote.getByTestId('remote-timer');
  const frozen = await timer.innerText();
  await remote.waitForTimeout(2000);
  await expect(timer).toHaveText(frozen);
  await remote.getByRole('button', { name: '▶ Reprendre' }).click();
  await expect(tv.getByTestId('host-pause')).toHaveCount(0, { timeout: 8000 });
  await expect(phone.getByTestId('pause-overlay')).toHaveCount(0);

  // Nothing the phone got so far carries the answer, the explanation or the remote's events.
  const leaks = (text: string) => frames.filter((f) => f.includes(text));
  expect(leaks(EXPLANATION)).toEqual([]);
  expect(leaks('remote:')).toEqual([]);

  await phone.getByRole('button', { name: 'Réponse ▲' }).click();
  await expect(phone.getByRole('heading', { name: 'Correct !' })).toBeVisible();
  await expect(remote.getByTestId('remote-count')).toHaveText('1 / 1 a répondu');
  await expect(remote.getByTestId('remote-phase')).toHaveText('Question 1 / 2 · Réponse');

  // ---- Buzzer judged from the remote ----
  await remote.getByTestId('remote-main').click(); // Suivant → classement
  await expect(remote.getByTestId('remote-phase')).toHaveText('Classement');
  await remote.getByTestId('remote-main').click(); // Suivant → question 2
  await expect(tv.getByRole('heading', { name: 'Le plus grand océan ?' })).toBeVisible();
  const before = frames.length;
  await phone.getByRole('button', { name: 'BUZZ' }).click();
  await expect(remote.getByText('Alice a buzzé !')).toBeVisible();
  await remote.getByTestId('remote-peek').click();
  await expect(remote.getByTestId('remote-answer')).toContainText('Pacifique');
  expect(frames.slice(before).filter((f) => f.includes('Pacifique'))).toEqual([]);
  await remote.getByRole('button', { name: 'Bonne réponse' }).click();
  await expect(tv.getByTestId('buzzer-reveal')).toContainText('Alice a trouvé !');
  await expect(phone.getByRole('heading', { name: 'Bien joué !' })).toBeVisible();

  // ---- TV controls relayed ----
  const tvSound = tv.getByRole('button', { name: 'Réglages du son' });
  await remote.getByRole('button', { name: 'Couper le son de la TV' }).click();
  await expect(tvSound).toContainText('🔇');
  await remote.getByRole('button', { name: 'Remettre le son de la TV' }).click();
  await expect(tvSound).toContainText('🔊');
  // « Musique − » (T41): the TV's « Musique et effets » level goes down by 20 %.
  await remote.getByRole('button', { name: 'Baisser la musique de la TV' }).click();
  await expect
    .poll(() => tv.evaluate(() => localStorage.getItem('lbq:host:music-volume')))
    .toBe('80');

  // ---- To the podium ----
  await remote.getByTestId('remote-main').click(); // Suivant
  await expect(remote.getByTestId('remote-main')).toHaveText('Voir le podium');
  await remote.getByTestId('remote-main').click();
  await expect(remote.getByTestId('remote-phase')).toHaveText('Podium');
  await expect(remote.getByText('Alice')).toBeVisible();
  expect(leaks('remote:')).toEqual([]);

  // ---- The TV revokes the remote ----
  await tv.getByRole('button', { name: /📱 Télécommande/ }).click();
  await tv.getByRole('button', { name: 'Déconnecter la télécommande' }).click();
  await expect(remote.getByRole('heading', { name: 'Télécommande déconnectée' })).toBeVisible();
  await expect(tv.getByText(/Télécommande déconnectée\. Scanne le nouveau QR code/)).toBeVisible();
  await tv.getByRole('button', { name: 'Fermer' }).click();
  // Reloading with the old token doesn't bring it back.
  await remote.reload();
  await expect(
    remote.getByRole('heading', { name: /Télécommande déconnectée|Lien/ }),
  ).toBeVisible();

  await tv.getByRole('button', { name: 'Terminer la partie' }).click();
  await expect(tv.getByRole('link', { name: "Retour à l'accueil" })).toBeVisible();

  for (const c of [tvContext, remoteContext, phoneContext]) await c.close();
});
