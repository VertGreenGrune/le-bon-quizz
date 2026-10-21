import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  DEMO_QUIZ,
  choiceTexts,
  correctChoiceIndexes,
  isChoiceQuestion,
  type GameReport,
  type GameSummary,
  type Question,
  type Quiz,
  type RevealDetails,
} from '@lbq/shared';
import { registerApi } from '../api/index.js';
import { createQuiz } from '../api/quizzes.service.js';
import { createSession } from '../auth/session.js';
import { createPrisma, type PrismaClient } from '../db.js';
import { GameError } from './errors.js';
import { Game, type GameTransport } from './Game.js';
import { rightAnswer } from './testing.js';
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

/** Questions Alice can get right (every one but the poll). */
const SCORED = DEMO_QUIZ.questions.filter((q) => q.type !== 'POLL').length;

/** What the reveal of `q` contains when only Alice answered, right. */
function aliceOnlyDetails(q: Question): RevealDetails {
  if (q.type === 'TYPE_ANSWER')
    return {
      acceptedAnswers: q.acceptedAnswers,
      topAnswers: [{ text: q.acceptedAnswers[0]!, count: 1, correct: true }],
    };
  if (q.type === 'SLIDER')
    return {
      slider: q.slider,
      guesses: [q.slider.correct],
      closest: { nickname: 'Alice', value: q.slider.correct, avatar: 'batman' },
    };
  return {};
}

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toBeInstanceOf(GameError);
  await expect(p).rejects.toMatchObject({ code });
}

