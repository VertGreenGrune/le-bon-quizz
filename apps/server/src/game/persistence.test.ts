import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEMO_QUIZ, type GameReport, type GameSummary, type Quiz } from '@lbq/shared';
import { registerApi } from '../api/index.js';
import { createQuiz } from '../api/quizzes.service.js';
import { createSession } from '../auth/session.js';
import { createPrisma, type PrismaClient } from '../db.js';
import { GameError } from './errors.js';
import { Game, type GameTransport } from './Game.js';
import {
  createPrismaPersistence,
  demoOnlyPersistence,
  gameRecord,
  type GamePersistence,
} from './persistence.js';

const noop: GameTransport = {
  toAll: () => {},
  toHost: () => {},
  toSocket: () => {},
  detachSocket: () => {},
};

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toBeInstanceOf(GameError);
  await expect(p).rejects.toMatchObject({ code });
}

/** A finished game: Alice answers everything right, Bob never answers. */
function playedGame(quiz: Quiz = DEMO_QUIZ): Game {
  const game = new Game('123456', quiz, noop);
  const alice = game.join('Alice', 's1');
  game.join('Bob', 's2');
  game.start();
  quiz.questions.forEach((q, i) => {
    game.next(); // QUESTION_INTRO → ANSWERING
    game.answer(
      alice.id,
      i,
      q.choices.findIndex((c) => c.isCorrect),
    );
    game.next(); // ANSWERING → REVEAL (Bob has not answered)
    game.next(); // → LEADERBOARD
    game.next(); // → next question / PODIUM
  });
  game.end();
  game.dispose();
  return game;
}

describe('gameRecord', () => {
  it('is null for anonymous hosts and games that never started', () => {
    expect(gameRecord(playedGame(), null, null)).toBeNull();
    const lobby = new Game('111111', DEMO_QUIZ, noop);
    lobby.end();
    expect(gameRecord(lobby, 'host', null)).toBeNull();
  });

  it('snapshots title, pin, times and standings', () => {
    const r = gameRecord(playedGame(), 'host', 'demo')!;
    expect(r).toMatchObject({ hostId: 'host', quizId: 'demo', quizTitle: DEMO_QUIZ.title });
    expect(r.startedAt.getTime()).toBeLessThanOrEqual(r.endedAt.getTime());
    expect(r.results.map((x) => [x.nickname, x.rank, x.correctCount])).toEqual([
      ['Alice', 1, DEMO_QUIZ.questions.length],
      ['Bob', 2, 0],
    ]);
    // One entry per question: only Alice (of 2 players) answered, always right.
    expect(r.questions).toHaveLength(DEMO_QUIZ.questions.length);
    DEMO_QUIZ.questions.forEach((q, i) => {
      const correct = q.choices.findIndex((c) => c.isCorrect);
      expect(r.questions[i]).toEqual({
        index: i,
        text: q.text,
        choices: q.choices.map((c) => c.text),
        correctIndexes: q.choices.flatMap((c, j) => (c.isCorrect ? [j] : [])),
        distribution: q.choices.map((_, j) => (j === correct ? 1 : 0)),
        playerCount: 2,
        correctCount: 1,
      });
    });
  });
});

describe('demoOnlyPersistence', () => {
  it('serves the demo quiz to anyone and nothing else', async () => {
    expect(await demoOnlyPersistence.loadQuiz('demo', null)).toEqual({
      quiz: DEMO_QUIZ,
      dbQuizId: null,
    });
    await expectCode(demoOnlyPersistence.loadQuiz('other', null), 'UNAUTHORIZED');
    await expectCode(demoOnlyPersistence.loadQuiz('other', 'host'), 'QUIZ_NOT_FOUND');
  });
});

