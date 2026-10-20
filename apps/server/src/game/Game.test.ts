import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_QUIZ, QUESTION_INTRO_MS, type ServerToClientEvents } from '@lbq/shared';
import { Game, type GameTransport } from './Game.js';
import { GameError } from './errors.js';
import { GameManager, generatePin } from './GameManager.js';

type Sent = { to: string; event: keyof ServerToClientEvents; payload: unknown };

/** Records every emitted event: `to` is 'all', 'host' or a socket id. */
function recorder() {
  const sent: Sent[] = [];
  const detached: string[] = [];
  const transport: GameTransport = {
    toAll: (event, payload) => void sent.push({ to: 'all', event, payload }),
    toHost: (event, payload) => void sent.push({ to: 'host', event, payload }),
    toSocket: (to, event, payload) => void sent.push({ to, event, payload }),
    detachSocket: (sid) => void detached.push(sid),
  };
  const last = (event: Sent['event'], to?: string) =>
    sent.filter((s) => s.event === event && (to === undefined || s.to === to)).at(-1)?.payload;
  return { sent, detached, transport, last, clear: () => (sent.length = 0) };
}

function expectGameError(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(GameError);
    expect((err as GameError).code).toBe(code);
    return;
  }
  throw new Error(`expected GameError ${code}`);
}

