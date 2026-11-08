import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  QuizSchema,
  type GameStatePayload,
  type LobbyPlayersPayload,
  type Quiz,
  type ServerToClientEvents,
} from '@lbq/shared';
import { type GameTransport } from './Game.js';
import { GameError } from './errors.js';
import { ENDED_GAME_TTL_MS, GameManager } from './GameManager.js';
import { introOf, rightAnswer } from './testing.js';

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

const quiz = (id: string, title: string): Quiz =>
  QuizSchema.parse({
    id,
    title,
    questions: [
      {
        type: 'MCQ',
        text: `${title} : 1 + 1 ?`,
        timeLimitSec: 20,
        choices: [
          { text: '2', isCorrect: true },
          { text: '3', isCorrect: false },
        ],
      },
    ],
  });

const FIRST = quiz('first', 'Premier quiz');
const SECOND = quiz('second', 'Deuxième quiz');

/** Plays the one-question quiz to the podium: every player answers right. */
function playToPodium(game: ReturnType<GameManager['get']>) {
  game.start();
  vi.advanceTimersByTime(introOf(game));
  for (const p of game.players.values()) game.answer(p.id, 0, rightAnswer(game.quiz.questions[0]!));
  vi.advanceTimersByTime(5000);
  expect(game.phase).toBe('REVEAL');
  game.next(); // LEADERBOARD
  game.next(); // PODIUM
  expect(game.phase).toBe('PODIUM');
}

function expectGameError(fn: () => unknown, code: string) {
  expect(fn).toThrow(GameError);
  try {
    fn();
  } catch (err) {
    expect((err as GameError).code).toBe(code);
  }
}

describe('« Quiz suivant » — next quiz in the same room (T47)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(mode: 'solo' | 'teams' = 'solo') {
    const rec = recorder();
    const games = new GameManager();
    const ended: string[] = [];
    const game = games.create(
      FIRST,
      () => rec.transport,
      { onEnded: (g) => ended.push(g.quiz.title) },
      { mode, teamCount: 3, hostUserId: 'host-1' },
    );
    game.hostConnected('tv');
    const alice = game.join('Alice', 's-alice', 'batman');
    const bob = game.join('Bob', 's-bob', 'robin');
    return { rec, games, game, alice, bob, ended };
  }

  it('keeps the PIN, the tokens and the players, scores start again (from the PODIUM)', () => {
    const { rec, games, game, alice, bob, ended } = setup();
    const remoteToken = game.remoteTokenFor();
    game.remoteConnected('remote');
    playToPodium(game);
    expect(alice.totalScore).toBeGreaterThan(0);
    rec.sent.length = 0;

    const next = games.nextRound(game.pin, SECOND, { onEnded: (g) => ended.push(g.quiz.title) });
    // The previous quiz was ended (and saved) once, and the new one replaces it under the PIN.
    expect(ended).toEqual(['Premier quiz']);
    expect(game.phase).toBe('ENDED');
    expect(games.get(game.pin)).toBe(next);
    expect(next.pin).toBe(game.pin);
    expect(next.hostToken).toBe(game.hostToken);
    expect(next.hostUserId).toBe('host-1');
    expect(() => next.assertRemote(remoteToken)).not.toThrow();
    expect(next.phase).toBe('LOBBY');
    expect(next.round).toBe(2);

    const a = next.players.get(alice.id)!;
    expect(a).toMatchObject({
      nickname: 'Alice',
      avatar: 'batman',
      sessionToken: alice.sessionToken,
      socketId: 's-alice',
      totalScore: 0,
      correctCount: 0,
      streak: 0,
      lastResult: null,
    });
    expect(next.players.get(bob.id)?.totalScore).toBe(0);
    // A player's old session token still works with the new quiz.
    expect(next.rejoin(bob.sessionToken, 's-bob2').id).toBe(bob.id);

    // Everyone hears about the new lobby, the TV and the remote keep counting as connected.
    const state = rec.last('game:state', 'all') as GameStatePayload;
    expect(state).toMatchObject({
      phase: 'LOBBY',
      questionIndex: -1,
      round: 2,
      quizTitle: 'Deuxième quiz',
    });
    expect((rec.last('lobby:players') as LobbyPlayersPayload).players).toHaveLength(2);
    expect(rec.last('remote:status')).toEqual({ remotes: 1 });
    expect(next.hostGoneSince).toBeNull();

    // The new quiz plays and is saved on its own.
    playToPodium(next);
    next.end();
    expect(ended).toEqual(['Premier quiz', 'Deuxième quiz']);
  });

  it('works from ENDED, lets new players join, and leaves kicked players out', () => {
    const { games, game, alice, bob, ended } = setup();
    game.start();
    game.kick(bob.id);
    game.end();
    expect(ended).toHaveLength(1);

    const next = games.nextRound(game.pin, SECOND);
    expect(ended).toHaveLength(1); // not saved twice
    expect([...next.players.keys()]).toEqual([alice.id]);
    expect(next.join('Chloé', 's-chloe').nickname).toBe('Chloé');
    expect(next.statePayload().round).toBe(2);
    next.end(); // a lobby that never started isn't saved
    expect(ended).toHaveLength(1);
    expect(games.nextRound(game.pin, FIRST).round).toBe(3);
  });

  it('is refused while a quiz is being played', () => {
    const { games, game } = setup();
    expectGameError(() => games.nextRound(game.pin, SECOND), 'GAME_ALREADY_STARTED');
    game.start();
    expectGameError(() => games.nextRound(game.pin, SECOND), 'GAME_ALREADY_STARTED');
    expect(games.get(game.pin)).toBe(game);
  });

  it('team mode: a player keeps a team that still exists', () => {
    const { games, game, alice, bob } = setup('teams');
    game.setTeam(alice.id, 0);
    game.setTeam(bob.id, 2);
    game.start();
    game.end();
    const two = games.nextRound(game.pin, SECOND, undefined, { mode: 'teams', teamCount: 2 });
    expect(two.players.get(alice.id)?.teamId).toBe(0);
    expect(two.players.get(bob.id)?.teamId).toBeNull(); // the yellow team is gone
    two.end();
    const solo = games.nextRound(game.pin, SECOND);
    expect(solo.mode).toBe('solo');
    expect(solo.players.get(alice.id)?.teamId).toBeNull();
  });

  it('keeps an ENDED room while its host screen is connected', () => {
    const { games, game } = setup();
    game.end();
    vi.advanceTimersByTime(ENDED_GAME_TTL_MS + 1000);
    games.sweep();
    expect(games.find(game.pin)).toBe(game);
    game.hostDisconnected('tv');
    games.sweep();
    expect(games.find(game.pin)).toBeUndefined();
  });

  it('the first quiz of a room has no round in its state', () => {
    const { game } = setup();
    expect(game.statePayload()).not.toHaveProperty('round');
    expect(game.statePayload()).not.toHaveProperty('quizTitle');
  });
});
