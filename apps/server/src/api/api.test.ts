/**
 * Integration tests against a real Postgres. Skipped unless TEST_DATABASE_URL is set, e.g.
 *   docker compose up -d
 *   TEST_DATABASE_URL=postgresql://lbq:lbq@localhost:5432/lbq_test pnpm test
 * The test database is migrated and wiped by these tests — never point it at real data.
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CLASSIC_DEMO_QUIZ,
  type AuthResponse,
  type LibraryQuiz,
  type QuizDetail,
  type QuizInput,
  type QuizSummary,
} from '@lbq/shared';
import { createPrisma, type PrismaClient } from '../db.js';
import { registerApi } from './index.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

const { id: _demoId, ...demoInput } = CLASSIC_DEMO_QUIZ;
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
      expect(list.json()).toMatchObject([
        { id: quiz.id, questionCount: quizInput.questions.length },
      ]);

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
      expect(copied.questions).toEqual(quizInput.questions.slice(1));

      const del = await app.inject({ method: 'DELETE', url: `/api/quizzes/${quiz.id}`, headers });
      expect(del.statusCode).toBe(204);
      const gone = await app.inject({ url: `/api/quizzes/${quiz.id}`, headers });
      expect(gone.statusCode).toBe(404);
    });

    it('saves and returns the sound clip and the picture effect of each question', async () => {
      const { headers } = await register();
      const questions: QuizInput['questions'] = [
        {
          ...quizInput.questions[0]!,
          imageUrl: 'http://cdn.test/uploads/a.png',
          imageEffect: 'pixelate',
          audio: { url: 'http://cdn.test/uploads/b.mp3', startSec: 42.5, durationSec: 20 },
          audioOnReveal: true,
        },
        {
          ...quizInput.questions[1]!,
          audio: { url: 'http://cdn.test/uploads/c.ogg', startSec: 0, durationSec: 15 },
        },
        {
          ...quizInput.questions[2]!,
          imageUrl: 'http://cdn.test/uploads/a.png',
          imageEffect: 'zoom',
        },
      ];
      const created = await app.inject({
        method: 'POST',
        url: '/api/quizzes',
        headers,
        payload: { ...quizInput, questions },
      });
      expect(created.statusCode).toBe(201);
      expect(created.json<QuizDetail>().questions).toEqual(questions);

      const noImage = await app.inject({
        method: 'POST',
        url: '/api/quizzes',
        headers,
        payload: { ...quizInput, questions: [{ ...quizInput.questions[0]!, imageEffect: 'blur' }] },
      });
      expect(noImage.statusCode).toBe(400);
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

  describe('visibility & library', () => {
    type Headers = Record<string, string>;
    const createQuiz = async (headers: Headers, input: Partial<QuizInput> = {}) =>
      (
        await app.inject({
          method: 'POST',
          url: '/api/quizzes',
          headers,
          payload: { ...quizInput, ...input },
        })
      ).json<QuizDetail>();
    const library = async (headers: Headers, query = '') => {
      const res = await app.inject({ url: `/api/library${query}`, headers });
      expect(res.statusCode).toBe(200);
      return res.json<LibraryQuiz[]>();
    };
    const played = (hostId: string, quizId: string, times: number) =>
      prisma.gameSession.createMany({
        data: Array.from({ length: times }, () => ({ hostId, quizId, quizTitle: 'x', pin: '1' })),
      });

    it('is private by default; PUT without visibility keeps it', async () => {
      const { headers } = await register();
      const quiz = await createQuiz(headers);
      expect(quiz.visibility).toBe('PRIVATE');

      const put = (payload: QuizInput) =>
        app.inject({ method: 'PUT', url: `/api/quizzes/${quiz.id}`, headers, payload });
      expect((await put({ ...quizInput, visibility: 'PUBLIC' })).json()).toMatchObject({
        visibility: 'PUBLIC',
      });
      expect((await put(quizInput)).json()).toMatchObject({ visibility: 'PUBLIC' });
      const list = (await app.inject({ url: '/api/quizzes', headers })).json<QuizSummary[]>();
      expect(list).toMatchObject([{ id: quiz.id, visibility: 'PUBLIC', playCount: 0 }]);
    });

    it('keeps the TV theme: classic by default, unchanged without it, kept by copies', async () => {
      const alice = await register('alice@test.fr');
      const bob = await register('bob@test.fr');
      const quiz = await createQuiz(alice.headers);
      expect(quiz.theme).toBe('classic');

      const put = (payload: Record<string, unknown>) =>
        app.inject({
          method: 'PUT',
          url: `/api/quizzes/${quiz.id}`,
          headers: alice.headers,
          payload,
        });
      expect(
        (await put({ ...quizInput, theme: 'halloween', visibility: 'PUBLIC' })).json(),
      ).toMatchObject({ theme: 'halloween' });
      expect((await put({ ...quizInput, visibility: 'PUBLIC' })).json()).toMatchObject({
        theme: 'halloween',
      });
      expect((await put({ ...quizInput, theme: 'disco' })).statusCode).toBe(400);
      const list = (await app.inject({ url: '/api/quizzes', headers: alice.headers })).json<
        QuizSummary[]
      >();
      expect(list).toMatchObject([{ id: quiz.id, theme: 'halloween' }]);

      const duplicate = await app.inject({
        method: 'POST',
        url: `/api/quizzes/${quiz.id}/duplicate`,
        headers: alice.headers,
      });
      expect(duplicate.json<QuizDetail>().theme).toBe('halloween');
      expect((await library(bob.headers))[0]?.theme).toBe('halloween');
      const copy = await app.inject({
        method: 'POST',
        url: `/api/library/${quiz.id}/copy`,
        headers: bob.headers,
      });
      expect(copy.json<QuizDetail>().theme).toBe('halloween');
    });

    it("lists other hosts' public quizzes only, without questions", async () => {
      const alice = await register('alice@test.fr');
      const bob = await register('bob@test.fr');
      const pub = await createQuiz(alice.headers, { title: 'Histoire', visibility: 'PUBLIC' });
      const pub2 = await createQuiz(alice.headers, { title: 'Géo', visibility: 'PUBLIC' });
      await createQuiz(alice.headers, { title: 'Secret' });
      const own = await createQuiz(bob.headers, { title: 'À moi', visibility: 'PUBLIC' });
      await played(alice.user.id, pub2.id, 2);
      await played(bob.user.id, pub.id, 1);

      const items = await library(bob.headers);
      // Most played first by default.
      expect(items.map((q) => q.title)).toEqual(['Géo', 'Histoire']);
      expect(items[0]).toEqual({
        id: pub2.id,
        title: 'Géo',
        description: quizInput.description,
        theme: 'classic',
        authorName: 'Host',
        questionCount: quizInput.questions.length,
        playCount: 2,
        createdAt: pub2.createdAt,
        updatedAt: pub2.updatedAt,
      });
      expect(JSON.stringify(items)).not.toContain('isCorrect');
      expect((await library(bob.headers, '?sort=newest')).map((q) => q.title)).toEqual([
        'Géo',
        'Histoire',
      ]);
      expect((await library(bob.headers, '?search=HIST')).map((q) => q.id)).toEqual([pub.id]);
      expect((await library(alice.headers)).map((q) => q.id)).toEqual([own.id]);
      const bad = await app.inject({ url: '/api/library?sort=random', headers: bob.headers });
      expect(bad.statusCode).toBe(400);

      // The author sees how many times their quiz was played, by anyone.
      const mine = (await app.inject({ url: '/api/quizzes', headers: alice.headers })).json<
        QuizSummary[]
      >();
      expect(mine.find((q) => q.id === pub.id)?.playCount).toBe(1);

      // Back to private → gone from the library.
      await app.inject({
        method: 'PUT',
        url: `/api/quizzes/${pub2.id}`,
        headers: alice.headers,
        payload: { ...quizInput, title: 'Géo', visibility: 'PRIVATE' },
      });
      expect((await library(bob.headers)).map((q) => q.id)).toEqual([pub.id]);
    });

    it('copies a public quiz as a private quiz of the current host', async () => {
      const alice = await register('alice@test.fr');
      const bob = await register('bob@test.fr');
      const pub = await createQuiz(alice.headers, { title: 'Histoire', visibility: 'PUBLIC' });
      const priv = await createQuiz(alice.headers, { title: 'Secret' });

      const res = await app.inject({
        method: 'POST',
        url: `/api/library/${pub.id}/copy`,
        headers: bob.headers,
      });
      expect(res.statusCode).toBe(201);
      const copy = res.json<QuizDetail>();
      expect(copy).toMatchObject({ title: 'Histoire (copie)', visibility: 'PRIVATE' });
      expect(copy.id).not.toBe(pub.id);
      expect(copy.questions).toEqual(pub.questions);
      // Bob owns the copy: he can read and edit it.
      const bobs = (await app.inject({ url: '/api/quizzes', headers: bob.headers })).json();
      expect(bobs).toMatchObject([{ id: copy.id }]);
      const edit = await app.inject({
        method: 'PUT',
        url: `/api/quizzes/${copy.id}`,
        headers: bob.headers,
        payload: { ...quizInput, title: 'Ma version' },
      });
      expect(edit.statusCode).toBe(200);

      const copyPrivate = await app.inject({
        method: 'POST',
        url: `/api/library/${priv.id}/copy`,
        headers: bob.headers,
      });
      expect(copyPrivate.statusCode).toBe(404);
      const anonymous = await app.inject({ method: 'POST', url: `/api/library/${pub.id}/copy` });
      expect(anonymous.statusCode).toBe(401);
    });

    it('only the owner can read, edit or delete a public quiz', async () => {
      const alice = await register('alice@test.fr');
      const bob = await register('bob@test.fr');
      const pub = await createQuiz(alice.headers, { visibility: 'PUBLIC' });
      const h = bob.headers;
      expect((await app.inject({ url: `/api/quizzes/${pub.id}`, headers: h })).statusCode).toBe(
        404,
      );
      const put = await app.inject({
        method: 'PUT',
        url: `/api/quizzes/${pub.id}`,
        headers: h,
        payload: { ...quizInput, title: 'Piraté' },
      });
      expect(put.statusCode).toBe(404);
      const del = await app.inject({ method: 'DELETE', url: `/api/quizzes/${pub.id}`, headers: h });
      expect(del.statusCode).toBe(404);
      const dup = await app.inject({
        method: 'POST',
        url: `/api/quizzes/${pub.id}/duplicate`,
        headers: h,
      });
      expect(dup.statusCode).toBe(404);
      const still = await app.inject({ url: `/api/quizzes/${pub.id}`, headers: alice.headers });
      expect(still.json()).toMatchObject({ title: quizInput.title });
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
          questions: {
            create: [
              {
                index: 1,
                text: 'Q2',
                choices: ['Vrai', 'Faux'],
                correctIndexes: [1],
                distribution: [1, 0],
                playerCount: 2,
                correctCount: 0,
              },
              {
                index: 0,
                text: 'Q1',
                choices: ['A', 'B', 'C'],
                correctIndexes: [0, 2],
                distribution: [1, 0, 1],
                playerCount: 2,
                correctCount: 2,
              },
            ],
          },
        },
      });

      const list = await app.inject({ url: '/api/games', headers });
      expect(list.json()).toMatchObject([
        { id: game.id, playerCount: 2, quizId: null, winner: '=cmd' },
      ]);

      const report = await app.inject({ url: `/api/games/${game.id}`, headers });
      expect(report.json().results.map((r: { nickname: string }) => r.nickname)).toEqual([
        '=cmd',
        'Zoé',
      ]);
      // Rows saved before question types: MCQ, answers counted from the distribution.
      expect(report.json().questions).toEqual([
        {
          index: 0,
          type: 'MCQ',
          text: 'Q1',
          choices: ['A', 'B', 'C'],
          correctIndexes: [0, 2],
          distribution: [1, 0, 1],
          playerCount: 2,
          correctCount: 2,
          answerCount: 2,
          details: {},
        },
        expect.objectContaining({ index: 1, correctCount: 0 }),
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
      // Stored in the database, not in the upload dir.
      const name = new URL(url).pathname.split('/').pop()!;
      expect(await prisma.media.findUnique({ where: { name } })).toMatchObject({
        size: png.length,
      });
      expect(readdirSync(uploadDir)).toEqual([]);
    });

    it('stores a sound up to 10 MB, rejects non-audio and bigger files', async () => {
      const { headers } = await register();
      const post = (content: Buffer, filename: string) => {
        const body = multipart(content, filename);
        return app.inject({
          method: 'POST',
          url: '/api/uploads/audio',
          payload: body.payload,
          headers: { ...headers, ...body.headers },
        });
      };
      // 6 MB: above the image limit, below the audio one.
      const mp3 = Buffer.concat([Buffer.from('494433040000', 'hex'), Buffer.alloc(6e6)]);
      const ok = await post(mp3, 'clip.mp3');
      expect(ok.statusCode).toBe(201);
      const { url } = ok.json<{ url: string }>();
      expect(url).toMatch(/^http:\/\/cdn\.test\/uploads\/[\w-]+\.mp3$/);
      const served = await app.inject({ url: new URL(url).pathname });
      expect(served.statusCode).toBe(200);
      expect(served.rawPayload.length).toBe(mp3.length);

      const png = await post(Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'), 'a.mp3');
      expect(png.statusCode).toBe(415);
      const big = await post(
        Buffer.concat([Buffer.from('OggS', 'latin1'), Buffer.alloc(11 * 1024 * 1024)]),
        'big.ogg',
      );
      expect(big.statusCode).toBe(413);
      // The image route keeps its 5 MB limit.
      const bigImage = multipart(
        Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(6e6)]),
        'big.png',
      );
      const img = await app.inject({
        method: 'POST',
        url: '/api/uploads/image',
        payload: bigImage.payload,
        headers: { ...headers, ...bigImage.headers },
      });
      expect(img.statusCode).toBe(413);
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
