import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * Forgotten password (T24): "Mot de passe oublié ?" → e-mail caught by Mailpit → link → new
 * password → logged in on /editor; the old password is refused, the new one works.
 *
 * Needs a database and the Mailpit container (`docker compose up -d postgres mailpit`; the dev
 * server sends to smtp://localhost:1025 when SMTP_URL is unset), e.g.
 *   E2E_DATABASE_URL=postgresql://lbq:lbq@localhost:5432/lbq_e2e pnpm test:e2e
 */
test.skip(!process.env.E2E_DATABASE_URL, 'E2E_DATABASE_URL not set (needs Postgres)');

const SERVER_URL = `http://localhost:${process.env.E2E_SERVER_PORT ?? 3004}`;
const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025';

interface MailpitSearch {
  messages: { ID: string; Subject: string }[];
}

/** Waits for the mail sent to `to` and returns its plain-text body. */
async function readMail(request: APIRequestContext, to: string): Promise<string> {
  let id: string | undefined;
  await expect
    .poll(
      async () => {
        const res = await request.get(`${MAILPIT_URL}/api/v1/search`, {
          params: { query: `to:"${to}"` },
        });
        id = ((await res.json()) as MailpitSearch).messages[0]?.ID;
        return id;
      },
      { message: `no mail for ${to} in Mailpit (${MAILPIT_URL})`, timeout: 15_000 },
    )
    .toBeTruthy();
  const res = await request.get(`${MAILPIT_URL}/api/v1/message/${id}`);
  const mail = (await res.json()) as { Subject: string; Text: string };
  expect(mail.Subject).toBe('Le Bon Quizz : choisir un nouveau mot de passe');
  return mail.Text;
}

test('forgotten password: e-mail link → new password → logged in', async ({ page, request }) => {
  const mailpit = await request.get(`${MAILPIT_URL}/api/v1/info`).catch(() => null);
  test.skip(!mailpit?.ok() && !process.env.CI, `Mailpit not reachable at ${MAILPIT_URL}`);

  const email = `oubli-${Date.now()}@e2e.test`;
  const registered = await request.post(`${SERVER_URL}/api/auth/register`, {
    data: { email, name: 'Oscar', password: 'ancien-mdp-1' },
  });
  expect(registered.status()).toBe(201);

  // ---- Ask for a link ----
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByRole('link', { name: 'Mot de passe oublié ?' }).click();
  await expect(page.getByRole('heading', { name: 'Mot de passe oublié' })).toBeVisible();
  await expect(page.getByLabel('E-mail')).toHaveValue(email); // carried over from /login
  await page.getByRole('button', { name: 'Recevoir le lien' }).click();
  await expect(page.getByText('Si un compte existe pour cette adresse')).toBeVisible();

  // ---- Read the mail, open its link ----
  const text = await readMail(request, email);
  expect(text).toContain('Bonjour Oscar');
  const link = /(http\S+\/reset-password\?token=\S+)/.exec(text)?.[1];
  expect(link, text).toBeTruthy();
  expect(new URL(link!).origin).toBe(new URL(page.url()).origin); // the web app, not the API

  await page.goto(link!);
  await expect(page.getByRole('heading', { name: 'Nouveau mot de passe' })).toBeVisible();
  await page.getByLabel('Nouveau mot de passe').fill('nouveau-mdp-1');
  await page.getByLabel('Confirmer le mot de passe').fill('pas-pareil');
  await page.getByRole('button', { name: 'Enregistrer et se connecter' }).click();
  await expect(page.getByText('Les deux mots de passe ne correspondent pas')).toBeVisible();
  await page.getByLabel('Confirmer le mot de passe').fill('nouveau-mdp-1');
  await page.getByRole('button', { name: 'Enregistrer et se connecter' }).click();

  // ---- Logged in on the editor ----
  await expect(page).toHaveURL(/\/editor$/);
  await expect(page.getByText('Mot de passe modifié ✓')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Mon compte' })).toBeVisible();

  // ---- The link is single use ----
  await page.goto(link!);
  await page.getByLabel('Nouveau mot de passe').fill('encore-un-mdp');
  await page.getByLabel('Confirmer le mot de passe').fill('encore-un-mdp');
  await page.getByRole('button', { name: 'Enregistrer et se connecter' }).click();
  await expect(page.getByText('Ce lien n’est plus valable')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Demander un nouveau lien' })).toBeVisible();

  // ---- Old password refused, new one works ----
  const login = (password: string) =>
    request.post(`${SERVER_URL}/api/auth/login`, { data: { email, password } });
  expect((await login('ancien-mdp-1')).status()).toBe(401);
  expect((await login('nouveau-mdp-1')).status()).toBe(200);

  // ---- « Mon compte »: change the password while logged in ----
  await page.goto('/editor');
  await page.getByRole('link', { name: 'Mon compte' }).click();
  await expect(page.getByRole('heading', { name: 'Mon compte' })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
  await page.getByLabel('Mot de passe actuel').fill('pas-le-bon');
  await page.getByLabel(/^Nouveau mot de passe/).fill('troisieme-mdp');
  await page.getByLabel('Confirmer le nouveau mot de passe').fill('troisieme-mdp');
  await page.getByRole('button', { name: 'Changer le mot de passe' }).click();
  await expect(page.getByText('Mot de passe actuel incorrect')).toBeVisible();
  await page.getByLabel('Mot de passe actuel').fill('nouveau-mdp-1');
  await page.getByRole('button', { name: 'Changer le mot de passe' }).click();
  await expect(page.getByText('Vos autres appareils ont été déconnectés.')).toBeVisible();
  await page.reload(); // this session is kept
  await expect(page.getByRole('heading', { name: 'Mon compte' })).toBeVisible();
  expect((await login('nouveau-mdp-1')).status()).toBe(401);
  expect((await login('troisieme-mdp')).status()).toBe(200);
});
