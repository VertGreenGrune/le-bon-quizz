import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  JokerType,
  Question,
  Quiz,
  ServerToClientEvents,
  StandingsPayload,
} from '@lbq/shared';
import { Game, type GameSettings, type GameTransport, type Player } from './Game.js';

// T41: the leaderboard tells what each player / team earned on the question just played.

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

const mcq = (text: string): Question => ({
  text,
  type: 'MCQ',
  timeLimitSec: 20,
  basePoints: 1000,
  choices: [
    { text: 'Bon', isCorrect: true },
    { text: 'Faux', isCorrect: false },
  ],
});

/** 3 MCQ of 20 s / 1000 pts, choice 0 right: an instant right answer = 1000 points. */
const quiz: Quiz = { id: 'gained', title: 'Gains', questions: [1, 2, 3].map((i) => mcq(`Q${i}`)) };
const RIGHT = { choiceIndex: 0 };
const WRONG = { choiceIndex: 1 };

describe('leaderboard gains (T41)', () => {
  let rec: ReturnType<typeof recorder>;
  let game: Game;

  const create = (settings: Partial<GameSettings> = {}) => {
    rec = recorder();
    game = new Game(
      '123456',
      quiz,
      rec.transport,
      {},
      { mode: 'solo', allAnsweredGraceMs: 0, ...settings },
    );
  };

  beforeEach(() => {
    vi.useFakeTimers(); // Date.now() frozen: every answer is instant (full points)
    create();
  });

  afterEach(() => {
    game.dispose();
    vi.useRealTimers();
  });

  const joinAll = (...names: string[]) => names.map((n) => game.join(n, `sock-${n}`)) as Player[];
  const answer = (p: Player, input: object) =>
    game.answer(p.id, game.questionIndex, input as { choiceIndex: number });
  /** QUESTION_INTRO → ANSWERING (« Passer », whatever the intro length). */
  const toAnswering = () => {
    game.next();
    expect(game.phase).toBe('ANSWERING');
  };
  /** REVEAL → LEADERBOARD. */
  const toLeaderboard = () => {
    if (game.phase === 'ANSWERING') game.next();
    game.next();
    expect(game.phase).toBe('LEADERBOARD');
  };
  const board = () => rec.last('leaderboard', 'host') as StandingsPayload;
  const gains = () => Object.fromEntries(board().top.map((p) => [p.nickname, p.gained]));

  it('gives each player the points of the question just played, +0 without an answer', () => {
    const [alice, bob] = joinAll('Alice', 'Bob', 'Chloé');
    game.start();
    toAnswering();
    answer(alice!, RIGHT);
    answer(bob!, WRONG);
    toLeaderboard();
    expect(gains()).toEqual({ Alice: 1000, Bob: 0, Chloé: 0 });

    game.next();
    toAnswering();
    answer(bob!, RIGHT);
    toLeaderboard();
    // Only this question's points (Alice's earlier 1000 isn't a gain any more).
    expect(gains()).toEqual({ Alice: 0, Bob: 1000, Chloé: 0 });
    expect(board().top.find((p) => p.nickname === 'Alice')?.score).toBe(1000);
  });

  it('is in the host resync of the leaderboard, never in the podium', () => {
    const [alice] = joinAll('Alice');
    game.start();
    toAnswering();
    answer(alice!, RIGHT);
    toLeaderboard();
    rec.sent.length = 0;
    game.resyncHost('host-2');
    const resent = rec.last('leaderboard', 'host-2') as StandingsPayload;
    expect(resent.top[0]).toMatchObject({ nickname: 'Alice', gained: 1000 });

    for (let q = 1; q < quiz.questions.length; q++) {
      game.next();
      toAnswering();
      answer(alice!, RIGHT);
      toLeaderboard();
    }
    game.next();
    expect(game.phase).toBe('PODIUM');
    const podium = rec.last('podium', 'all') as StandingsPayload;
    expect(podium.top[0]).not.toHaveProperty('gained');
  });

  it('counts the jokers: Double ou rien lost and a Voleur make it negative', () => {
    create({ jokers: true });
    const [alice, bob] = joinAll('Alice', 'Bob');
    const hand = (p: Player, jokers: JokerType[]) => game.jokers!.setHand(p.id, jokers);
    game.start();
    toAnswering();
    answer(alice!, RIGHT);
    answer(bob!, RIGHT);
    toLeaderboard();
    expect(gains()).toEqual({ Alice: 1000, Bob: 1000 });

    game.next();
    hand(alice!, ['thief']);
    hand(bob!, ['double']);
    game.useJoker(alice!.id, game.questionIndex, 'thief', bob!.id);
    game.useJoker(bob!.id, game.questionIndex, 'double');
    toAnswering();
    answer(alice!, RIGHT);
    answer(bob!, WRONG);
    toLeaderboard();
    // Bob: −500 (Double lost) then −50 stolen (10 % of 500); Alice: 1000 + streak 100 + 50.
    expect(gains()).toEqual({ Alice: 1150, Bob: -550 });
    expect(board().top.map((p) => [p.nickname, p.score])).toEqual([
      ['Alice', 2150],
      ['Bob', 450],
    ]);
  });

  it('team mode: each team gets the change of its score too', () => {
    create({ mode: 'teams', teamCount: 2 });
    const [alice, bob, chloe] = joinAll('Alice', 'Bob', 'Chloé');
    game.setTeam(alice!.id, 0);
    game.setTeam(bob!.id, 0);
    game.setTeam(chloe!.id, 1);
    game.start();
    toAnswering();
    answer(alice!, RIGHT);
    answer(bob!, WRONG);
    answer(chloe!, RIGHT);
    toLeaderboard();
    expect(board().teams?.map((t) => [t.name, t.score, t.gained])).toEqual([
      ['Équipe Bleue', 1000, 1000],
      ['Équipe Rouge', 500, 500],
    ]);
  });
});
