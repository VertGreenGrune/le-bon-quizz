import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AVATARS,
  DEMO_QUIZ,
  isAvatarId,
  type LobbyPlayersPayload,
  type LobbyTeamsPayload,
  type QuestionRevealPayload,
  type ServerToClientEvents,
  type StandingsPayload,
} from '@lbq/shared';
import { Game, type GameTransport } from './Game.js';
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
  const last = <T>(event: Sent['event']) =>
    sent.filter((s) => s.event === event).at(-1)?.payload as T;
  return { transport, last };
}

describe('Game avatars', () => {
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

  it('keeps the chosen avatar, picks a free random one when missing', () => {
    const alice = game.join('Alice', 's1', 'fox');
    expect(alice.avatar).toBe('fox');
    // Two players may share an avatar.
    expect(game.join('Bob', 's2', 'fox').avatar).toBe('fox');
    expect(game.takenAvatars()).toEqual(['fox']);

    for (let i = 0; i < 20; i++) {
      const p = game.join(`P${i}`, `sp${i}`);
      expect(isAvatarId(p.avatar)).toBe(true);
    }
    // Random picks avoid the avatars already taken while some are free (24 avatars, 22 players).
    expect(new Set(game.takenAvatars()).size).toBe(21);
  });

  it('falls back to any avatar once all are taken', () => {
    AVATARS.forEach((a, i) => game.join(`P${i}`, `s${i}`, a.id));
    expect(isAvatarId(game.join('Extra', 'sx').avatar)).toBe(true);
  });

  it('sends the avatar in the lobby, the leaderboard, the podium and the standings', () => {
    const alice = game.join('Alice', 's1', 'unicorn');
    game.join('Bob', 's2', 'trex');
    expect(rec.last<LobbyPlayersPayload>('lobby:players').players).toEqual([
      { id: alice.id, nickname: 'Alice', avatar: 'unicorn' },
      { id: expect.any(String), nickname: 'Bob', avatar: 'trex' },
    ]);

    game.start();
    game.next(); // → ANSWERING
    game.answer(alice.id, 0, rightAnswer(DEMO_QUIZ.questions[0]!));
    game.next(); // → REVEAL
    game.next(); // → LEADERBOARD
    const board = rec.last<StandingsPayload>('leaderboard');
    expect(board.top.map((p) => [p.nickname, p.avatar])).toEqual([
      ['Alice', 'unicorn'],
      ['Bob', 'trex'],
    ]);

    game.end();
    expect(game.standings().map((s) => [s.nickname, s.avatar])).toEqual([
      ['Alice', 'unicorn'],
      ['Bob', 'trex'],
    ]);
  });

  it('podium: avatars of the top players', () => {
    const alice = game.join('Alice', 's1', 'owl');
    game.join('Bob', 's2', 'dog'); // never answers
    game.start();
    DEMO_QUIZ.questions.forEach((q, i) => {
      game.next(); // → ANSWERING
      game.answer(alice.id, i, rightAnswer(q));
      game.next(); // → REVEAL
      game.next(); // → LEADERBOARD
      game.next(); // → next question / PODIUM
    });
    expect(game.phase).toBe('PODIUM');
    expect(rec.last<StandingsPayload>('podium').top).toEqual([
      { nickname: 'Alice', avatar: 'owl', score: alice.totalScore },
      { nickname: 'Bob', avatar: 'dog', score: 0 },
    ]);
  });

  it('slider reveal: the closest guess carries its avatar', () => {
    const sliderIndex = DEMO_QUIZ.questions.findIndex((q) => q.type === 'SLIDER');
    const quiz = { ...DEMO_QUIZ, questions: [DEMO_QUIZ.questions[sliderIndex]!] };
    game.dispose();
    game = new Game('123456', quiz, rec.transport);
    const alice = game.join('Alice', 's1', 'bee');
    game.start();
    game.next();
    game.answer(alice.id, 0, rightAnswer(quiz.questions[0]!));
    expect(rec.last<QuestionRevealPayload>('question:reveal').closest).toMatchObject({
      nickname: 'Alice',
      avatar: 'bee',
    });
  });

  it('team mode: members carry their avatar', () => {
    game.dispose();
    game = new Game('123456', DEMO_QUIZ, rec.transport, {}, { mode: 'teams' });
    const alice = game.join('Alice', 's1', 'cat');
    game.setTeam(alice.id, 1);
    const teams = rec.last<LobbyTeamsPayload>('lobby:teams').teams;
    expect(teams.find((t) => t.id === 1)!.members).toEqual([
      { id: alice.id, nickname: 'Alice', avatar: 'cat' },
    ]);
  });
});
