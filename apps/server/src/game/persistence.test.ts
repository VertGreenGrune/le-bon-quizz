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
  type QuestionPromptPayload,
  type QuestionShowPayload,
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
import { rightAnswer, wrongAnswer } from './testing.js';
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
  const game = new Game('123456', quiz, noop, {}, { mode: 'solo', allAnsweredGraceMs: 0 });
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
    const lobby = new Game('111111', DEMO_QUIZ, noop, {}, { mode: 'solo', allAnsweredGraceMs: 0 });
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
        explanation: null,
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

  it('keeps the « Buzzer » option of a question', async () => {
    const owner = await user('owner@test.fr');
    const [first, ...rest] = demoInput.questions;
    const q = await createQuiz(prisma, owner.id, {
      ...demoInput,
      questions: [{ ...first!, buzzer: true }, ...rest],
    });
    const { quiz } = await persistence.loadQuiz(q.id, owner.id);
    expect(quiz.questions[0]).toMatchObject({ buzzer: true });
    expect(quiz.questions[1]).not.toHaveProperty('buzzer');
  });

  it('keeps the « Enchères » option and its topic (T64)', async () => {
    const owner = await user('owner@test.fr');
    const [first, ...rest] = demoInput.questions;
    const q = await createQuiz(prisma, owner.id, {
      ...demoInput,
      questions: [{ ...first!, auction: true, auctionTopic: ' Cinéma ' }, ...rest],
    });
    const { quiz } = await persistence.loadQuiz(q.id, owner.id);
    expect(quiz.questions[0]).toMatchObject({ auction: true, auctionTopic: 'Cinéma' });
    expect(quiz.questions[1]).not.toHaveProperty('auction');
  });

  it('keeps the explanations, saves them with the « select all » counts in the report', async () => {
    const host = await user('host@test.fr');
    const headers = { authorization: `Bearer ${await createSession(prisma, host.id)}` };
    const [first, ...rest] = demoInput.questions;
    const multiple: Question = {
      text: 'Lesquelles sont des couleurs du drapeau français ?',
      type: 'MCQ',
      timeLimitSec: 20,
      basePoints: 1000,
      choices: [
        { text: 'Bleu', isCorrect: true },
        { text: 'Vert', isCorrect: false },
        { text: 'Rouge', isCorrect: true },
      ],
      explanation: '',
    };
    const created = await createQuiz(prisma, host.id, {
      ...demoInput,
      questions: [
        { ...first!, explanation: '  Paris est la capitale depuis 987.  ' },
        multiple,
        ...rest,
      ],
    });
    const { quiz, dbQuizId } = await persistence.loadQuiz(created.id, host.id);
    expect(quiz.questions[0]).toMatchObject({ explanation: 'Paris est la capitale depuis 987.' });
    // Empty = none.
    expect(quiz.questions[1]).not.toHaveProperty('explanation');
    await persistence.saveGame(gameRecord(playedGame(quiz), host.id, dbQuizId)!);

    const [game] = (await app.inject({ url: '/api/games', headers })).json<GameSummary[]>();
    const report = (
      await app.inject({ url: `/api/games/${game!.id}`, headers })
    ).json<GameReport>();
    expect(report.questions[0]!.explanation).toBe('Paris est la capitale depuis 987.');
    expect(report.questions[1]).not.toHaveProperty('explanation');
    // Alice ticked both right choices: each one counts in its bar.
    expect(report.questions[1]).toMatchObject({
      correctCount: 1,
      distribution: [1, 0, 1],
      details: { multiple: { allFound: 1 } },
    });
  });

  it('saves a question fixed with « ✅ Accepter » (T44) in the report', async () => {
    const host = await user('host@test.fr');
    const headers = { authorization: `Bearer ${await createSession(prisma, host.id)}` };
    const wrongKey: Question = {
      text: 'Capitale de l’Australie ?',
      type: 'MCQ',
      timeLimitSec: 20,
      basePoints: 1000,
      choices: [
        { text: 'Sydney', isCorrect: true },
        { text: 'Canberra', isCorrect: false },
      ],
    };
    const quiz: Quiz = { id: 'fix', title: 'Corrigé', questions: [wrongKey] };
    const game = new Game('123456', quiz, noop, {}, { mode: 'solo', allAnsweredGraceMs: 0 });
    const alice = game.join('Alice', 's1', 'batman');
    game.start();
    game.next();
    game.answer(alice.id, 0, { choiceIndex: 1 });
    game.accept(0, { choiceIndex: 1 });
    game.end();
    game.dispose();
    await persistence.saveGame(gameRecord(game, host.id, null)!);

    const [summary] = (await app.inject({ url: '/api/games', headers })).json<GameSummary[]>();
    const report = (
      await app.inject({ url: `/api/games/${summary!.id}`, headers })
    ).json<GameReport>();
    expect(report.questions[0]).toMatchObject({
      correctIndexes: [0, 1],
      correctCount: 1,
      details: { accepted: { choiceIndexes: [1] } },
    });
    expect(report.results[0]).toMatchObject({ nickname: 'Alice', correctCount: 1, rank: 1 });
    expect(report.results[0]!.score).toBeGreaterThan(0);
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
    const game = new Game(
      '222222',
      DEMO_QUIZ,
      noop,
      {},
      { mode: 'teams', allAnsweredGraceMs: 0, teamCount: 3 },
    );
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

  it('saves the jokers played by each player: report, summary flag, CSV column', async () => {
    const host = await user('host@test.fr');
    const headers = { authorization: `Bearer ${await createSession(prisma, host.id)}` };
    const game = new Game(
      '333333',
      DEMO_QUIZ,
      noop,
      {},
      { mode: 'solo', allAnsweredGraceMs: 0, jokers: true },
    );
    const alice = game.join('Alice', 's1');
    game.join('Bob', 's2');
    game.start();
    game.jokers!.setHand(alice.id, ['double', 'shield']);
    game.useJoker(alice.id, 0, 'double');
    game.next(); // → ANSWERING
    game.answer(alice.id, 0, rightAnswer(DEMO_QUIZ.questions[0]!));
    game.next();
    game.end();
    game.dispose();
    await persistence.saveGame(gameRecord(game, host.id, null)!);

    const [summary] = (await app.inject({ url: '/api/games', headers })).json<GameSummary[]>();
    expect(summary!.jokers).toBe(true);
    const report = (
      await app.inject({ url: `/api/games/${summary!.id}`, headers })
    ).json<GameReport>();
    expect(report.results.map((r) => [r.nickname, r.jokersUsed])).toEqual([
      ['Alice', ['double']],
      ['Bob', undefined],
    ]);
    const csv = await app.inject({ url: `/api/games/${summary!.id}/export.csv`, headers });
    expect(csv.body).toContain('rank,nickname,score,correctCount,jokers\r\n');
    expect(csv.body).toContain(',Double ou rien\r\n');
  });

  it('saves a « Survie » game: hearts, ghosts, survivor ranking, CSV column', async () => {
    const host = await user('host@test.fr');
    const headers = { authorization: `Bearer ${await createSession(prisma, host.id)}` };
    const game = new Game(
      '444444',
      DEMO_QUIZ,
      noop,
      {},
      { mode: 'survival', allAnsweredGraceMs: 0, hearts: 1 },
    );
    const alice = game.join('Alice', 's1');
    const bob = game.join('Bob', 's2');
    game.start();
    game.next(); // → ANSWERING
    game.answer(alice.id, 0, wrongAnswer(DEMO_QUIZ.questions[0]!));
    game.answer(bob.id, 0, wrongAnswer(DEMO_QUIZ.questions[0]!)); // → REVEAL
    game.next();
    game.next(); // nobody alive: podium
    expect(game.phase).toBe('PODIUM');
    game.end();
    game.dispose();
    await persistence.saveGame(gameRecord(game, host.id, null)!);

    const [summary] = (await app.inject({ url: '/api/games', headers })).json<GameSummary[]>();
    expect(summary).toMatchObject({ mode: 'survival', hearts: 1 });
    const report = (
      await app.inject({ url: `/api/games/${summary!.id}`, headers })
    ).json<GameReport>();
    expect(report.results.map((r) => [r.nickname, r.rank, r.survival])).toEqual([
      ['Alice', 1, { hearts: 0, eliminatedAt: 0 }],
      ['Bob', 1, { hearts: 0, eliminatedAt: 0 }],
    ]);
    const csv = await app.inject({ url: `/api/games/${summary!.id}/export.csv`, headers });
    expect(csv.body).toContain('rank,nickname,score,correctCount,survival\r\n');
    expect(csv.body).toContain(',fantôme (question 1)\r\n');
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
  it('keeps the ORDER / PIN / WHO_OF_US / WORD_CLOUD settings and saves their reveal details', async () => {
    const host = await user('host@test.fr');
    const headers = { authorization: `Bearer ${await createSession(prisma, host.id)}` };
    const imageUrl = 'http://localhost:3001/uploads/carte.png';
    const base = { timeLimitSec: 20, basePoints: 1000 as const };
    const questions: Question[] = [
      { ...base, text: 'Ordre', type: 'ORDER', items: ['Un', 'Deux', 'Trois'] },
      { ...base, text: 'Point', type: 'PIN', imageUrl, zone: { x: 0.25, y: 0.75, radius: 0.05 } },
      { ...base, basePoints: 0, text: 'Qui ?', type: 'WHO_OF_US', majorityBonus: true },
      { ...base, basePoints: 0, text: 'Un mot', type: 'WORD_CLOUD' },
    ];
    const q = await createQuiz(prisma, host.id, { title: 'Nouveaux types', questions });
    const { quiz, dbQuizId } = await persistence.loadQuiz(q.id, host.id);
    expect(quiz.questions).toEqual(questions);

    let prompt: QuestionPromptPayload | undefined;
    const game = new Game(
      '123456',
      quiz,
      {
        ...noop,
        toSocket: (_to, event, payload) => {
          if (event === 'question:prompt') prompt = payload as QuestionPromptPayload;
        },
      },
      {},
      { mode: 'solo', allAnsweredGraceMs: 0 },
    );
    const alice = game.join('Alice', 's1', 'batman');
    game.join('Bob', 's2', 'robin');
    game.start();
    const answers = [
      () => ({ order: ['Un', 'Deux', 'Trois'].map((item) => prompt!.items!.indexOf(item)) }),
      () => ({ point: { x: 0.25, y: 0.75 } }),
      () => ({ playerId: alice.id }),
      () => ({ text: 'Super' }),
    ];
    answers.forEach((answer, i) => {
      game.next();
      game.answer(alice.id, i, answer());
      game.next();
      game.next();
      game.next();
    });
    game.end();
    game.dispose();
    await persistence.saveGame(gameRecord(game, host.id, dbQuizId)!);

    const [summary] = (await app.inject({ url: '/api/games', headers })).json<GameSummary[]>();
    const report = (
      await app.inject({ url: `/api/games/${summary!.id}`, headers })
    ).json<GameReport>();
    expect(report.questions.map((r) => [r.type, r.correctCount, r.answerCount, r.details])).toEqual(
      [
        [
          'ORDER',
          1,
          1,
          {
            order: {
              items: ['Un', 'Deux', 'Trois'],
              placed: [1, 1, 1],
              // T50: each player's list is saved for the report.
              answers: [
                expect.objectContaining({ order: [0, 1, 2], placed: 3 }),
                expect.objectContaining({ nickname: 'Bob', order: [], placed: 0 }), // no answer
              ],
            },
          },
        ],
        [
          'PIN',
          1,
          1,
          {
            pin: {
              imageUrl,
              zone: { x: 0.25, y: 0.75, radius: 0.05 },
              pins: [{ x: 0.25, y: 0.75, nickname: 'Alice', avatar: 'batman', correct: true }],
            },
          },
        ],
        [
          'WHO_OF_US',
          0,
          1,
          { votes: [{ nickname: 'Alice', avatar: 'batman', count: 1 }], majorityBonus: true },
        ],
        ['WORD_CLOUD', 0, 1, { words: [{ text: 'Super', count: 1 }] }],
      ],
    );
    // Order + pin right (1000 each, +100 streak bonus) + majority bonus (200).
    expect(report.results[0]).toMatchObject({ nickname: 'Alice', score: 2300, correctCount: 2 });
  });

  it('keeps a « Mytho ! » question and saves its lies, authors and voters', async () => {
    const host = await user('host@test.fr');
    const headers = { authorization: `Bearer ${await createSession(prisma, host.id)}` };
    const questions: Question[] = [
      {
        text: 'Le premier court-métrage de Tim Burton ?',
        type: 'BLUFF',
        truth: 'Vincent',
        timeLimitSec: 45,
        voteTimeSec: 15,
        basePoints: 1000,
      },
    ];
    const q = await createQuiz(prisma, host.id, { title: 'Mytho', questions });
    const { quiz, dbQuizId } = await persistence.loadQuiz(q.id, host.id);
    expect(quiz.questions).toEqual(questions);

    let options: string[] = [];
    const game = new Game('123456', quiz, {
      ...noop,
      toHost: (event, payload) => {
        const show = payload as QuestionShowPayload;
        if (event === 'question:show' && show.bluff?.stage === 'vote') options = show.bluff.options;
      },
    });
    const alice = game.join('Alice', 's1', 'batman');
    const bob = game.join('Bob', 's2', 'robin');
    game.start();
    game.next();
    game.answer(alice.id, 0, { text: 'Frankenweenie' });
    game.answer(bob.id, 0, { text: 'Le Cavalier' });
    game.answer(alice.id, 0, { choiceIndex: options.indexOf('Vincent') });
    game.answer(bob.id, 0, { choiceIndex: options.indexOf('Frankenweenie') });
    game.next();
    game.end();
    game.dispose();
    await persistence.saveGame(gameRecord(game, host.id, dbQuizId)!);

    const [summary] = (await app.inject({ url: '/api/games', headers })).json<GameSummary[]>();
    const report = (
      await app.inject({ url: `/api/games/${summary!.id}`, headers })
    ).json<GameReport>();
    const alicePlayer = { id: alice.id, nickname: 'Alice', avatar: 'batman' };
    const bobPlayer = { id: bob.id, nickname: 'Bob', avatar: 'robin' };
    expect(report.questions[0]).toMatchObject({ type: 'BLUFF', correctCount: 1, answerCount: 2 });
    expect(report.questions[0]!.details).toEqual({
      bluff: {
        truth: 'Vincent',
        options: [
          { text: 'Le Cavalier', truth: false, authors: [bobPlayer], voters: [] },
          { text: 'Frankenweenie', truth: false, authors: [alicePlayer], voters: [bobPlayer] },
          { text: 'Vincent', truth: true, authors: [], voters: [alicePlayer] },
        ],
      },
    });
    // Truth (1000) + Bob fooled (250, « Mytho ! » rebalance).
    expect(report.results[0]).toMatchObject({ nickname: 'Alice', score: 1250, correctCount: 1 });
  });

  it('keeps a « Dessine-moi » question and saves the drawing as vector data', async () => {
    const host = await user('host@test.fr');
    const headers = { authorization: `Bearer ${await createSession(prisma, host.id)}` };
    const questions: Question[] = [
      {
        text: 'Dessine-moi…',
        type: 'DRAW',
        words: ['Licorne'],
        timeLimitSec: 60,
        basePoints: 1000,
      },
    ];
    const q = await createQuiz(prisma, host.id, { title: 'Dessin', questions });
    const { quiz, dbQuizId } = await persistence.loadQuiz(q.id, host.id);
    expect(quiz.questions).toEqual(questions);

    const game = new Game('123456', quiz, noop, {}, { mode: 'solo', allAnsweredGraceMs: 0 });
    const alice = game.join('Alice', 's1', 'batman');
    const bob = game.join('Bob', 's2', 'robin');
    game.start();
    game.next();
    const strokes = [
      { id: 0, color: 1, size: 2, points: [10, 20, 30, 40] },
      { id: 1, color: 0, size: 0, erase: true as const, points: [50, 60] },
    ];
    game.draw(alice.id, 0, strokes);
    game.answer(bob.id, 0, { text: 'licorne' });
    game.next();
    game.end();
    game.dispose();
    await persistence.saveGame(gameRecord(game, host.id, dbQuizId)!);

    const [summary] = (await app.inject({ url: '/api/games', headers })).json<GameSummary[]>();
    const report = (
      await app.inject({ url: `/api/games/${summary!.id}`, headers })
    ).json<GameReport>();
    expect(report.questions[0]).toMatchObject({ type: 'DRAW', correctCount: 1, answerCount: 1 });
    expect(report.questions[0]!.details).toEqual({
      draw: {
        word: 'Licorne',
        drawer: { id: alice.id, nickname: 'Alice', avatar: 'batman' },
        strokes,
        found: [{ id: bob.id, nickname: 'Bob', avatar: 'robin', ms: expect.any(Number) }],
      },
    });
    // Alice drew (Bob, the only guesser, found it: +1000), Bob found it.
    expect(report.results.every((r) => r.score > 0)).toBe(true);
  });

  it('keeps a « Couleurs perdues » question and saves every player’s board', async () => {
    const host = await user('host@test.fr');
    const headers = { authorization: `Bearer ${await createSession(prisma, host.id)}` };
    const questions: Question[] = [
      {
        text: 'Les couleurs du tableau ?',
        type: 'COLORS',
        imageUrl: 'https://example.com/uploads/tableau.png',
        memoSec: 15,
        cells: 6,
        zones: [
          { x: 0.2, y: 0.3, radius: 0.1, color: 0 },
          { x: 0.7, y: 0.6, radius: 0.1, color: 4 },
        ],
        timeLimitSec: 30,
        basePoints: 1000,
      },
      {
        text: 'Formes',
        type: 'COLORS',
        memoSec: 20,
        cells: 9,
        zones: [],
        timeLimitSec: 25,
        basePoints: 2000,
      },
    ];
    const q = await createQuiz(prisma, host.id, { title: 'Couleurs', questions });
    const { quiz, dbQuizId } = await persistence.loadQuiz(q.id, host.id);
    expect(quiz.questions).toEqual(questions);

    const game = new Game('123456', quiz, noop, {}, { mode: 'solo', allAnsweredGraceMs: 0 });
    const alice = game.join('Alice', 's1', 'batman');
    const bob = game.join('Bob', 's2', 'robin');
    game.start();
    game.next(); // intro → memorizing
    game.next(); // → answers
    game.answer(alice.id, 0, { colors: [0, 4] });
    game.answer(bob.id, 0, { colors: [0, 1] });
    game.end();
    game.dispose();
    await persistence.saveGame(gameRecord(game, host.id, dbQuizId)!);

    const [summary] = (await app.inject({ url: '/api/games', headers })).json<GameSummary[]>();
    const report = (
      await app.inject({ url: `/api/games/${summary!.id}`, headers })
    ).json<GameReport>();
    expect(report.questions[0]).toMatchObject({ type: 'COLORS', correctCount: 1, answerCount: 2 });
    expect(report.questions[0]!.details.colors).toMatchObject({
      colors: [0, 4],
      zones: [2, 1],
      answers: [
        { nickname: 'Alice', colors: [0, 4], right: 2 },
        { nickname: 'Bob', colors: [0, 1], right: 1 },
      ],
    });
  });

  it('keeps a « Qu’est-ce qui a disparu ? » question and saves both pictures and the pins', async () => {
    const host = await user('host@test.fr');
    const headers = { authorization: `Bearer ${await createSession(prisma, host.id)}` };
    const questions: Question[] = [
      {
        text: 'Qu’est-ce qui a disparu ?',
        type: 'MISSING',
        imageUrl: 'https://example.com/uploads/avant.png',
        missingImageUrl: 'https://example.com/uploads/apres.png',
        memoSec: 15,
        zone: { x: 0.4, y: 0.6, radius: 0.1 },
        timeLimitSec: 25,
        basePoints: 2000,
      },
    ];
    const q = await createQuiz(prisma, host.id, { title: 'Disparu', questions });
    const { quiz, dbQuizId } = await persistence.loadQuiz(q.id, host.id);
    expect(quiz.questions).toEqual(questions);

    const game = new Game('123456', quiz, noop, {}, { mode: 'solo', allAnsweredGraceMs: 0 });
    const alice = game.join('Alice', 's1', 'batman');
    const bob = game.join('Bob', 's2', 'robin');
    game.start();
    game.next(); // intro → memorizing
    game.next(); // → answers
    game.answer(alice.id, 0, { point: { x: 0.4, y: 0.6 } });
    game.answer(bob.id, 0, { point: { x: 0.9, y: 0.1 } });
    game.end();
    game.dispose();
    await persistence.saveGame(gameRecord(game, host.id, dbQuizId)!);

    const [summary] = (await app.inject({ url: '/api/games', headers })).json<GameSummary[]>();
    const report = (
      await app.inject({ url: `/api/games/${summary!.id}`, headers })
    ).json<GameReport>();
    expect(report.questions[0]).toMatchObject({ type: 'MISSING', correctCount: 1, answerCount: 2 });
    expect(report.questions[0]!.details.missing).toMatchObject({
      imageUrl: 'https://example.com/uploads/avant.png',
      missingImageUrl: 'https://example.com/uploads/apres.png',
      zone: { x: 0.4, y: 0.6, radius: 0.1 },
      pins: [
        { nickname: 'Alice', correct: true },
        { nickname: 'Bob', correct: false },
      ],
    });
  });

  it('keeps a « Pas évident ! » question and saves the grouped answers', async () => {
    const host = await user('host@test.fr');
    const headers = { authorization: `Bearer ${await createSession(prisma, host.id)}` };
    const questions: Question[] = [
      {
        text: 'Citez un pays d’Afrique',
        type: 'POINTLESS',
        items: ['Maroc', 'Égypte | Egypte', 'Tchad'],
        typoTolerance: false,
        timeLimitSec: 25,
        basePoints: 2000,
      },
    ];
    const q = await createQuiz(prisma, host.id, { title: 'Pas évident', questions });
    const { quiz, dbQuizId } = await persistence.loadQuiz(q.id, host.id);
    expect(quiz.questions).toEqual(questions);

    const game = new Game('123456', quiz, noop, {}, { mode: 'solo', allAnsweredGraceMs: 0 });
    const alice = game.join('Alice', 's1', 'batman');
    const bob = game.join('Bob', 's2', 'robin');
    const chloe = game.join('Chloé', 's3', 'joker');
    game.start();
    game.next(); // intro → answers
    game.answer(alice.id, 0, { text: 'Egypte' });
    game.answer(bob.id, 0, { text: 'Égypte' });
    game.answer(chloe.id, 0, { text: 'Paris' });
    game.end();
    game.dispose();
    await persistence.saveGame(gameRecord(game, host.id, dbQuizId)!);

    const [summary] = (await app.inject({ url: '/api/games', headers })).json<GameSummary[]>();
    const report = (
      await app.inject({ url: `/api/games/${summary!.id}`, headers })
    ).json<GameReport>();
    expect(report.questions[0]).toMatchObject({
      type: 'POINTLESS',
      correctCount: 2,
      answerCount: 3,
    });
    expect(report.questions[0]!.details.pointless).toMatchObject({
      answers: [{ text: 'Égypte', points: 1000 }],
      wrong: [{ text: 'Paris' }],
      missed: ['Maroc', 'Tchad'],
      missedCount: 2,
    });
  });
  it('keeps a « Paris sur les réponses » question and saves the slots and bets', async () => {
    const host = await user('host@test.fr');
    const headers = { authorization: `Bearer ${await createSession(prisma, host.id)}` };
    const questions: Question[] = [
      {
        text: 'Hauteur de la tour Eiffel ?',
        type: 'WAGER',
        wager: { correct: 330.5, unit: 'm' },
        betTimeSec: 15,
        timeLimitSec: 25,
        basePoints: 2000,
      },
    ];
    const q = await createQuiz(prisma, host.id, { title: 'Paris', questions });
    const { quiz, dbQuizId } = await persistence.loadQuiz(q.id, host.id);
    expect(quiz.questions).toEqual(questions);

    const game = new Game('123456', quiz, noop, {}, { mode: 'solo' });
    const alice = game.join('Alice', 's1', 'batman');
    const bob = game.join('Bob', 's2', 'robin');
    game.start();
    game.next(); // intro → guesses
    game.answer(alice.id, 0, { value: 300 });
    game.answer(bob.id, 0, { value: 400 });
    game.answer(alice.id, 0, { choiceIndex: 1 }); // 300: wins
    game.answer(bob.id, 0, { choiceIndex: 2 });
    game.end();
    game.dispose();
    await persistence.saveGame(gameRecord(game, host.id, dbQuizId)!);

    const [summary] = (await app.inject({ url: '/api/games', headers })).json<GameSummary[]>();
    const report = (
      await app.inject({ url: `/api/games/${summary!.id}`, headers })
    ).json<GameReport>();
    expect(report.questions[0]).toMatchObject({ type: 'WAGER', correctCount: 1, answerCount: 2 });
    expect(report.questions[0]!.details.wager).toMatchObject({
      correct: 330.5,
      unit: 'm',
      winning: 1,
      betPoints: 2000,
      authorPoints: 1000,
      slots: [
        { value: null, bettors: [] },
        { value: 300, authors: [{ nickname: 'Alice' }], bettors: [{ nickname: 'Alice' }] },
        { value: 400, authors: [{ nickname: 'Bob' }], bettors: [{ nickname: 'Bob' }] },
      ],
    });
  });
  it('keeps a « Sur la même longueur d’onde » question and saves the target, clue and needles', async () => {
    const host = await user('host@test.fr');
    const headers = { authorization: `Bearer ${await createSession(prisma, host.id)}` };
    const questions: Question[] = [
      {
        text: 'Sur la même longueur d’onde !',
        type: 'WAVELENGTH',
        spectra: [{ left: 'Froid', right: 'Chaud' }],
        clueTimeSec: 40,
        timeLimitSec: 25,
        basePoints: 1000,
      },
    ];
    const q = await createQuiz(prisma, host.id, { title: 'Onde', questions });
    const { quiz, dbQuizId } = await persistence.loadQuiz(q.id, host.id);
    expect(quiz.questions).toEqual(questions);

    const game = new Game('123456', quiz, noop, {}, { mode: 'solo', random: () => 0.5 });
    const alice = game.join('Alice', 's1', 'batman');
    const bob = game.join('Bob', 's2', 'robin');
    game.start();
    game.next(); // intro → clue (Alice is the psychic, target 50)
    game.answer(alice.id, 0, { text: 'Tiède' });
    game.answer(bob.id, 0, { value: 48 });
    game.next(); // reveal
    game.end();
    game.dispose();
    await persistence.saveGame(gameRecord(game, host.id, dbQuizId)!);

    const [summary] = (await app.inject({ url: '/api/games', headers })).json<GameSummary[]>();
    const report = (
      await app.inject({ url: `/api/games/${summary!.id}`, headers })
    ).json<GameReport>();
    expect(report.questions[0]).toMatchObject({
      type: 'WAVELENGTH',
      correctCount: 1,
      answerCount: 1,
    });
    expect(report.questions[0]!.details.wavelength).toMatchObject({
      spectrum: { left: 'Froid', right: 'Chaud' },
      target: 50,
      clue: 'Tiède',
      psychic: { nickname: 'Alice' },
      psychicPoints: 1000,
      needles: [{ nickname: 'Bob', value: 48, points: 1000 }],
    });
  });
  it('keeps a « Patate chaude » question and saves the loser and the passes', async () => {
    const host = await user('host@test.fr');
    const headers = { authorization: `Bearer ${await createSession(prisma, host.id)}` };
    const questions: Question[] = [
      {
        text: 'Patate chaude !',
        type: 'HOT_POTATO',
        timeLimitSec: 20,
        basePoints: 1000,
        potato: {
          questions: [
            { text: '1 + 1 ?', choices: ['1', '2'], correct: 1 },
            { text: '2 + 2 ?', choices: ['4', '5', '6'], correct: 0 },
            {
              text: 'Capitale de la France ?',
              choices: ['Lyon', 'Paris', 'Nice', 'Lille'],
              correct: 1,
            },
          ],
          fuseMinSec: 20,
          fuseMaxSec: 40,
        },
      },
    ];
    const q = await createQuiz(prisma, host.id, { title: 'Patate', questions });
    const { quiz, dbQuizId } = await persistence.loadQuiz(q.id, host.id);
    expect(quiz.questions).toEqual(questions);

    const game = new Game('123456', quiz, noop, {}, { mode: 'solo', random: () => 0.5 });
    const alice = game.join('Alice', 's1', 'batman');
    const bob = game.join('Bob', 's2', 'robin');
    game.start();
    game.next(); // intro → round (random 0.5: Bob holds it)
    game.answer(bob.id, 0, { choiceIndex: 1 }); // pass to Alice
    game.next(); // the bomb goes off on Alice
    game.end();
    game.dispose();
    await persistence.saveGame(gameRecord(game, host.id, dbQuizId)!);

    const [summary] = (await app.inject({ url: '/api/games', headers })).json<GameSummary[]>();
    const report = (
      await app.inject({ url: `/api/games/${summary!.id}`, headers })
    ).json<GameReport>();
    expect(report.questions[0]).toMatchObject({ type: 'HOT_POTATO', correctCount: 1 });
    expect(report.questions[0]!.details.potato).toMatchObject({
      loser: { nickname: 'Alice' },
      players: [
        { nickname: 'Alice', passes: 0, points: 0 },
        { nickname: 'Bob', passes: 1, points: 600 },
      ],
      asked: 2,
      last: { text: '2 + 2 ?', answer: '4' },
    });
    expect(alice).toBeDefined();
  });
});