/** A finished game: Alice answers everything right, Bob never answers. */
function playedGame(quiz: Quiz = DEMO_QUIZ): Game {
  const game = new Game('123456', quiz, noop);
  const alice = game.join('Alice', 's1', 'batman');
  game.join('Bob', 's2', 'robin');
  game.start();
  quiz.questions.forEach((q, i) => {
    game.next(); // QUESTION_INTRO → ANSWERING
    game.answer(alice.id, i, rightAnswer(q));
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
    expect(r.results.map((x) => [x.nickname, x.avatar, x.rank, x.correctCount])).toEqual([
      ['Alice', 'batman', 1, SCORED],
      ['Bob', 'robin', 2, 0],
    ]);
    // One entry per question: only Alice (of 2 players) answered, always right.
    expect(r.questions).toHaveLength(DEMO_QUIZ.questions.length);
    DEMO_QUIZ.questions.forEach((q, i) => {
      const answer = rightAnswer(q);
      const picked = 'choiceIndex' in answer ? answer.choiceIndex : -1;
      expect(r.questions[i]).toEqual({
        index: i,
        type: q.type,
        text: q.text,
        choices: choiceTexts(q),
        correctIndexes: correctChoiceIndexes(q),
        distribution: isChoiceQuestion(q) ? q.choices.map((_, j) => (j === picked ? 1 : 0)) : [],
        playerCount: 2,
        correctCount: q.type === 'POLL' ? 0 : 1,
        answerCount: 1,
        details: aliceOnlyDetails(q),
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
    // Every question type survives the round trip (choices, accepted answers, slider…).
    expect(loaded.quiz.questions).toEqual(DEMO_QUIZ.questions);
    expect(loaded.quiz).not.toHaveProperty('createdAt');

    await expectCode(persistence.loadQuiz(q.id, other.id), 'QUIZ_NOT_FOUND');
    await expectCode(persistence.loadQuiz(q.id, null), 'UNAUTHORIZED');
    expect(await persistence.loadQuiz('demo', null)).toEqual({ quiz: DEMO_QUIZ, dbQuizId: null });

    // The seeded `demo` row is used for its owner only; others get the built-in demo.
    await createQuiz(prisma, owner.id, demoInput, 'demo');
    expect((await persistence.loadQuiz('demo', other.id)).dbQuizId).toBeNull();
    expect((await persistence.loadQuiz('demo', owner.id)).dbQuizId).toBe('demo');
  });

  it("launches the host's own quizzes and public ones, not another host's private one", async () => {
    const owner = await user('owner@test.fr');
    const other = await user('other@test.fr');
    const pub = await createQuiz(prisma, owner.id, { ...demoInput, visibility: 'PUBLIC' });
    const priv = await createQuiz(prisma, owner.id, { ...demoInput, visibility: 'PRIVATE' });

    expect((await persistence.loadQuiz(pub.id, owner.id)).dbQuizId).toBe(pub.id);
    expect((await persistence.loadQuiz(priv.id, owner.id)).dbQuizId).toBe(priv.id);
    const loaded = await persistence.loadQuiz(pub.id, other.id);
    expect(loaded.dbQuizId).toBe(pub.id);
    expect(loaded.quiz.questions).toEqual(DEMO_QUIZ.questions);
    expect(loaded.quiz).not.toHaveProperty('visibility');
    await expectCode(persistence.loadQuiz(priv.id, other.id), 'QUIZ_NOT_FOUND');
    // Public quizzes still need a logged-in host.
    await expectCode(persistence.loadQuiz(pub.id, null), 'UNAUTHORIZED');

    // The seeded public `demo` row is played (and counted) for every logged-in host.
    await createQuiz(prisma, owner.id, { ...demoInput, visibility: 'PUBLIC' }, 'demo');
    expect((await persistence.loadQuiz('demo', other.id)).dbQuizId).toBe('demo');
    expect(await persistence.loadQuiz('demo', null)).toEqual({ quiz: DEMO_QUIZ, dbQuizId: null });
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
      expect.objectContaining({
        rank: 1,
        nickname: 'Alice',
        avatar: 'batman',
        correctCount: SCORED,
      }),
      { rank: 2, nickname: 'Bob', avatar: 'robin', score: 0, correctCount: 0, teamId: null },
    ]);
    expect(list[0]!.winner).toBe('Alice');
    // Games saved before avatars (null) or with an unknown id: no avatar in the report.
    await prisma.playerResult.updateMany({ where: { nickname: 'Bob' }, data: { avatar: null } });
    await prisma.playerResult.updateMany({ where: { nickname: 'Alice' }, data: { avatar: 'x' } });
    const old = await app.inject({ url: `/api/games/${list[0]!.id}`, headers });
    expect(old.json<GameReport>().results.map((r) => r.avatar)).toEqual([null, null]);
    const questions = res.json<GameReport>().questions;
    expect(questions.map((q) => [q.index, q.type, q.correctCount, q.answerCount])).toEqual(
      DEMO_QUIZ.questions.map((q, i) => [i, q.type, q.type === 'POLL' ? 0 : 1, 1]),
    );
    // Type-specific details survive the JSON column.
    DEMO_QUIZ.questions.forEach((q, i) =>
      expect(questions[i]!.details).toEqual(aliceOnlyDetails(q)),
    );
  });

  it('saves a team game: mode, team of each player, team ranking, CSV team column', async () => {
    const host = await user('host@test.fr');
    const headers = { authorization: `Bearer ${await createSession(prisma, host.id)}` };
    const game = new Game('222222', DEMO_QUIZ, noop, {}, { mode: 'teams', teamCount: 3 });
    const alice = game.join('Alice', 's1');
    const bob = game.join('Bob', 's2');
    const chloe = game.join('Chloé', 's3');
    game.setTeam(alice.id, 2);
    game.setTeam(bob.id, 0);
    game.setTeam(chloe.id, 0);
    game.start();
    DEMO_QUIZ.questions.forEach((q, i) => {
      game.next(); // → ANSWERING
      game.answer(alice.id, i, rightAnswer(q));
      game.next(); // → REVEAL (Bob and Chloé never answer)
      game.next();
      game.next();
    });
    game.end();
    game.dispose();
    await persistence.saveGame(gameRecord(game, host.id, null)!);

    const [summary] = (await app.inject({ url: '/api/games', headers })).json<GameSummary[]>();
    expect(summary).toMatchObject({ mode: 'teams', winner: 'Alice', playerCount: 3 });
    const report = (
      await app.inject({ url: `/api/games/${summary!.id}`, headers })
    ).json<GameReport>();
    // Bleue had no players: dropped at the start.
    expect(report.teams).toEqual([
      { teamId: 2, name: 'Équipe Jaune', score: alice.totalScore, playerCount: 1, rank: 1 },
      { teamId: 0, name: 'Équipe Rouge', score: 0, playerCount: 2, rank: 2 },
    ]);
    expect(report.results.map((r) => [r.nickname, r.teamId])).toEqual([
      ['Alice', 2],
      ['Bob', 0],
      ['Chloé', 0],
    ]);
    const csv = await app.inject({ url: `/api/games/${summary!.id}/export.csv`, headers });
    expect(csv.body).toContain('rank,nickname,score,correctCount,team\r\n');
    expect(csv.body).toContain(`1,Alice,${alice.totalScore},${SCORED},Équipe Jaune\r\n`);
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