describe('Game state machine', () => {
  let rec: ReturnType<typeof recorder>;
  let game: Game;

  beforeEach(() => {
    vi.useFakeTimers();
    rec = recorder();
    game = new Game('123456', DEMO_QUIZ, rec.transport);
  });

  afterEach(() => {
    game.dispose();
    vi.useRealTimers();
  });

  const joinAll = (...names: string[]) => names.map((n, i) => game.join(n, `sock-${i}`));

  it('starts in LOBBY with questionIndex -1', () => {
    expect(game.statePayload()).toEqual({
      phase: 'LOBBY',
      questionIndex: -1,
      totalQuestions: DEMO_QUIZ.questions.length,
    });
  });

  it('joins players and broadcasts the lobby list to the host', () => {
    const [alice] = joinAll('Alice', 'Bob');
    expect(rec.last('lobby:players', 'host')).toEqual({
      players: [
        { id: alice!.id, nickname: 'Alice' },
        { id: expect.any(String), nickname: 'Bob' },
      ],
    });
  });

  it('rejects duplicate nicknames (case-insensitive) and joins after start', () => {
    joinAll('Alice');
    expectGameError(() => game.join(' alice ', 's2'), 'NICKNAME_TAKEN');
    game.start();
    expectGameError(() => game.join('Zoé', 's3'), 'GAME_ALREADY_STARTED');
  });

  it('checks the host token', () => {
    expectGameError(() => game.assertHost('nope'), 'UNAUTHORIZED');
    expect(() => game.assertHost(game.hostToken)).not.toThrow();
  });

  it('QUESTION_INTRO shows the full question to the host only, then auto-starts ANSWERING', () => {
    joinAll('Alice');
    game.start();
    expect(game.phase).toBe('QUESTION_INTRO');
    expect(rec.last('game:state', 'all')).toMatchObject({
      phase: 'QUESTION_INTRO',
      questionIndex: 0,
      remainingMs: QUESTION_INTRO_MS,
    });
    const show = rec.sent.find((s) => s.event === 'question:show');
    expect(show?.to).toBe('host');
    expect(show?.payload).toEqual({
      index: 0,
      text: DEMO_QUIZ.questions[0]!.text,
      choices: ['Lyon', 'Paris', 'Marseille', 'Bordeaux'],
      timeLimitSec: 20,
    });

    vi.advanceTimersByTime(QUESTION_INTRO_MS);
    expect(game.phase).toBe('ANSWERING');
    expect(rec.last('game:state')).toMatchObject({ phase: 'ANSWERING', remainingMs: 20_000 });
  });

  it('never sends the question text or correct answer to players before REVEAL', () => {
    joinAll('Alice');
    game.start();
    vi.advanceTimersByTime(QUESTION_INTRO_MS);
    const toPlayer = rec.sent.filter((s) => s.to === 'sock-0');
    expect(toPlayer.map((s) => s.event)).toEqual(['question:prompt']);
    expect(toPlayer[0]!.payload).toEqual({ index: 0, choiceCount: 4, timeLimitSec: 20 });
    const toAll = rec.sent.filter((s) => s.to === 'all').map((s) => s.event);
    expect(toAll.every((e) => e === 'game:state')).toBe(true);
  });

  it('scores on server time, accepts one answer, reveals when everyone answered', () => {
    const [alice, bob] = joinAll('Alice', 'Bob');
    game.start();
    vi.advanceTimersByTime(QUESTION_INTRO_MS);

    vi.advanceTimersByTime(5_000);
    game.answer(alice!.id, 0, 1); // correct after 5 s of 20 s → 875
    expect(rec.last('answer:count', 'host')).toEqual({ answered: 1, total: 2 });
    expectGameError(() => game.answer(alice!.id, 0, 2), 'ALREADY_ANSWERED');
    expect(game.phase).toBe('ANSWERING');

    game.answer(bob!.id, 0, 0); // wrong
    expect(game.phase).toBe('REVEAL');
    expect(rec.last('question:reveal', 'host')).toEqual({
      correctIndexes: [1],
      distribution: [1, 1, 0, 0],
    });
    expect(rec.last('player:result', 'sock-0')).toEqual({
      correct: true,
      pointsEarned: 875,
      totalScore: 875,
      rank: 1,
    });
    expect(rec.last('player:result', 'sock-1')).toEqual({
      correct: false,
      pointsEarned: 0,
      totalScore: 0,
      rank: 2,
    });
  });

  it('ends ANSWERING when the timer expires and ignores late answers', () => {
    const [alice, bob] = joinAll('Alice', 'Bob');
    game.start();
    vi.advanceTimersByTime(QUESTION_INTRO_MS);
    game.answer(alice!.id, 0, 1);
    vi.advanceTimersByTime(20_000);
    expect(game.phase).toBe('REVEAL');
    expectGameError(() => game.answer(bob!.id, 0, 1), 'NOT_ANSWERING');
    expect(rec.last('player:result', 'sock-1')).toMatchObject({ correct: false, pointsEarned: 0 });
  });

  it('rejects answers for another question or an out-of-range choice', () => {
    const [alice] = joinAll('Alice', 'Bob');
    game.start();
    expectGameError(() => game.answer(alice!.id, 0, 1), 'NOT_ANSWERING'); // still in intro
    vi.advanceTimersByTime(QUESTION_INTRO_MS);
    expectGameError(() => game.answer(alice!.id, 1, 1), 'NOT_ANSWERING');
    game.next(); // → REVEAL
    game.next(); // → LEADERBOARD
    game.next(); // → QUESTION_INTRO q1 (true/false: 2 choices)
    vi.advanceTimersByTime(QUESTION_INTRO_MS);
    expectGameError(() => game.answer(alice!.id, 1, 3), 'INVALID_PAYLOAD');
  });

  it('plays the whole quiz: leaderboard between questions, then podium, then ENDED', () => {
    const [alice, bob] = joinAll('Alice', 'Bob');
    game.start();
    for (let q = 0; q < DEMO_QUIZ.questions.length; q++) {
      expect(game.phase).toBe('QUESTION_INTRO');
      expect(game.questionIndex).toBe(q);
      vi.advanceTimersByTime(QUESTION_INTRO_MS);
      const correct = DEMO_QUIZ.questions[q]!.choices.findIndex((c) => c.isCorrect);
      game.answer(alice!.id, q, correct);
      game.answer(bob!.id, q, (correct + 1) % 2);
      expect(game.phase).toBe('REVEAL');
      game.next();
      expect(game.phase).toBe('LEADERBOARD');
      game.next();
    }
    expect(game.phase).toBe('PODIUM');
    // 1000 + 1000 + 2000 + 1000, all answered instantly
    expect(rec.last('podium', 'all')).toEqual({
      top: [
        { nickname: 'Alice', score: 5000 },
        { nickname: 'Bob', score: 0 },
      ],
    });
    expect(rec.last('leaderboard', 'host')).toEqual({
      top: [
        { nickname: 'Alice', score: 5000 },
        { nickname: 'Bob', score: 0 },
      ],
    });
    game.next();
    expect(game.phase).toBe('ENDED');
    expect(rec.last('game:state', 'all')).toMatchObject({ phase: 'ENDED' });
  });

  it('host can skip the intro and the timer with next()', () => {
    joinAll('Alice');
    game.start();
    game.next();
    expect(game.phase).toBe('ANSWERING');
    game.next();
    expect(game.phase).toBe('REVEAL');
    vi.advanceTimersByTime(60_000); // stale timers must not fire
    expect(game.phase).toBe('REVEAL');
  });

  it('end() works from any phase and stops timers', () => {
    joinAll('Alice');
    game.start();
    game.end();
    expect(game.phase).toBe('ENDED');
    vi.advanceTimersByTime(60_000);
    expect(game.phase).toBe('ENDED');
  });

  it('kick removes the player, notifies them and updates the host', () => {
    const [alice, bob] = joinAll('Alice', 'Bob');
    game.kick(alice!.id);
    expect(game.players.has(alice!.id)).toBe(false);
    expect(rec.last('player:kicked', 'sock-0')).toEqual({});
    expect(rec.detached).toEqual(['sock-0']);
    expect(rec.last('lobby:players', 'host')).toEqual({
      players: [{ id: bob!.id, nickname: 'Bob' }],
    });
  });

  it('kicking the last non-answering player triggers the reveal', () => {
    const [alice, bob] = joinAll('Alice', 'Bob');
    game.start();
    vi.advanceTimersByTime(QUESTION_INTRO_MS);
    game.answer(alice!.id, 0, 1);
    game.kick(bob!.id);
    expect(game.phase).toBe('REVEAL');
  });

  describe('disconnect / rejoin', () => {
    it('does not wait for disconnected players', () => {
      const [alice] = joinAll('Alice', 'Bob');
      game.start();
      vi.advanceTimersByTime(QUESTION_INTRO_MS);
      game.disconnect('sock-1');
      expect(rec.last('answer:count', 'host')).toEqual({ answered: 0, total: 1 });
      game.answer(alice!.id, 0, 1);
      expect(game.phase).toBe('REVEAL');
    });

    it('rejoin with the session token restores the player and re-sends the prompt', () => {
      const [alice] = joinAll('Alice', 'Bob');
      game.start();
      vi.advanceTimersByTime(QUESTION_INTRO_MS);
      game.disconnect('sock-0');
      vi.advanceTimersByTime(4_000);

      const p = game.rejoin(alice!.sessionToken, 'sock-new');
      expect(p.id).toBe(alice!.id);
      game.resync(p);
      expect(rec.last('game:state', 'sock-new')).toMatchObject({
        phase: 'ANSWERING',
        questionIndex: 0,
        remainingMs: 16_000,
      });
      expect(rec.last('question:prompt', 'sock-new')).toEqual({
        index: 0,
        choiceCount: 4,
        timeLimitSec: 20,
      });
      game.answer(p.id, 0, 1);
      expect(p.answer?.responseMs).toBe(4_000);
    });

    it('re-sends the player result when rejoining during REVEAL', () => {
      const [alice] = joinAll('Alice');
      game.start();
      vi.advanceTimersByTime(QUESTION_INTRO_MS);
      game.answer(alice!.id, 0, 1);
      game.disconnect('sock-0');
      const p = game.rejoin(alice!.sessionToken, 'sock-new');
      game.resync(p);
      expect(rec.last('player:result', 'sock-new')).toMatchObject({ correct: true, rank: 1 });
      expect(rec.last('question:prompt', 'sock-new')).toBeUndefined();
    });

    it('rejects an unknown session token', () => {
      expectGameError(() => game.rejoin('bad-token', 's'), 'SESSION_NOT_FOUND');
    });
  });
});

describe('GameManager', () => {
  const noop: GameTransport = {
    toAll: () => {},
    toHost: () => {},
    toSocket: () => {},
    detachSocket: () => {},
  };

  it('generates 6-digit PINs, skipping taken ones', () => {
    const taken = new Set<string>();
    const pin = generatePin(() => false);
    expect(pin).toMatch(/^\d{6}$/);
    let calls = 0;
    const second = generatePin((p) => {
      calls++;
      if (calls === 1) {
        taken.add(p);
        return true;
      }
      return false;
    });
    expect(taken.has(second)).toBe(false);
  });

  it('creates, finds and sweeps games', () => {
    const games = new GameManager();
    const game = games.create(DEMO_QUIZ, () => noop);
    expect(games.get(game.pin)).toBe(game);
    expect(() => games.get('000000' === game.pin ? '000001' : '000000')).toThrow(GameError);

    game.end();
    games.sweep(game.lastActivityAt + 1000);
    expect(games.size).toBe(1);
    games.sweep(game.lastActivityAt + 10 * 60 * 1000);
    expect(games.size).toBe(0);
  });
});
