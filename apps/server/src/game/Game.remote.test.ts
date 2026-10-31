import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { introOf } from './testing.js';
import {
  PAUSE_GRACE_MS,
  QUESTION_INTRO_MS,
  QuizSchema,
  RESUME_COUNTDOWN_MS,
  type GameStatePayload,
  type Quiz,
  type RemoteAnswerPayload,
  type ServerToClientEvents,
} from '@lbq/shared';
import { Game, type GameTransport, type Player } from './Game.js';
import { GameError } from './errors.js';

type Sent = { to: string; event: keyof ServerToClientEvents; payload: unknown };

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
  return { sent, detached, transport, last };
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

const EXPLANATION = 'Le saviez-vous ? Tim Burton a commencé chez Disney.';

/** Q0 MCQ with an explanation, Q1 « Dessine-moi », Q2 point sur l'image, Q3 sondage. */
const QUIZ: Quiz = QuizSchema.parse({
  id: 'remote',
  title: 'Télécommande',
  questions: [
    {
      type: 'MCQ',
      text: 'Qui a réalisé Beetlejuice ?',
      timeLimitSec: 20,
      explanation: EXPLANATION,
      choices: [
        { text: 'Tim Burton', isCorrect: true },
        { text: 'Sam Raimi', isCorrect: false },
      ],
    },
    { type: 'DRAW', text: 'Dessine !', timeLimitSec: 60, words: ['Licorne'] },
    {
      type: 'PIN',
      text: 'Où est Glenfinnan ?',
      timeLimitSec: 20,
      imageUrl: 'https://example.com/carte.png',
      zone: { x: 0.25, y: 0.5, radius: 0.1 },
    },
    {
      type: 'POLL',
      text: 'Ton dessert ?',
      timeLimitSec: 20,
      basePoints: 0,
      choices: [{ text: 'Tarte' }, { text: 'Glace' }],
    },
  ],
});