/** Needs Postgres, like `api/api.test.ts` — the test database is wiped. */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)('Prisma persistence (Postgres)', () => {
  let prisma: PrismaClient;
  let persistence: GamePersistence;
  let app: FastifyInstance;
  let uploadDir: string;

  beforeAll(async () => {
    execSync('pnpm exec prisma migrate deploy', {
      cwd: path.resolve(import.meta.dirname, '../..'),
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
      stdio: 'ignore',
    });
    prisma = createPrisma(TEST_DATABASE_URL);
    persistence = createPrismaPersistence(prisma);
    uploadDir = mkdtempSync(path.join(tmpdir(), 'lbq-uploads-'));
    app = Fastify();
    await registerApi(app, { prisma, uploadDir });
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

  const user = (email: string) =>
    prisma.user.create({ data: { email, name: email, passwordHash: 'x' } });
  const { id: _demoId, ...demoInput } = DEMO_QUIZ;

  it('authenticates a session token', async () => {
    const u = await user('a@test.fr');
    expect(await persistence.authenticate(await createSession(prisma, u.id))).toBe(u.id);
    expect(await persistence.authenticate('bogus')).toBeNull();
  });

  it('loads only quizzes owned by the host; demo works without login', async () => {
    const owner = await user('owner@test.fr');
    const other = await user('other@test.fr');
    const q = await createQuiz(prisma, owner.id, { ...demoInput, title: 'Mon quiz' });

    const loaded = await persistence.loadQuiz(q.id, owner.id);
    expect(loaded.dbQuizId).toBe(q.id);
    expect(loaded.quiz).toMatchObject({ id: q.id, title: 'Mon quiz' });
    expect(loaded.quiz.questions).toHaveLength(DEMO_QUIZ.questions.length);
    expect(loaded.quiz).not.toHaveProperty('createdAt');

    await expectCode(persistence.loadQuiz(q.id, other.id), 'QUIZ_NOT_FOUND');
    await expectCode(persistence.loadQuiz(q.id, null), 'UNAUTHORIZED');
    expect(await persistence.loadQuiz('demo', null)).toEqual({ quiz: DEMO_QUIZ, dbQuizId: null });

    // The seeded `demo` row is used for its owner only; others get the built-in demo.
    await createQuiz(prisma, owner.id, demoInput, 'demo');
    expect((await persistence.loadQuiz('demo', other.id)).dbQuizId).toBeNull();
    expect((await persistence.loadQuiz('demo', owner.id)).dbQuizId).toBe('demo');
  });

  it('saves a finished game, returned by the history/report endpoints', async () => {
    const host = await user('host@test.fr');
    const headers = { authorization: `Bearer ${await createSession(prisma, host.id)}` };
    const q = await createQuiz(prisma, host.id, demoInput);
    const { quiz, dbQuizId } = await persistence.loadQuiz(q.id, host.id);
    await persistence.saveGame(gameRecord(playedGame(quiz), host.id, dbQuizId)!);

    const list = (await app.inject({ url: '/api/games', headers })).json<GameSummary[]>();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ quizId: q.id, quizTitle: DEMO_QUIZ.title, playerCount: 2 });
    expect(list[0]!.endedAt).not.toBeNull();

    const res = await app.inject({ url: `/api/games/${list[0]!.id}`, headers });
    expect(res.json<GameReport>().results).toEqual([
      expect.objectContaining({ rank: 1, nickname: 'Alice', correctCount: 4 }),
      { rank: 2, nickname: 'Bob', score: 0, correctCount: 0 },
    ]);
    expect(list[0]!.winner).toBe('Alice');
    const questions = res.json<GameReport>().questions;
    expect(questions.map((q) => [q.index, q.correctCount, q.playerCount])).toEqual(
      DEMO_QUIZ.questions.map((_, i) => [i, 1, 2]),
    );
  });

  it('keeps the history when the quiz was deleted during the game', async () => {
    const host = await user('host@test.fr');
    const q = await createQuiz(prisma, host.id, demoInput);
    const { quiz, dbQuizId } = await persistence.loadQuiz(q.id, host.id);
    await prisma.quiz.delete({ where: { id: q.id } });
    await persistence.saveGame(gameRecord(playedGame(quiz), host.id, dbQuizId)!);
    const saved = await prisma.gameSession.findFirstOrThrow({ include: { results: true } });
    expect(saved.quizId).toBeNull();
    expect(saved.results).toHaveLength(2);
  });
});
