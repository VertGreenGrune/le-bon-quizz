/**
 * Forgotten password, reset link, change password and login rate limit (T24), against a real
 * Postgres. Skipped unless TEST_DATABASE_URL is set (see api.test.ts; the database is wiped).
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AuthResponse } from '@lbq/shared';
import { hashToken } from '../auth/index.js';
import { createAuthRateLimits } from '../auth/rateLimit.js';
import { createPrisma, type PrismaClient } from '../db.js';
import type { Mail, Mailer } from '../mail/mailer.js';
import { registerApi } from './index.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const EMAIL = 'host@test.fr';
const PASSWORD = 'password123';

describe.skipIf(!TEST_DATABASE_URL)('password reset & change (Postgres)', () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;
  let uploadDir: string;
  const sent: Mail[] = [];
  const mailer: Mailer = { send: async (mail) => void sent.push(mail) };
  const rateLimits = createAuthRateLimits();

  beforeAll(async () => {
    execSync('pnpm exec prisma migrate deploy', {
      cwd: path.resolve(import.meta.dirname, '../..'),
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
      stdio: 'ignore',
    });
    prisma = createPrisma(TEST_DATABASE_URL);
    uploadDir = mkdtempSync(path.join(tmpdir(), 'lbq-uploads-'));
    app = Fastify();
    await registerApi(app, {
      prisma,
      uploadDir,
      mailer,
      rateLimits,
      publicWebUrl: 'https://quiz.test',
    });
    await app.ready();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    if (uploadDir) rmSync(uploadDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE "User", "Quiz", "GameSession" CASCADE');
    sent.length = 0;
    rateLimits.clear();
  });

  async function register() {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: EMAIL, name: 'Léa', password: PASSWORD },
    });
    expect(res.statusCode).toBe(201);
    return res.json<AuthResponse>();
  }

  const login = (password: string, remoteAddress = '127.0.0.1') =>
    app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: EMAIL, password },
      remoteAddress,
    });
  const forgot = (email: string, remoteAddress = '127.0.0.1') =>
    app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email },
      remoteAddress,
    });
  const reset = (token: string, password = 'nouveau-mdp-1') =>
    app.inject({ method: 'POST', url: '/api/auth/reset-password', payload: { token, password } });
  const me = (token: string) =>
    app.inject({ url: '/api/auth/me', headers: { authorization: `Bearer ${token}` } });

  /** Token of the link in the last e-mail sent. */
  function lastToken(): string {
    const link = /https:\/\/quiz\.test\/reset-password\?token=([\w-]+)/.exec(sent.at(-1)!.text);
    expect(link).not.toBeNull();
    return decodeURIComponent(link![1]!);
  }

  describe('forgot-password', () => {
    it('answers 204 for unknown e-mails and sends nothing', async () => {
      const res = await forgot('nobody@test.fr');
      expect(res.statusCode).toBe(204);
      expect(res.body).toBe('');
      expect(sent).toHaveLength(0);
      expect(await prisma.passwordResetToken.count()).toBe(0);
    });

    it('e-mails a link whose token is only stored hashed, valid 1 hour', async () => {
      await register();
      const res = await forgot(' Host@Test.FR ');
      expect(res.statusCode).toBe(204);
      expect(sent).toHaveLength(1);
      expect(sent[0]!.to).toBe(EMAIL);
      expect(sent[0]!.text).toContain('Bonjour Léa');
      const token = lastToken();
      expect(token.length).toBeGreaterThanOrEqual(43); // 32 bytes, base64url

      const [row] = await prisma.passwordResetToken.findMany();
      expect(row!.id).toBe(hashToken(token));
      expect(row!.id).not.toContain(token);
      expect(row!.usedAt).toBeNull();
      const ttl = row!.expiresAt.getTime() - Date.now();
      expect(ttl).toBeGreaterThan(59 * 60_000);
      expect(ttl).toBeLessThanOrEqual(3600_000);
    });

    it('uses the request origin without PUBLIC_WEB_URL', async () => {
      const other = Fastify();
      await registerApi(other, { prisma, uploadDir, mailer });
      await register();
      await other.inject({
        method: 'POST',
        url: '/api/auth/forgot-password',
        payload: { email: EMAIL },
        headers: { origin: 'http://192.168.1.20:5173' },
      });
      await other.close();
      expect(sent.at(-1)!.text).toMatch(/http:\/\/192\.168\.1\.20:5173\/reset-password\?token=/);
    });

    it('a new request invalidates the previous link', async () => {
      await register();
      await forgot(EMAIL);
      const first = lastToken();
      await forgot(EMAIL);
      const second = lastToken();
      expect(second).not.toBe(first);
      expect(await prisma.passwordResetToken.count()).toBe(1);
      expect((await reset(first)).json().error.code).toBe('RESET_TOKEN_INVALID');
      expect((await reset(second)).statusCode).toBe(200);
    });

    it('limits requests to 3 / hour per e-mail and 10 / hour per IP, still answering 204', async () => {
      await register();
      for (let i = 0; i < 5; i++) {
        expect((await forgot(EMAIL, `10.0.0.${i}`)).statusCode).toBe(204);
      }
      expect(sent).toHaveLength(3);

      rateLimits.clear();
      sent.length = 0;
      for (let i = 0; i < 10; i++) await forgot(`other${i}@test.fr`, '10.9.9.9');
      expect((await forgot(EMAIL, '10.9.9.9')).statusCode).toBe(204);
      expect(sent).toHaveLength(0); // 11th request from that IP
      await forgot(EMAIL, '10.1.1.1');
      expect(sent).toHaveLength(1);
    });
  });

  describe('reset-password', () => {
    it('sets the new password, logs in, revokes every other session; the link works once', async () => {
      const { token: oldSession } = await register();
      await forgot(EMAIL);
      const token = lastToken();

      const res = await reset(token);
      expect(res.statusCode).toBe(200);
      const body = res.json<AuthResponse>();
      expect(body.user.email).toBe(EMAIL);
      expect(res.cookies.find((c) => c.name === 'lbq_session')?.value).toBe(body.token);
      expect((await me(body.token)).statusCode).toBe(200);
      expect((await me(oldSession)).statusCode).toBe(401);

      expect((await login(PASSWORD)).statusCode).toBe(401);
      expect((await login('nouveau-mdp-1')).statusCode).toBe(200);

      const again = await reset(token, 'encore-un-autre');
      expect(again.statusCode).toBe(400);
      expect(again.json().error.code).toBe('RESET_TOKEN_INVALID');
      expect((await prisma.passwordResetToken.findFirstOrThrow()).usedAt).not.toBeNull();
    });

    it('refuses expired and unknown links, and weak passwords', async () => {
      await register();
      await forgot(EMAIL);
      const token = lastToken();
      await prisma.passwordResetToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1) } });
      expect((await reset(token)).json().error.code).toBe('RESET_TOKEN_INVALID');
      expect((await reset('unknown-token')).json().error.code).toBe('RESET_TOKEN_INVALID');
      expect((await login(PASSWORD)).statusCode).toBe(200); // unchanged

      const weak = await reset(token, 'short');
      expect(weak.statusCode).toBe(400);
      expect(weak.json().error.code).toBe('INVALID_PAYLOAD');
    });
  });

  describe('change-password', () => {
    it('needs the current password; keeps this session, revokes the others', async () => {
      const { token: here } = await register();
      const elsewhere = (await login(PASSWORD)).json<AuthResponse>().token;
      const change = (currentPassword: string) =>
        app.inject({
          method: 'POST',
          url: '/api/auth/change-password',
          headers: { authorization: `Bearer ${here}` },
          payload: { currentPassword, newPassword: 'nouveau-mdp-2' },
        });

      const wrong = await change('pas-le-bon');
      expect(wrong.statusCode).toBe(400);
      expect(wrong.json().error.code).toBe('WRONG_PASSWORD');
      expect((await me(elsewhere)).statusCode).toBe(200);

      expect((await change(PASSWORD)).statusCode).toBe(204);
      expect((await me(here)).statusCode).toBe(200);
      expect((await me(elsewhere)).statusCode).toBe(401);
      expect((await login(PASSWORD)).statusCode).toBe(401);
      expect((await login('nouveau-mdp-2')).statusCode).toBe(200);
    });

    it('requires a session', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/change-password',
        payload: { currentPassword: PASSWORD, newPassword: 'nouveau-mdp-2' },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('login rate limit', () => {
    it('answers 429 after 10 failed attempts per IP + e-mail', async () => {
      await register();
      for (let i = 0; i < 10; i++) expect((await login('mauvais-mdp')).statusCode).toBe(401);
      const blocked = await login(PASSWORD); // even the right password
      expect(blocked.statusCode).toBe(429);
      expect(blocked.json().error).toEqual({
        code: 'TOO_MANY_ATTEMPTS',
        message: 'Trop de tentatives, réessayez dans quelques minutes.',
      });
      expect((await login(PASSWORD, '10.0.0.2')).statusCode).toBe(200); // another IP
    });

    it('a successful login resets the counter', async () => {
      await register();
      for (let i = 0; i < 9; i++) await login('mauvais-mdp');
      expect((await login(PASSWORD)).statusCode).toBe(200);
      for (let i = 0; i < 9; i++) await login('mauvais-mdp');
      expect((await login(PASSWORD)).statusCode).toBe(200);
    });
  });
});