describe('« Télécommande » (host remote, T39)', () => {
  let rec: ReturnType<typeof recorder>;
  let game: Game;

  beforeEach(() => {
    vi.useFakeTimers();
    rec = recorder();
    game = new Game('123456', QUIZ, rec.transport);
    game.hostConnected('tv');
  });

  afterEach(() => {
    game.dispose();
    vi.useRealTimers();
  });

  const joinAll = (...names: string[]): Player[] => names.map((n) => game.join(n, `sock-${n}`));
  const state = () => rec.last('game:state', 'all') as GameStatePayload;
  const toAnswering = () => {
    game.start();
    vi.advanceTimersByTime(introOf(game));
    expect(game.phase).toBe('ANSWERING');
  };

  describe('pairing', () => {
    it('creates the token lazily, keeps it, and refuses any other one', () => {
      expectGameError(() => game.assertRemote('anything'), 'UNAUTHORIZED');
      const token = game.remoteTokenFor();
      expect(token).toMatch(/^[\w-]{32}$/); // 24 random bytes, base64url
      expect(token).not.toBe(game.hostToken);
      expect(game.remoteTokenFor()).toBe(token);
      game.assertRemote(token);
      expectGameError(() => game.assertRemote(game.hostToken), 'UNAUTHORIZED');
    });

    it('revoking gives a new token and drops the paired remotes', () => {
      const old = game.remoteTokenFor();
      game.remoteConnected('remote-1');
      game.remoteConnected('remote-2');
      expect(rec.last('remote:status', 'host')).toEqual({ remotes: 2 });

      const fresh = game.remoteTokenFor(true);
      expect(fresh).not.toBe(old);
      expectGameError(() => game.assertRemote(old), 'UNAUTHORIZED');
      game.assertRemote(fresh);
      for (const sid of ['remote-1', 'remote-2']) {
        expect(rec.sent).toContainEqual({ to: sid, event: 'remote:revoked', payload: {} });
        expect(rec.detached).toContain(sid);
      }
      expect(rec.last('remote:status', 'host')).toEqual({ remotes: 0 });
      // A dropped remote that disconnects afterwards changes nothing.
      const count = rec.sent.length;
      game.remoteDisconnected('remote-1');
      expect(rec.sent.length).toBe(count);
    });

    it('a remote never counts as the TV: the TV dropping still pauses the game', () => {
      joinAll('Alice');
      game.remoteTokenFor();
      game.remoteConnected('remote');
      toAnswering();
      game.hostDisconnected('tv');
      vi.advanceTimersByTime(PAUSE_GRACE_MS + 10);
      expect(state().paused).toMatchObject({ hostMissing: true });
      expect(game.hostGoneSince).not.toBeNull();
      // A remote (re)connecting doesn't end the pause, the TV does.
      game.remoteConnected('remote-2');
      expect(state().paused?.hostMissing).toBe(true);
      game.hostConnected('tv-2');
      expect(state().paused).toMatchObject({ hostMissing: false, waitingFor: [] });
    });

    it('resyncs a remote like the TV, plus the answer and the remote count', () => {
      joinAll('Alice');
      game.start();
      game.remoteTokenFor();
      game.remoteConnected('remote');
      rec.sent.length = 0;
      game.resyncRemote('remote');
      const events = rec.sent.filter((s) => s.to === 'remote').map((s) => s.event);
      expect(events[0]).toBe('game:state');
      expect(events).toEqual(
        expect.arrayContaining([
          'lobby:players',
          'question:show',
          'remote:status',
          'remote:answer',
        ]),
      );
      expect(rec.last('remote:answer', 'remote')).toMatchObject({
        index: 0,
        answer: ['Tim Burton'],
      });
    });

    it('relays the TV controls to the TV sockets only', () => {
      game.remoteConnected('remote');
      game.tvControl('mute');
      game.tvControl('replay');
      const controls = rec.sent.filter((s) => s.event === 'tv:control');
      expect(controls).toEqual([
        { to: 'tv', event: 'tv:control', payload: { action: 'mute' } },
        { to: 'tv', event: 'tv:control', payload: { action: 'replay' } },
      ]);
    });
  });

  describe('remote:answer', () => {
    const answers = () =>
      rec.sent
        .filter((s) => s.event === 'remote:answer')
        .map((s) => s.payload as RemoteAnswerPayload);

    it('goes to the remotes only, at each question, with the right answer per type', () => {
      const [alice, bob] = joinAll('Alice', 'Bob');
      game.remoteTokenFor();
      game.remoteConnected('remote');
      game.start();
      expect(answers()).toEqual([{ index: 0, answer: ['Tim Burton'], explanation: EXPLANATION }]);

      // Q1 « Dessine-moi »: the word drawn when the question starts.
      game.next(); // ANSWERING
      game.next(); // REVEAL
      game.next(); // LEADERBOARD
      game.next(); // Q1 intro
      expect(answers().at(-1)).toEqual({ index: 1, answer: ['Licorne'] });

      // Q2 point sur l'image: the zone, with the picture.
      game.next();
      game.next();
      game.next();
      game.next();
      expect(answers().at(-1)).toEqual({
        index: 2,
        answer: ['Zone : à 25 % depuis la gauche, 50 % depuis le haut'],
        pin: { imageUrl: 'https://example.com/carte.png', zone: { x: 0.25, y: 0.5, radius: 0.1 } },
      });

      // Q3 sondage: no right answer.
      game.next();
      game.next();
      game.next();
      game.next();
      expect(answers().at(-1)).toEqual({ index: 3, answer: [] });

      // Only ever sent to the remote socket: never to the room, the TV room nor a phone.
      const targets = new Set(rec.sent.filter((s) => s.event === 'remote:answer').map((s) => s.to));
      expect([...targets]).toEqual(['remote']);
      for (const p of [alice!, bob!])
        expect(rec.sent.some((s) => s.to === p.socketId && s.event === 'remote:answer')).toBe(
          false,
        );
    });

    it('no answer nor explanation reaches the TV or the phones before the reveal', () => {
      joinAll('Alice', 'Bob');
      game.remoteTokenFor();
      game.remoteConnected('remote');
      game.start();
      vi.advanceTimersByTime(introOf(game));
      const leaked = rec.sent.filter(
        (s) =>
          s.to !== 'remote' &&
          (JSON.stringify(s.payload).includes(EXPLANATION) ||
            JSON.stringify(s.payload).includes('Tim Burton')),
      );
      // The TV gets the choices ('Tim Burton' is one of them) in question:show, but not which is right.
      expect(leaked.map((s) => s.event)).toEqual(['question:show']);
      expect(JSON.stringify(leaked[0]!.payload)).not.toContain(EXPLANATION);
    });

    it('is not sent when no remote is paired', () => {
      joinAll('Alice');
      game.start();
      expect(answers()).toEqual([]);
    });
  });

  describe('manual pause (« ⏸ Pause »)', () => {
    it('only during a question', () => {
      expectGameError(() => game.pauseByHost(), 'NOT_ANSWERING');
    });

    it('freezes the timer, refuses answers, then resumes after the 3-2-1', () => {
      const [alice] = joinAll('Alice', 'Bob');
      toAnswering();
      vi.advanceTimersByTime(5_000);
      game.pauseByHost();
      const paused = state();
      expect(paused.paused).toMatchObject({ byHost: true, waitingFor: [], hostMissing: false });
      expect(paused.remainingMs).toBe(15_000);
      expectGameError(() => game.answer(alice!.id, 0, { choiceIndex: 0 }), 'GAME_PAUSED');

      vi.advanceTimersByTime(60_000); // way past the time limit: still the same question
      expect(game.phase).toBe('ANSWERING');
      game.pauseByHost(); // no-op
      expect(state().paused?.byHost).toBe(true);

      game.resume();
      expect(rec.last('game:resuming', 'all')).toEqual({ inMs: RESUME_COUNTDOWN_MS });
      expect(state().paused?.byHost).toBeUndefined();
      vi.advanceTimersByTime(RESUME_COUNTDOWN_MS);
      expect(state().paused).toBeUndefined();
      expect(state().remainingMs).toBe(15_000);
      game.answer(alice!.id, 0, { choiceIndex: 0 });
    });

    it('gives the same points as without a pause', () => {
      const pointsAfter = (withPause: boolean): number => {
        const g = new Game('654321', QUIZ, recorder().transport);
        g.hostConnected('tv');
        const p = g.join('Alice', 'sock-a');
        g.start();
        vi.advanceTimersByTime(introOf(game) + 4_000);
        if (withPause) {
          g.pauseByHost();
          vi.advanceTimersByTime(30_000);
          g.resume();
          vi.advanceTimersByTime(RESUME_COUNTDOWN_MS);
        }
        vi.advanceTimersByTime(2_000);
        g.answer(p.id, 0, { choiceIndex: 0 });
        const score = p.totalScore;
        g.dispose();
        return score;
      };
      const plain = pointsAfter(false);
      expect(plain).toBeGreaterThan(0);
      expect(pointsAfter(true)).toBe(plain);
    });

    it('pauses the intro too', () => {
      joinAll('Alice');
      game.start();
      game.pauseByHost();
      vi.advanceTimersByTime(introOf(game) * 3);
      expect(game.phase).toBe('QUESTION_INTRO');
      game.resume();
      vi.advanceTimersByTime(RESUME_COUNTDOWN_MS + QUESTION_INTRO_MS);
      expect(game.phase).toBe('ANSWERING');
    });

    it('with a player missing: « Reprendre » keeps waiting, « Continuer sans » excuses them', () => {
      const [, bob] = joinAll('Alice', 'Bob');
      toAnswering();
      game.disconnect(bob!.socketId!);
      game.pauseByHost();
      expect(state().paused).toMatchObject({ byHost: true });
      expect(state().paused?.waitingFor.map((p) => p.nickname)).toEqual(['Bob']);

      game.resume(); // lifts the host's pause only
      expect(state().paused).toBeDefined();
      expect(state().paused?.byHost).toBeUndefined();
      expect(state().paused?.waitingFor.map((p) => p.nickname)).toEqual(['Bob']);
      vi.advanceTimersByTime(RESUME_COUNTDOWN_MS * 2);
      expect(state().paused).toBeDefined();

      game.resume(); // « Continuer sans Bob »
      vi.advanceTimersByTime(RESUME_COUNTDOWN_MS);
      expect(state().paused).toBeUndefined();
    });

    it('a player coming back during a host pause does not resume it', () => {
      const [, bob] = joinAll('Alice', 'Bob');
      toAnswering();
      game.pauseByHost();
      game.disconnect(bob!.socketId!);
      game.rejoin(bob!.sessionToken, 'sock-bob-2');
      vi.advanceTimersByTime(RESUME_COUNTDOWN_MS * 2);
      expect(state().paused?.byHost).toBe(true);
    });

    it('« Passer » during a host pause skips it', () => {
      joinAll('Alice');
      toAnswering();
      game.pauseByHost();
      game.next();
      expect(game.phase).toBe('REVEAL');
      game.next();
      game.next(); // next question: not paused
      expect(game.phase).toBe('QUESTION_INTRO');
      expect(state().paused).toBeUndefined();
    });
  });
});
