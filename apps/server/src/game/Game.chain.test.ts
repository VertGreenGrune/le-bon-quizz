import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  QuizSchema,
  type GameStatePayload,
  type Quiz,
  type ServerToClientEvents,
} from '@lbq/shared';
import { GameManager } from './GameManager.js';
import type { Game, GameTransport } from './Game.js';
import { GameError } from './errors.js';
import { rightAnswer } from './testing.js';

type Sent = { to: string; event: keyof ServerToClientEvents; payload: unknown };

function recorder() {
  const sent: Sent[] = [];
  const transport: GameTransport = {
    toAll: (event, payload) => void sent.push({ to: 'all', event, payload }),
    toHost: (event, payload) => void sent.push({ to: 'host', event, payload }),
    toSocket: (to, event, payload) => void sent.push({ to, event, payload }),
    detachSocket: () => {},
  };
  return { sent, transport };
}

const quiz = (id: string, title: string): Quiz =>
  QuizSchema.parse({
    id,
    title,
    questions: [
      {
        type: 'MCQ',
        text: `${title} ?`,
        timeLimitSec: 20,
        choices: [
          { text: 'Oui', isCorrect: true },
          { text: 'Non', isCorrect: false },
        ],
      },
    ],
  });

const FIRST = quiz('first', 'Premier');
const SECOND = quiz('second', 'Second');

/** Plays the one-question game to the podium, Alice right, Bob silent. */
function playToPodium(game: Game, aliceId: string) {
  game.start();
  game.next(); // intro → answering
  game.answer(aliceId, 0, rightAnswer(game.currentQuestion!));
  game.next(); // → reveal
  game.next(); // → leaderboard
  game.next(); // → podium
  expect(game.phase).toBe('PODIUM');
}

describe('« 🔁 Enchaîner un quiz » (T48)', () => {
  let rec: ReturnType<typeof recorder>;
  let games: GameManager;
  let onEnded: ReturnType<typeof vi.fn<(game: Game) => void>>;

  beforeEach(() => {
    vi.useFakeTimers();
    rec = recorder();
    games = new GameManager();
    onEnded = vi.fn<(game: Game) => void>();
  });
  afterEach(() => vi.useRealTimers());

  const create = (settings: Parameters<GameManager['create']>[3] = { mode: 'solo' }) =>
    games.create(FIRST, () => rec.transport, { onEnded }, { ownerId: 'host-1', ...settings });

  it('keeps the PIN, the TV, the remote and the players, with scores at 0', () => {
    const first = create();
    first.hostConnected('tv');
    const remoteToken = first.remoteTokenFor();
    first.remoteConnected('remote');
    const alice = first.join('Alice', 'a', 'joker');
    const bob = first.join('Bob', 'b', 'robin');
    playToPodium(first, alice.id);
    expect(first.players.get(alice.id)!.totalScore).toBeGreaterThan(0);

    rec.sent.length = 0;
    const second = games.chain(first.pin, SECOND, () => rec.transport, { onEnded });

    expect(onEnded).toHaveBeenCalledTimes(1); // the first quiz is saved
    expect(onEnded.mock.calls[0]![0]).toBe(first);
    expect(games.get(first.pin)).toBe(second);
    expect(second.quiz.title).toBe('Second');
    expect(second.phase).toBe('LOBBY');
    expect(second.round).toBe(2);
    expect(second.hostToken).toBe(first.hostToken);
    expect(() => second.assertRemote(remoteToken)).not.toThrow();
    expect(second.hostGoneSince).toBeNull();

    const a = second.players.get(alice.id)!;
    expect(a).toMatchObject({
      nickname: 'Alice',
      avatar: 'joker',
      socketId: 'a',
      sessionToken: alice.sessionToken,
      totalScore: 0,
      correctCount: 0,
      streak: 0,
    });
    expect(second.findBySession(bob.sessionToken)?.id).toBe(bob.id);

    // Clients learn it from the new state first (round 2, LOBBY), then the lobby.
    expect(rec.sent[0]).toMatchObject({ to: 'all', event: 'game:state' });
    expect(rec.sent[0]!.payload as GameStatePayload).toMatchObject({
      phase: 'LOBBY',
      round: 2,
      questionIndex: -1,
    });
    expect(rec.sent.map((s) => s.event)).toContain('lobby:players');
    expect(rec.sent.map((s) => s.event)).toContain('remote:status');
    // The ENDED of the first quiz isn't broadcast: the phones go straight to the new lobby.
    expect(
      rec.sent.some(
        (s) => s.event === 'game:state' && (s.payload as GameStatePayload).phase === 'ENDED',
      ),
    ).toBe(false);

    // The chained game plays normally.
    second.start();
    expect(second.phase).toBe('QUESTION_INTRO');
  });

  it('is refused while a quiz is being played', () => {
    const first = create();
    first.join('Alice', 'a');
    first.start();
    expect(() => games.chain(first.pin, SECOND, () => rec.transport)).toThrow(GameError);
    expect(games.get(first.pin)).toBe(first);
    expect(onEnded).not.toHaveBeenCalled();
  });

  it('after « Terminer » (ENDED): no second save, round goes on', () => {
    const first = create();
    const alice = first.join('Alice', 'a');
    playToPodium(first, alice.id);
    first.end();
    expect(onEnded).toHaveBeenCalledTimes(1);
    const second = games.chain(first.pin, SECOND, () => rec.transport, { onEnded });
    expect(onEnded).toHaveBeenCalledTimes(1);
    playToPodium(second, alice.id);
    const third = games.chain(first.pin, FIRST, () => rec.transport, { onEnded });
    expect(third.round).toBe(3);
    expect(third.statePayload().round).toBe(3);
  });

  it('keeps the teams that still exist and leaves kicked players out', () => {
    const first = create({ mode: 'teams', teamCount: 3 });
    const alice = first.join('Alice', 'a');
    const bob = first.join('Bob', 'b');
    const chloe = first.join('Chloé', 'c');
    first.setTeam(alice.id, 0);
    first.setTeam(bob.id, 2);
    first.setTeam(chloe.id, 1);
    first.start();
    first.kick(chloe.id);
    first.next();
    first.next();
    first.next();
    first.next();
    expect(first.phase).toBe('PODIUM');

    const second = games.chain(first.pin, SECOND, () => rec.transport, undefined, {
      mode: 'teams',
      teamCount: 2,
    });
    expect(second.players.get(alice.id)!.teamId).toBe(0);
    expect(second.players.get(bob.id)!.teamId).toBeNull(); // Équipe Jaune is gone
    expect(second.players.has(chloe.id)).toBe(false);
  });

  it('a player offline at the end can still come back with their session', () => {
    const first = create();
    const alice = first.join('Alice', 'a');
    playToPodium(first, alice.id);
    first.disconnect('a');
    const second = games.chain(first.pin, SECOND, () => rec.transport);
    expect(second.players.get(alice.id)!.socketId).toBeNull();
    second.rejoin(alice.sessionToken, 'a2');
    expect(second.players.get(alice.id)!.socketId).toBe('a2');
  });
});
