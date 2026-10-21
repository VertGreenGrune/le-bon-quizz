import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEMO_QUIZ,
  PAUSE_GRACE_MS,
  QUESTION_INTRO_MS,
  RESUME_COUNTDOWN_MS,
  type GameStatePayload,
  type LobbyPlayersPayload,
  type ServerToClientEvents,
  type StandingsPayload,
} from '@lbq/shared';
import { Game, type GameTransport, type Player } from './Game.js';
import { GameError } from './errors.js';
import { CLASSIC_QUIZ, rightAnswer } from './testing.js';

type Sent = { to: string; event: keyof ServerToClientEvents; payload: unknown };

function recorder() {
  const sent: Sent[] = [];
  const transport: GameTransport = {
    toAll: (event, payload) => void sent.push({ to: 'all', event, payload }),
    toHost: (event, payload) => void sent.push({ to: 'host', event, payload }),
    toSocket: (to, event, payload) => void sent.push({ to, event, payload }),
    detachSocket: () => {},
  };
  const last = (event: Sent['event'], to?: string) =>
    sent.filter((s) => s.event === event && (to === undefined || s.to === to)).at(-1)?.payload;
  return { sent, transport, last };
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

describe('Game pause (a player or the host screen loses the connection)', () => {
  let rec: ReturnType<typeof recorder>;
  let game: Game;

  beforeEach(() => {
    vi.useFakeTimers();
    rec = recorder();
    game = new Game('123456', CLASSIC_QUIZ, rec.transport);
  });

  afterEach(() => {
    game.dispose();
    vi.useRealTimers();
  });

  const joinAll = (...names: string[]) => names.map((n) => game.join(n, `sock-${n}`));
  const state = () => rec.last('game:state', 'all') as GameStatePayload;
  const answerRight = (p: Player) =>
    game.answer(p.id, game.questionIndex, rightAnswer(game.currentQuestion!));
  /** Starts the game and goes to ANSWERING of question 1. */
  const toAnswering = () => {
    game.start();
    vi.advanceTimersByTime(QUESTION_INTRO_MS);
    expect(game.phase).toBe('ANSWERING');
  };

  it('pauses only after the grace period, with the timer restored to the drop', () => {
    const [alice, bob] = joinAll('Alice', 'Bob');
    toAnswering();
    vi.advanceTimersByTime(5_000);
    game.disconnect(bob!.socketId!);
    vi.advanceTimersByTime(PAUSE_GRACE_MS - 1);
    expect(game.paused).toBe(false); // a short blip doesn't freeze the game

    vi.advanceTimersByTime(1);
    expect(game.paused).toBe(true);
    expect(state()).toEqual({
      phase: 'ANSWERING',
      mode: 'solo',
      questionIndex: 0,
      totalQuestions: CLASSIC_QUIZ.questions.length,
      remainingMs: 15_000, // the 2 s grace is given back
      paused: {
        waitingFor: [{ id: bob!.id, nickname: 'Bob', avatar: bob!.avatar }],
        hostMissing: false,
        sinceMs: 0,
      },
    });

    // Frozen: a long pause never ends the question.
    vi.advanceTimersByTime(60_000);
    expect(game.phase).toBe('ANSWERING');
    expect(game.statePayload()).toMatchObject({ remainingMs: 15_000, paused: { sinceMs: 60_000 } });
    expectGameError(() => answerRight(alice!), 'GAME_PAUSED');
  });

  it('a player back within the grace period does not pause the game', () => {
    const [, bob] = joinAll('Alice', 'Bob');
    toAnswering();
    game.disconnect(bob!.socketId!);
    vi.advanceTimersByTime(1_000);
    game.rejoin(bob!.sessionToken, 'sock-bob-2');
    vi.advanceTimersByTime(5_000);
    expect(game.paused).toBe(false);
    expect(rec.sent.some((s) => s.event === 'game:resuming')).toBe(false);
  });

  it('does not pause for a player who already answered', () => {
    const [alice, bob] = joinAll('Alice', 'Bob');
    toAnswering();
    answerRight(bob!);
    game.disconnect(bob!.socketId!);
    vi.advanceTimersByTime(10_000);
    expect(game.paused).toBe(false);
    answerRight(alice!);
    expect(game.phase).toBe('REVEAL');
  });

  it('the timer running out during the grace period pauses instead of ending the question', () => {
    const [, bob] = joinAll('Alice', 'Bob');
    toAnswering();
    vi.advanceTimersByTime(19_500);
    game.disconnect(bob!.socketId!);
    vi.advanceTimersByTime(1_000); // timer expires 0.5 s after the drop
    expect(game.phase).toBe('ANSWERING');
    expect(game.paused).toBe(true);
    expect(state().remainingMs).toBe(500);
  });

  it('pauses when the host screen loses its connection, resumes when it is back', () => {
    joinAll('Alice');
    game.hostConnected('host-1');
    toAnswering();
    game.hostDisconnected('host-1');
    vi.advanceTimersByTime(PAUSE_GRACE_MS);
    expect(state().paused).toEqual({ waitingFor: [], hostMissing: true, sinceMs: 0 });

    game.hostConnected('host-2');
    expect(rec.last('game:resuming', 'all')).toEqual({ inMs: RESUME_COUNTDOWN_MS });
    vi.advanceTimersByTime(RESUME_COUNTDOWN_MS);
    expect(game.paused).toBe(false);
    expect(state()).toMatchObject({ phase: 'ANSWERING', remainingMs: 20_000 });
    expect(state().paused).toBeUndefined();
  });

  it('resumes automatically with a 3-2-1 countdown once everyone is back', () => {
    const [alice, bob] = joinAll('Alice', 'Bob');
    toAnswering();
    vi.advanceTimersByTime(4_000);
    game.disconnect(bob!.socketId!);
    vi.advanceTimersByTime(30_000);
    game.resync(game.rejoin(bob!.sessionToken, 'sock-bob-2'));

    // Countdown: everyone is told, the rejoining phone included; still frozen meanwhile.
    expect(rec.last('game:resuming', 'all')).toEqual({ inMs: RESUME_COUNTDOWN_MS });
    expect(rec.last('game:resuming', 'sock-bob-2')).toEqual({ inMs: RESUME_COUNTDOWN_MS });
    expect(state().paused?.waitingFor).toEqual([]);
    expectGameError(() => answerRight(alice!), 'GAME_PAUSED');
    vi.advanceTimersByTime(RESUME_COUNTDOWN_MS - 1);
    expect(game.paused).toBe(true);
    vi.advanceTimersByTime(1);
    expect(game.paused).toBe(false);
    expect(state()).toMatchObject({ phase: 'ANSWERING', remainingMs: 16_000 });

    // 16 s left on the clock: the question ends 16 s later, not before.
    vi.advanceTimersByTime(15_999);
    expect(game.phase).toBe('ANSWERING');
    vi.advanceTimersByTime(1);
    expect(game.phase).toBe('REVEAL');
  });

  it('a drop during the countdown cancels it', () => {
    const [alice, bob] = joinAll('Alice', 'Bob');
    toAnswering();
    game.disconnect(bob!.socketId!);
    vi.advanceTimersByTime(PAUSE_GRACE_MS);
    game.rejoin(bob!.sessionToken, 'sock-bob-2');
    vi.advanceTimersByTime(1_000);
    game.disconnect('sock-bob-2');
    expect(state().paused?.waitingFor.map((p) => p.nickname)).toEqual(['Bob']);
    vi.advanceTimersByTime(10_000);
    expect(game.paused).toBe(true);
    expectGameError(() => answerRight(alice!), 'GAME_PAUSED');
  });

  it('responseMs excludes the pause: same points as without a pause', () => {
    const play = (withPause: boolean) => {
      const g = new Game('654321', CLASSIC_QUIZ, recorder().transport);
      const [alice, bob] = ['Alice', 'Bob'].map((n) => g.join(n, `s-${n}`));
      g.start();
      vi.advanceTimersByTime(QUESTION_INTRO_MS + 3_000);
      if (withPause) {
        g.disconnect('s-Bob');
        vi.advanceTimersByTime(45_000);
        g.rejoin(bob!.sessionToken, 's-Bob-2');
        vi.advanceTimersByTime(RESUME_COUNTDOWN_MS);
      }
      vi.advanceTimersByTime(2_000);
      g.answer(alice!.id, 0, rightAnswer(g.currentQuestion!));
      vi.advanceTimersByTime(1_000);
      g.answer(bob!.id, 0, rightAnswer(g.currentQuestion!));
      const scores = [alice!.totalScore, bob!.totalScore];
      g.dispose();
      return scores;
    };
    const normal = play(false);
    expect(normal[0]).toBeGreaterThan(normal[1]!);
    expect(play(true)).toEqual(normal);
  });

  it('« Continuer sans »: the missing player is absent for this question only', () => {
    const [alice, bob, chloe] = joinAll('Alice', 'Bob', 'Chloé');
    toAnswering();
    game.disconnect(bob!.socketId!);
    vi.advanceTimersByTime(PAUSE_GRACE_MS);
    game.resume();
    expect(rec.last('game:resuming', 'all')).toEqual({ inMs: RESUME_COUNTDOWN_MS });
    vi.advanceTimersByTime(RESUME_COUNTDOWN_MS);
    expect(rec.last('answer:count', 'host')).toEqual({ answered: 0, total: 2 });
    answerRight(alice!);
    answerRight(chloe!);
    expect(game.phase).toBe('REVEAL'); // Bob doesn't block the end of ANSWERING

    // Still gone at the next question: it starts paused, waiting for Bob again.
    game.next();
    game.next();
    expect(game.phase).toBe('QUESTION_INTRO');
    expect(state()).toMatchObject({
      phase: 'QUESTION_INTRO',
      remainingMs: QUESTION_INTRO_MS,
      paused: { waitingFor: [{ nickname: 'Bob' }] },
    });
    vi.advanceTimersByTime(QUESTION_INTRO_MS * 3);
    expect(game.phase).toBe('QUESTION_INTRO');
  });

  it('is a no-op when not paused', () => {
    joinAll('Alice');
    toAnswering();
    game.resume();
    expect(game.paused).toBe(false);
    expect(rec.sent.some((s) => s.event === 'game:resuming')).toBe(false);
  });

  it('kicking the missing player resumes the game', () => {
    const [alice, bob] = joinAll('Alice', 'Bob');
    toAnswering();
    game.disconnect(bob!.socketId!);
    vi.advanceTimersByTime(PAUSE_GRACE_MS);
    game.kick(bob!.id);
    expect(rec.last('game:resuming', 'all')).toEqual({ inMs: RESUME_COUNTDOWN_MS });
    vi.advanceTimersByTime(RESUME_COUNTDOWN_MS);
    answerRight(alice!);
    expect(game.phase).toBe('REVEAL');
  });

  it('enters the next question already paused if someone dropped during the reveal', () => {
    const [alice, bob] = joinAll('Alice', 'Bob');
    toAnswering();
    answerRight(alice!);
    answerRight(bob!);
    game.disconnect(bob!.socketId!); // REVEAL: no pause, the host sees Bob offline
    vi.advanceTimersByTime(10_000);
    expect(game.phase).toBe('REVEAL');
    expect(game.paused).toBe(false);
    const players = (rec.last('lobby:players', 'host') as LobbyPlayersPayload).players;
    expect(players.find((p) => p.id === bob!.id)?.offline).toBe(true);
    expect(players.find((p) => p.id === alice!.id)?.offline).toBeUndefined();

    game.next(); // LEADERBOARD
    expect(game.paused).toBe(false);
    game.next(); // question 2
    expect(game.paused).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(game.phase).toBe('QUESTION_INTRO');

    game.rejoin(bob!.sessionToken, 'sock-bob-2');
    vi.advanceTimersByTime(RESUME_COUNTDOWN_MS + QUESTION_INTRO_MS);
    expect(game.phase).toBe('ANSWERING');
    expect(state().remainingMs).toBe(CLASSIC_QUIZ.questions[1]!.timeLimitSec * 1000);
  });

  it('host « Suivant » / end during a pause skip it', () => {
    const [, bob] = joinAll('Alice', 'Bob');
    toAnswering();
    game.disconnect(bob!.socketId!);
    vi.advanceTimersByTime(PAUSE_GRACE_MS);
    game.next();
    expect(game.phase).toBe('REVEAL');
    expect(game.paused).toBe(false);
    expect(state().paused).toBeUndefined();
    game.end();
    expect(game.phase).toBe('ENDED');
  });

  describe('nickname takeover (session lost)', () => {
    it('takes the place of a disconnected player only, keeping everything', () => {
      const [alice, bob] = joinAll('Alice', 'Bob');
      toAnswering();
      answerRight(alice!);
      answerRight(bob!);
      const { totalScore, streak, avatar, sessionToken } = bob!;
      expect(totalScore).toBeGreaterThan(0);

      // Bob is connected: his nickname is still taken; unknown nicknames can't join any more.
      expectGameError(() => game.reclaim('bob', 'sock-x'), 'NICKNAME_TAKEN');
      expectGameError(() => game.reclaim('Zoé', 'sock-x'), 'GAME_ALREADY_STARTED');
      expectGameError(() => game.join('Zoé', 'sock-x'), 'GAME_ALREADY_STARTED');

      game.disconnect(bob!.socketId!);
      const back = game.reclaim(' BOB ', 'sock-other-phone');
      expect(back).toBe(bob);
      expect(back).toMatchObject({ totalScore, streak, avatar, socketId: 'sock-other-phone' });
      // The lost phone's session is revoked.
      expect(back.sessionToken).not.toBe(sessionToken);
      expectGameError(() => game.rejoin(sessionToken, 'sock-old'), 'SESSION_NOT_FOUND');
      expect(game.players.size).toBe(2);
    });

    it('resumes a paused game like any reconnection', () => {
      const [, bob] = joinAll('Alice', 'Bob');
      toAnswering();
      game.disconnect(bob!.socketId!);
      vi.advanceTimersByTime(PAUSE_GRACE_MS);
      const back = game.reclaim('Bob', 'sock-new');
      game.resync(back);
      expect(rec.last('game:resuming', 'all')).toEqual({ inMs: RESUME_COUNTDOWN_MS });
      expect(rec.last('question:prompt', 'sock-new')).toMatchObject({ index: 0 });
    });

    it('is not possible in the lobby nor once the game is over', () => {
      const [bob] = joinAll('Bob');
      game.disconnect(bob!.socketId!);
      expectGameError(() => game.reclaim('Bob', 'sock-x'), 'GAME_ALREADY_STARTED');
      game.end();
      expectGameError(() => game.reclaim('Bob', 'sock-x'), 'GAME_ALREADY_STARTED');
    });
  });

  it('works with every question type: same points with or without a pause', () => {
    const play = (withPause: boolean) => {
      const g = new Game('111111', DEMO_QUIZ, recorder().transport);
      const [alice, bob] = ['Alice', 'Bob'].map((n) => g.join(n, `s-${n}`));
      let bobSocket = 's-Bob';
      g.start();
      for (let i = 0; i < DEMO_QUIZ.questions.length; i++) {
        vi.advanceTimersByTime(QUESTION_INTRO_MS + 1_000);
        if (withPause) {
          g.disconnect(bobSocket);
          vi.advanceTimersByTime(PAUSE_GRACE_MS + 5_000);
          expect(g.paused).toBe(true);
          expectGameError(
            () => g.answer(alice!.id, i, rightAnswer(g.currentQuestion!)),
            'GAME_PAUSED',
          );
          bobSocket = `s-Bob-${i}`;
          g.rejoin(bob!.sessionToken, bobSocket);
          vi.advanceTimersByTime(RESUME_COUNTDOWN_MS);
        }
        vi.advanceTimersByTime(1_000);
        g.answer(alice!.id, i, rightAnswer(g.currentQuestion!));
        vi.advanceTimersByTime(500);
        g.answer(bob!.id, i, rightAnswer(g.currentQuestion!));
        expect(g.phase).toBe('REVEAL');
        g.next();
        g.next();
      }
      const scores = [alice!.totalScore, bob!.totalScore];
      g.dispose();
      return scores;
    };
    expect(play(true)).toEqual(play(false));
  });

  it('team mode: team scores identical with or without a pause', () => {
    const play = (withPause: boolean) => {
      const r = recorder();
      const g = new Game('222222', CLASSIC_QUIZ, r.transport, {}, { mode: 'teams' });
      const [r1, r2, b1] = ['R1', 'R2', 'B1'].map((n) => g.join(n, `s-${n}`));
      g.setTeam(r1!.id, 0);
      g.setTeam(r2!.id, 0);
      g.setTeam(b1!.id, 1);
      g.start();
      vi.advanceTimersByTime(QUESTION_INTRO_MS + 2_000);
      if (withPause) {
        g.disconnect('s-R2');
        vi.advanceTimersByTime(PAUSE_GRACE_MS + 10_000);
        g.rejoin(r2!.sessionToken, 's-R2-2');
        vi.advanceTimersByTime(RESUME_COUNTDOWN_MS);
      }
      for (const p of [r1!, b1!, r2!]) {
        vi.advanceTimersByTime(700);
        g.answer(p.id, 0, rightAnswer(g.currentQuestion!));
      }
      g.next();
      const teams = (r.last('leaderboard', 'host') as StandingsPayload).teams;
      g.dispose();
      return teams;
    };
    const normal = play(false);
    expect(normal?.every((t) => t.score > 0)).toBe(true);
    expect(play(true)).toEqual(normal);
  });
});
