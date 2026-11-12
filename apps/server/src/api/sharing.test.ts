/**
 * T45 — sharing a quiz with another host (+ co-editing). Postgres integration tests, skipped
 * unless TEST_DATABASE_URL is set (the database is migrated and wiped, like api.test.ts).
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CLASSIC_DEMO_QUIZ,
  type ApiErrorBody,
  type AuthResponse,
  type QuizDetail,
  type QuizInput,
  type QuizShareInfo,
  type SharedQuizSummary,
} from '@lbq/shared';
import { createPrisma, type PrismaClient } from '../db.js';
import { registerApi } from './index.js';
import { getPlayableQuiz } from './quizzes.service.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

const { id: _demoId, ...demoInput } = CLASSIC_DEMO_QUIZ;
const quizInput: QuizInput = demoInput;

describe.skipIf(!TEST_DATABASE_URL)('Quiz sharing (Postgres)', () => {
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

  type Host = AuthResponse & { headers: Record<string, string> };
  async function register(email: string, name: string): Promise<Host> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email, name, password: 'password123' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<AuthResponse>();
    return { ...body, headers: { authorization: `Bearer ${body.token}` } };
  }

  const call = (
    host: Host,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: string,
    payload?: object,
  ) => app.inject({ method, url: `/api${url}`, headers: host.headers, payload });

  async function setup() {
    const alice = await register('alice@test.fr', 'Alice');
    const bob = await register('bob@test.fr', 'Bob');
    const carol = await register('carol@test.fr', 'Carol');
    const quiz = (await call(alice, 'POST', '/quizzes', quizInput)).json<QuizDetail>();
    return { alice, bob, carol, quiz };
  }

  it('the owner sees access "owner" and their own name', async () => {
    const { quiz } = await setup();
    expect(quiz).toMatchObject({ access: 'owner', ownerName: 'Alice' });
  });

  it('shares by e-mail (case-insensitive), lists, changes the role, unknown e-mail → 404', async () => {
    const { alice, bob, quiz } = await setup();
    const res = await call(alice, 'POST', `/quizzes/${quiz.id}/shares`, { email: ' BOB@test.fr ' });
    expect(res.statusCode).toBe(201);
    expect(res.json<QuizShareInfo>()).toMatchObject({
      user: { id: bob.user.id, name: 'Bob', email: 'bob@test.fr' },
      role: 'viewer',
    });

    const again = await call(alice, 'POST', `/quizzes/${quiz.id}/shares`, {
      email: 'bob@test.fr',
      role: 'editor',
    });
    expect(again.json<QuizShareInfo>().role).toBe('editor');
    const list = (await call(alice, 'GET', `/quizzes/${quiz.id}/shares`)).json<QuizShareInfo[]>();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ role: 'editor', user: { email: 'bob@test.fr' } });

    const unknown = await call(alice, 'POST', `/quizzes/${quiz.id}/shares`, { email: 'x@test.fr' });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json<ApiErrorBody>().error.code).toBe('USER_NOT_FOUND');

    const self = await call(alice, 'POST', `/quizzes/${quiz.id}/shares`, {
      email: 'alice@test.fr',
    });
    expect(self.statusCode).toBe(400);
  });

  it('only the owner manages shares (others get 404)', async () => {
    const { alice, bob, carol, quiz } = await setup();
    await call(alice, 'POST', `/quizzes/${quiz.id}/shares`, {
      email: 'bob@test.fr',
      role: 'editor',
    });
    expect((await call(bob, 'GET', `/quizzes/${quiz.id}/shares`)).statusCode).toBe(404);
    const reshare = await call(bob, 'POST', `/quizzes/${quiz.id}/shares`, {
      email: 'carol@test.fr',
    });
    expect(reshare.statusCode).toBe(404);
    const kick = await call(carol, 'DELETE', `/quizzes/${quiz.id}/shares/${bob.user.id}`);
    expect(kick.statusCode).toBe(404);
  });

  it('a viewer can see, copy and launch, but not edit nor delete', async () => {
    const { alice, bob, quiz } = await setup();
    await call(alice, 'POST', `/quizzes/${quiz.id}/shares`, { email: 'bob@test.fr' });

    const seen = (await call(bob, 'GET', `/quizzes/${quiz.id}`)).json<QuizDetail>();
    expect(seen).toMatchObject({ id: quiz.id, access: 'viewer', ownerName: 'Alice' });
    expect(seen.questions).toHaveLength(quizInput.questions.length);

    expect((await call(bob, 'PUT', `/quizzes/${quiz.id}`, quizInput)).statusCode).toBe(404);
    expect((await call(bob, 'DELETE', `/quizzes/${quiz.id}`)).statusCode).toBe(404);

    const copy = await call(bob, 'POST', `/quizzes/${quiz.id}/duplicate`);
    expect(copy.statusCode).toBe(201);
    expect(copy.json<QuizDetail>()).toMatchObject({
      access: 'owner',
      ownerName: 'Bob',
      visibility: 'PRIVATE',
      title: `${quizInput.title} (copie)`,
    });

    expect(await getPlayableQuiz(prisma, quiz.id, bob.user.id)).toMatchObject({ id: quiz.id });
  });

  it('an editor can edit (not the visibility), never delete', async () => {
    const { alice, bob, quiz } = await setup();
    await call(alice, 'POST', `/quizzes/${quiz.id}/shares`, {
      email: 'bob@test.fr',
      role: 'editor',
    });

    const res = await call(bob, 'PUT', `/quizzes/${quiz.id}`, {
      ...quizInput,
      title: 'Modifié par Bob',
      theme: 'halloween',
      visibility: 'PUBLIC',
      questions: quizInput.questions.slice(0, 2),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<QuizDetail>()).toMatchObject({
      title: 'Modifié par Bob',
      theme: 'halloween',
      visibility: 'PRIVATE',
      access: 'editor',
      ownerName: 'Alice',
    });
    const forAlice = (await call(alice, 'GET', `/quizzes/${quiz.id}`)).json<QuizDetail>();
    expect(forAlice).toMatchObject({ title: 'Modifié par Bob', access: 'owner' });
    expect(forAlice.questions).toHaveLength(2);

    expect((await call(bob, 'DELETE', `/quizzes/${quiz.id}`)).statusCode).toBe(404);
  });

  it('a stale expectedUpdatedAt → 409 QUIZ_CONFLICT; the right one saves', async () => {
    const { alice, bob, quiz } = await setup();
    await call(alice, 'POST', `/quizzes/${quiz.id}/shares`, {
      email: 'bob@test.fr',
      role: 'editor',
    });

    const bobLoaded = quiz.updatedAt;
    const aliceSave = await call(alice, 'PUT', `/quizzes/${quiz.id}`, {
      ...quizInput,
      title: 'Alice',
      expectedUpdatedAt: quiz.updatedAt,
    });
    expect(aliceSave.statusCode).toBe(200);

    const bobSave = await call(bob, 'PUT', `/quizzes/${quiz.id}`, {
      ...quizInput,
      title: 'Bob',
      expectedUpdatedAt: bobLoaded,
    });
    expect(bobSave.statusCode).toBe(409);
    expect(bobSave.json<ApiErrorBody>().error.code).toBe('QUIZ_CONFLICT');
    const kept = (await call(alice, 'GET', `/quizzes/${quiz.id}`)).json<QuizDetail>();
    expect(kept.title).toBe('Alice');

    const retry = await call(bob, 'PUT', `/quizzes/${quiz.id}`, {
      ...quizInput,
      title: 'Bob',
      expectedUpdatedAt: aliceSave.json<QuizDetail>().updatedAt,
    });
    expect(retry.statusCode).toBe(200);
  });

  it('lists the quizzes shared with me; the owner or the shared host can remove a share', async () => {
    const { alice, bob, carol, quiz } = await setup();
    await call(alice, 'POST', `/quizzes/${quiz.id}/shares`, {
      email: 'bob@test.fr',
      role: 'editor',
    });
    await call(alice, 'POST', `/quizzes/${quiz.id}/shares`, { email: 'carol@test.fr' });

    const shared = (await call(bob, 'GET', '/shared-quizzes')).json<SharedQuizSummary[]>();
    expect(shared).toMatchObject([
      {
        id: quiz.id,
        role: 'editor',
        ownerName: 'Alice',
        questionCount: quizInput.questions.length,
      },
    ]);
    expect((await call(alice, 'GET', '/shared-quizzes')).json()).toEqual([]);
    // Shared quizzes stay out of « Mes quiz ».
    expect((await call(bob, 'GET', '/quizzes')).json()).toEqual([]);

    // Bob leaves (« Ne plus voir »), Alice removes Carol.
    expect(
      (await call(bob, 'DELETE', `/quizzes/${quiz.id}/shares/${bob.user.id}`)).statusCode,
    ).toBe(204);
    expect(
      (await call(alice, 'DELETE', `/quizzes/${quiz.id}/shares/${carol.user.id}`)).statusCode,
    ).toBe(204);
    expect((await call(bob, 'GET', `/quizzes/${quiz.id}`)).statusCode).toBe(404);
    expect((await call(carol, 'GET', '/shared-quizzes')).json()).toEqual([]);
    expect(await getPlayableQuiz(prisma, quiz.id, carol.user.id)).toBeNull();
  });

  it('deleting the quiz removes its shares', async () => {
    const { alice, bob, quiz } = await setup();
    await call(alice, 'POST', `/quizzes/${quiz.id}/shares`, { email: 'bob@test.fr' });
    expect((await call(alice, 'DELETE', `/quizzes/${quiz.id}`)).statusCode).toBe(204);
    expect((await call(bob, 'GET', '/shared-quizzes')).json()).toEqual([]);
  });
});
