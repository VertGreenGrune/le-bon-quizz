/**
 * T46 — Firebase Auth: `/auth/config`, `/auth/firebase` (create, link by verified e-mail,
 * refuse an unverified one) and the local endpoints switched off. Real Postgres, skipped unless
 * TEST_DATABASE_URL is set (the database is wiped, like api.test.ts). Tokens are signed by a
 * local key (`fakeFirebase`), so no Firebase project is needed.
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ApiErrorBody, AuthConfig, AuthResponse, PublicUser } from '@lbq/shared';
import { hashPassword } from '../auth/index.js';
import { FAKE_FIREBASE_PROJECT, fakeFirebase } from '../auth/firebaseTesting.js';
import { createPrisma, type PrismaClient } from '../db.js';
import { registerApi } from './index.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const CONFIG = {
  apiKey: 'test-key',
  projectId: FAKE_FIREBASE_PROJECT,
  authDomain: `${FAKE_FIREBASE_PROJECT}.firebaseapp.com`,
};

describe.skipIf(!TEST_DATABASE_URL)('Firebase Auth (Postgres)', () => {
  let prisma: PrismaClient;
  let firebaseApp: FastifyInstance;
  let localApp: FastifyInstance;
  let uploadDir: string;
  let sign: Awaited<ReturnType<typeof fakeFirebase>>['sign'];

  beforeAll(async () => {
    execSync('pnpm exec prisma migrate deploy', {
      cwd: path.resolve(import.meta.dirname, '../..'),
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
      stdio: 'ignore',
    });
    prisma = createPrisma(TEST_DATABASE_URL);
    uploadDir = mkdtempSync(path.join(tmpdir(), 'lbq-uploads-'));
    const fake = await fakeFirebase();
    sign = fake.sign;
    firebaseApp = Fastify();
    await registerApi(firebaseApp, {
      prisma,
      uploadDir,
      firebase: { config: CONFIG, verify: fake.verify },
    });
    await firebaseApp.ready();
    localApp = Fastify();
    await registerApi(localApp, { prisma, uploadDir });
    await localApp.ready();
  }, 60_000);

  afterAll(async () => {
    await firebaseApp?.close();
    await localApp?.close();
    await prisma?.$disconnect();
    if (uploadDir) rmSync(uploadDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE "User", "Quiz", "GameSession" CASCADE');
  });

  const signIn = (idToken: string, name?: string, app = firebaseApp) =>
    app.inject({ method: 'POST', url: '/api/auth/firebase', payload: { idToken, name } });

  it('serves the web config in Firebase mode, nothing in local mode', async () => {
    const on = await firebaseApp.inject({ url: '/api/auth/config' });
    expect(on.json<AuthConfig>()).toEqual({ firebase: CONFIG });
    const off = await localApp.inject({ url: '/api/auth/config' });
    expect(off.json<AuthConfig>()).toEqual({});
    const refused = await signIn(await sign({ email: 'a@test.fr' }), undefined, localApp);
    expect(refused.statusCode).toBe(404);
  });

  it('creates an account at the first sign-in, then finds it by uid', async () => {
    const res = await signIn(await sign({ email: 'Lea@Test.fr', name: 'Léa G.' }), 'Léa');
    expect(res.statusCode).toBe(200);
    const body = res.json<AuthResponse>();
    expect(body.user).toMatchObject({ email: 'lea@test.fr', name: 'Léa', firebase: true });
    expect(res.cookies.find((c) => c.name === 'lbq_session')?.value).toBe(body.token);

    // Same uid, e-mail changed at Firebase: same account.
    const again = await signIn(await sign({ email: 'new@test.fr' }));
    expect(again.json<AuthResponse>().user.id).toBe(body.user.id);
    expect(await prisma.user.count()).toBe(1);

    const me = await firebaseApp.inject({
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${body.token}` },
    });
    expect(me.json<PublicUser>()).toMatchObject({ id: body.user.id, firebase: true });
  });

  it('names a new account from the token, else from the e-mail', async () => {
    const named = await signIn(await sign({ email: 'a@test.fr', name: 'Alice' }, { sub: 'u-a' }));
    expect(named.json<AuthResponse>().user.name).toBe('Alice');
    const bare = await signIn(await sign({ email: 'bruno.l@test.fr' }, { sub: 'u-b' }));
    expect(bare.json<AuthResponse>().user.name).toBe('bruno.l');
  });

  it('links an existing local account when Firebase verified the e-mail (quizzes kept)', async () => {
    const user = await prisma.user.create({
      data: { email: 'host@test.fr', name: 'Host', passwordHash: await hashPassword('x1234567') },
    });
    await prisma.quiz.create({ data: { ownerId: user.id, title: 'Mon quiz' } });

    const unverified = await signIn(await sign({ email: 'host@test.fr', email_verified: false }));
    expect(unverified.statusCode).toBe(403);
    expect(unverified.json<ApiErrorBody>().error.code).toBe('EMAIL_NOT_VERIFIED');
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).firebaseUid,
    ).toBeNull();

    const res = await signIn(await sign({ email: 'HOST@test.fr' }, { sub: 'google-42' }));
    expect(res.statusCode).toBe(200);
    const body = res.json<AuthResponse>();
    expect(body.user).toMatchObject({ id: user.id, name: 'Host', firebase: true });
    const quizzes = await firebaseApp.inject({
      url: '/api/quizzes',
      headers: { authorization: `Bearer ${body.token}` },
    });
    expect(quizzes.json<{ title: string }[]>().map((q) => q.title)).toEqual(['Mon quiz']);
  });

  it('refuses an invalid token', async () => {
    const res = await signIn('not-a-token');
    expect(res.statusCode).toBe(401);
    expect(res.json<ApiErrorBody>().error.code).toBe('FIREBASE_TOKEN_INVALID');
    const other = await fakeFirebase();
    expect((await signIn(await other.sign({ email: 'a@test.fr' }))).statusCode).toBe(401);
  });

  it('switches the local password endpoints off', async () => {
    const payloads: [string, object][] = [
      ['/api/auth/register', { email: 'a@test.fr', name: 'A', password: 'password123' }],
      ['/api/auth/login', { email: 'a@test.fr', password: 'password123' }],
      ['/api/auth/forgot-password', { email: 'a@test.fr' }],
      ['/api/auth/reset-password', { token: 'x', password: 'password123' }],
      ['/api/auth/change-password', { currentPassword: 'x', newPassword: 'password123' }],
    ];
    for (const [url, payload] of payloads) {
      const res = await firebaseApp.inject({ method: 'POST', url, payload });
      expect(res.statusCode, url).toBe(404);
      expect(res.json<ApiErrorBody>().error.code, url).toBe('LOCAL_AUTH_DISABLED');
    }
  });

  it('local mode: an account without a password (created by Firebase) cannot log in', async () => {
    await prisma.user.create({ data: { email: 'g@test.fr', name: 'G', firebaseUid: 'g' } });
    const res = await localApp.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'g@test.fr', password: 'password123' },
    });
    expect(res.statusCode).toBe(401);
  });
});
