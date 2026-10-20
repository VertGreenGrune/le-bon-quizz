/**
 * Integration tests against a real Postgres. Skipped unless TEST_DATABASE_URL is set, e.g.
 *   docker compose up -d
 *   TEST_DATABASE_URL=postgresql://lbq:lbq@localhost:5432/lbq_test pnpm test
 * The test database is migrated and wiped by these tests — never point it at real data.
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEMO_QUIZ, type AuthResponse, type QuizDetail, type QuizInput } from '@lbq/shared';
import { createPrisma, type PrismaClient } from '../db.js';
import { registerApi } from './index.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

const { id: _demoId, ...demoInput } = DEMO_QUIZ;
const quizInput: QuizInput = demoInput;

describe.skipIf(!TEST_DATABASE_URL)('REST API (Postgres)', () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;
  let uploadDir: string;

  beforeAll(async () => {
    execSync('pnpm exec prisma migrate deploy', {
      cwd: path.resolve(import.meta.dirname, '../..'),
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
      stdio: 'ignore',
    });
    prisma = createPrisma(TEST_DATABASE_URL);
    uploadDir = mkdtempSync(path.join(tmpdir(), 'lbq-uploads-'));
    app = Fastify();
    await registerApi(app, { prisma, uploadDir, publicUrl: 'http://cdn.test' });
    await app.ready();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    if (uploadDir) rmSync(uploadDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE "User", "Quiz", "GameSession" CASCADE');
  });

  async function register(email = 'host@test.fr') {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email, name: 'Host', password: 'password123' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<AuthResponse>();
    return { ...body, headers: { authorization: `Bearer ${body.token}` } };
  }

  describe('auth', () => {
    it('register → me → logout', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { email: ' Host@Test.FR ', name: 'Host', password: 'password123' },
      });
      expect(res.statusCode).toBe(201);
      const { user, token } = res.json<AuthResponse>();
      expect(user.email).toBe('host@test.fr');
      expect(user).not.toHaveProperty('passwordHash');

      const cookie = res.cookies.find((c) => c.name === 'lbq_session');
      expect(cookie?.value).toBe(token);
      expect(cookie?.httpOnly).toBe(true);

      const me = await app.inject({ url: '/api/auth/me', cookies: { lbq_session: token } });
      expect(me.statusCode).toBe(200);
      expect(me.json()).toMatchObject({ id: user.id, email: 'host@test.fr' });

      const out = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        cookies: { lbq_session: token },
      });
      expect(out.statusCode).toBe(204);
      const after = await app.inject({ url: '/api/auth/me', cookies: { lbq_session: token } });
      expect(after.statusCode).toBe(401);
    });

    it('rejects duplicate emails and weak passwords', async () => {
      await register();
      const dup = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { email: 'host@test.fr', name: 'X', password: 'password123' },
      });
      expect(dup.statusCode).toBe(409);
      expect(dup.json().error.code).toBe('EMAIL_TAKEN');

      const weak = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { email: 'b@test.fr', name: 'X', password: 'short' },
      });
      expect(weak.statusCode).toBe(400);
      expect(weak.json().error.code).toBe('INVALID_PAYLOAD');
    });

    it('login with right / wrong password', async () => {
      await register();
      const ok = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'host@test.fr', password: 'password123' },
      });
      expect(ok.statusCode).toBe(200);
      expect(ok.json<AuthResponse>().token).toBeTruthy();

      for (const payload of [
        { email: 'host@test.fr', password: 'nope-nope' },
        { email: 'nobody@test.fr', password: 'password123' },
      ]) {
        const bad = await app.inject({ method: 'POST', url: '/api/auth/login', payload });
        expect(bad.statusCode).toBe(401);
        expect(bad.json().error.code).toBe('INVALID_CREDENTIALS');
      }
    });

    it('protects private routes', async () => {
      for (const url of ['/api/quizzes', '/api/games', '/api/auth/me']) {
        const res = await app.inject({ url });
        expect(res.statusCode).toBe(401);
        expect(res.json().error.code).toBe('UNAUTHORIZED');
      }
      const bogus = await app.inject({
        url: '/api/quizzes',
        headers: { authorization: 'Bearer bogus' },
      });
      expect(bogus.statusCode).toBe(401);
    });
  });

  describe('quizzes', () => {
    it('full CRUD + duplicate', async () => {
      const { headers } = await register();

      const created = await app.inject({
        method: 'POST',
        url: '/api/quizzes',
        headers,
        payload: quizInput,
      });
      expect(created.statusCode).toBe(201);
      const quiz = created.json<QuizDetail>();
      expect(quiz.questions).toEqual(quizInput.questions);

      const list = await app.inject({ url: '/api/quizzes', headers });
      expect(list.json()).toMatchObject([{ id: quiz.id, questionCount: 4 }]);

      const updated = await app.inject({
        method: 'PUT',
        url: `/api/quizzes/${quiz.id}`,
        headers,
        payload: { ...quizInput, title: 'Nouveau titre', questions: quizInput.questions.slice(1) },
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json<QuizDetail>()).toMatchObject({ title: 'Nouveau titre' });
      expect(updated.json<QuizDetail>().questions).toEqual(quizInput.questions.slice(1));

      const copy = await app.inject({
        method: 'POST',
        url: `/api/quizzes/${quiz.id}/duplicate`,
        headers,
      });
      expect(copy.statusCode).toBe(201);
      const copied = copy.json<QuizDetail>();
      expect(copied.id).not.toBe(quiz.id);
      expect(copied.title).toBe('Nouveau titre (copie)');
      expect(copied.questions).toHaveLength(3);

      const del = await app.inject({ method: 'DELETE', url: `/api/quizzes/${quiz.id}`, headers });
      expect(del.statusCode).toBe(204);
      const gone = await app.inject({ url: `/api/quizzes/${quiz.id}`, headers });
      expect(gone.statusCode).toBe(404);
    });

    it('validates the body with the shared schema', async () => {
      const { headers } = await register();
      const res = await app.inject({
        method: 'POST',
        url: '/api/quizzes',
        headers,
        payload: {
          ...quizInput,
          questions: [{ text: 'Q', choices: [{ text: 'a', isCorrect: false }] }],
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('INVALID_PAYLOAD');
    });

    it("hides other hosts' quizzes", async () => {
      const alice = await register('alice@test.fr');
      const bob = await register('bob@test.fr');
      const quiz = (
        await app.inject({
          method: 'POST',
          url: '/api/quizzes',
          headers: alice.headers,
          payload: quizInput,
        })
      ).json<QuizDetail>();

      const h = bob.headers;
      expect((await app.inject({ url: `/api/quizzes/${quiz.id}`, headers: h })).statusCode).toBe(
        404,
      );
      const put = await app.inject({
        method: 'PUT',
        url: `/api/quizzes/${quiz.id}`,
        headers: h,
        payload: quizInput,
      });
      expect(put.statusCode).toBe(404);
      const del = await app.inject({
        method: 'DELETE',
        url: `/api/quizzes/${quiz.id}`,
        headers: h,
      });
      expect(del.statusCode).toBe(404);
      expect((await app.inject({ url: '/api/quizzes', headers: h })).json()).toEqual([]);
    });
  });

  describe('games', () => {
    it('history, report and CSV export', async () => {
      const { user, headers } = await register();
      const other = await register('other@test.fr');
      const game = await prisma.gameSession.create({
        data: {
          quizTitle: 'Démo',
          hostId: user.id,
          pin: '123456',
          startedAt: new Date('2026-10-20T10:00:00Z'),
          endedAt: new Date('2026-10-20T10:10:00Z'),
          results: {
            create: [
              { nickname: 'Zoé', score: 900, correctCount: 1, rank: 2 },
              { nickname: '=cmd', score: 2500, correctCount: 3, rank: 1 },
            ],
          },
        },
      });

      const list = await app.inject({ url: '/api/games', headers });
      expect(list.json()).toMatchObject([{ id: game.id, playerCount: 2, quizId: null }]);

      const report = await app.inject({ url: `/api/games/${game.id}`, headers });
      expect(report.json().results.map((r: { nickname: string }) => r.nickname)).toEqual([
        '=cmd',
        'Zoé',
      ]);

      const csv = await app.inject({ url: `/api/games/${game.id}/export.csv`, headers });
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.headers['content-disposition']).toContain('lebonquizz-2026-10-20-123456.csv');
      expect(csv.body).toBe(
        "﻿rank,nickname,score,correctCount\r\n1,'=cmd,2500,3\r\n2,Zoé,900,1\r\n",
      );

      const foreign = await app.inject({ url: `/api/games/${game.id}`, headers: other.headers });
      expect(foreign.statusCode).toBe(404);
    });
  });

  describe('uploads', () => {
    const multipart = (content: Buffer, filename: string) => {
      const boundary = '----lbqtest';
      const payload = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
            'Content-Type: image/png\r\n\r\n',
        ),
        content,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);
      return { payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
    };

    it('stores an image and serves it', async () => {
      const { headers } = await register();
      const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
      const body = multipart(png, 'a.png');
      const res = await app.inject({
        method: 'POST',
        url: '/api/uploads/image',
        payload: body.payload,
        headers: { ...headers, ...body.headers },
      });
      expect(res.statusCode).toBe(201);
      const { url } = res.json<{ url: string }>();
      expect(url).toMatch(/^http:\/\/cdn\.test\/uploads\/[\w-]+\.png$/);

      const served = await app.inject({ url: new URL(url).pathname });
      expect(served.statusCode).toBe(200);
      expect(served.headers['x-content-type-options']).toBe('nosniff');
      expect(served.rawPayload.equals(png)).toBe(true);
    });

    it('rejects non-images even if they claim to be PNG', async () => {
      const { headers } = await register();
      const body = multipart(Buffer.from('<script>alert(1)</script>'), 'evil.png');
      const res = await app.inject({
        method: 'POST',
        url: '/api/uploads/image',
        payload: body.payload,
        headers: { ...headers, ...body.headers },
      });
      expect(res.statusCode).toBe(415);
      expect(res.json().error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    });
  });
});
