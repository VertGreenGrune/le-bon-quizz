import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  QuestionSchema,
  answerCancellable,
  answerText,
  jokerAvailability,
  type MatchQuestion,
  type PlayerResultPayload,
  type QuestionPromptPayload,
  type QuestionRevealPayload,
  type QuestionShowPayload,
  type Quiz,
  type ServerToClientEvents,
} from '@lbq/shared';
import { Game, type GameTransport, type Player } from './Game.js';
import { GameError } from './errors.js';
import { matchLinks, newMatch } from './questionTypes/match.js';
import { introOf } from './testing.js';

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

const PAIRS = [
  { left: { text: 'France' }, right: { text: 'Paris' } },
  { left: { text: 'Italie' }, right: { text: 'Rome' } },
  { left: { text: 'Espagne' }, right: { text: 'Madrid' } },
  {
    left: { imageUrl: 'http://localhost:3001/uploads/drapeau-pt.png' },
    right: { text: 'Lisbonne' },
  },
];

const match = (): MatchQuestion =>
  QuestionSchema.parse({
    type: 'MATCH',
    text: 'Associe chaque pays à sa capitale',
    pairs: PAIRS,
  }) as MatchQuestion;

describe('« Associer » (MATCH, T67)', () => {
  let rec: ReturnType<typeof recorder>;
  let game: Game;

  beforeEach(() => {
    vi.useFakeTimers();
    rec = recorder();
    const quiz: Quiz = { id: 'm', title: 'Capitales', questions: [match(), match()] };
    game = new Game('123456', quiz, rec.transport, {}, { mode: 'solo', allAnsweredGraceMs: 0 });
  });
  afterEach(() => {
    game.dispose();
    vi.useRealTimers();
  });

  const toAnswering = () => {
    game.start();
    vi.advanceTimersByTime(introOf(game));
    expect(game.phase).toBe('ANSWERING');
  };
  const prompt = () => rec.last('question:prompt') as QuestionPromptPayload;
  const same = (a: object, b: object) => JSON.stringify(a) === JSON.stringify(b);
  /** Right answer for the shown columns: per shown left, the shown right of the same pair. */
  const rightMatches = (p: QuestionPromptPayload) =>
    p.match!.left.map((l) => {
      const pair = PAIRS.find((x) => same(x.left, l))!;
      return p.match!.right.findIndex((r) => same(r, pair.right));
    });
  const shownRight = (p: QuestionPromptPayload, pair: number) =>
    p.match!.right.findIndex((r) => JSON.stringify(r) === JSON.stringify(PAIRS[pair]!.right));
  const shownLeft = (p: QuestionPromptPayload, pair: number) =>
    p.match!.left.findIndex((l) => JSON.stringify(l) === JSON.stringify(PAIRS[pair]!.left));

  it('schema: 3–6 different pairs, a text or a picture on each side', () => {
    expect(match().timeLimitSec).toBe(45);
    const base = { type: 'MATCH', text: 'Q' };
    expect(QuestionSchema.safeParse({ ...base, pairs: PAIRS.slice(0, 2) }).success).toBe(false);
    expect(
      QuestionSchema.safeParse({ ...base, pairs: [...PAIRS.slice(0, 3), PAIRS[0]] }).success,
    ).toBe(false);
    expect(
      QuestionSchema.safeParse({
        ...base,
        pairs: [...PAIRS.slice(0, 3), { left: {}, right: { text: 'X' } }],
      }).success,
    ).toBe(false);
    expect(answerCancellable('MATCH')).toBe(true);
    expect(jokerAvailability('MATCH')).toMatchObject({ jokers: true, unavailable: ['fifty'] });
    expect(answerText(match())).toEqual([
      'France ↔ Paris',
      'Italie ↔ Rome',
      'Espagne ↔ Madrid',
      'image 4 (gauche) ↔ Lisbonne',
    ]);
  });

  it('shuffles both columns, never a partner straight across', () => {
    for (let seed = 0; seed < 30; seed++) {
      let x = seed + 1;
      const random = () => (x = (x * 9301 + 49297) % 233280) / 233280;
      const state = newMatch(4, random);
      expect([...state.left].sort()).toEqual([0, 1, 2, 3]);
      expect([...state.right].sort()).toEqual([0, 1, 2, 3]);
      expect(state.right.some((p, i) => p === state.left[i])).toBe(false);
    }
  });

  it('phones and TV get the same columns, never the pairs', () => {
    game.join('Alice', 'sock-a');
    toAnswering();
    const show = rec.last('question:show', 'host') as QuestionShowPayload;
    const p = prompt();
    expect(p.match).toEqual(show.match);
    expect(p.match!.left).toHaveLength(4);
    expect(new Set(p.match!.right.map((r) => r.text))).toEqual(
      new Set(['Paris', 'Rome', 'Madrid', 'Lisbonne']),
    );
    // Nothing tells which goes with which.
    expect(JSON.stringify(p)).not.toContain('pairs');
  });

  it('scores the share of right pairs; only all right is correct', () => {
    const alice = game.join('Alice', 'sock-a');
    const bob = game.join('Bob', 'sock-b');
    const chloe = game.join('Chloé', 'sock-c');
    toAnswering();
    const p = prompt();
    const right = rightMatches(p);
    game.answer(alice.id, 0, { matches: right });
    // Bob swaps two pairs: 2 / 4 right.
    const swapped = [...right];
    const a = shownLeft(p, 0);
    const b = shownLeft(p, 1);
    [swapped[a], swapped[b]] = [swapped[b]!, swapped[a]!];
    game.answer(bob.id, 0, { matches: swapped });
    // Chloé links only France → Paris.
    const partial = right.map(() => -1);
    partial[shownLeft(p, 0)] = shownRight(p, 0);
    game.answer(chloe.id, 0, { matches: partial });
    expect(game.phase).toBe('REVEAL');

    const result = (sock: string) => rec.last('player:result', sock) as PlayerResultPayload;
    expect(result('sock-a')).toMatchObject({ correct: true, pointsEarned: 1000 });
    expect(result('sock-a').match).toEqual({ right: 4, total: 4, yours: [0, 1, 2, 3] });
    expect(result('sock-b')).toMatchObject({ correct: false, pointsEarned: 500 });
    expect(result('sock-b').match).toMatchObject({ right: 2, total: 4 });
    expect(result('sock-c')).toMatchObject({ correct: false, pointsEarned: 250 });
    expect(result('sock-c').match!.yours).toEqual([0, -1, -1, -1]);

    const reveal = rec.last('question:reveal', 'host') as QuestionRevealPayload;
    expect(reveal.match!.pairs).toEqual(match().pairs);
    expect(reveal.match!.found).toEqual([2, 1, 2, 2]);
    expect(reveal.match!.answers.map((r) => [r.nickname, r.right])).toEqual([
      ['Alice', 4],
      ['Bob', 2],
      ['Chloé', 1],
    ]);
  });

  it('players without an answer are listed last at the reveal', () => {
    const alice = game.join('Alice', 'sock-a');
    game.join('Bob', 'sock-b');
    toAnswering();
    game.answer(alice.id, 0, { matches: rightMatches(prompt()) });
    game.next();
    const reveal = rec.last('question:reveal', 'host') as QuestionRevealPayload;
    expect(reveal.match!.answers.at(-1)).toMatchObject({ nickname: 'Bob', links: [], right: 0 });
    expect((rec.last('player:result', 'sock-b') as PlayerResultPayload).match).toEqual({
      right: 0,
      total: 4,
    });
  });

  it('refuses another kind, a wrong length or a right item linked twice', () => {
    const alice: Player = game.join('Alice', 'sock-a');
    toAnswering();
    const bad = (input: object) => () => game.answer(alice.id, 0, input as never);
    expect(bad({ order: [0, 1, 2] })).toThrow(GameError);
    expect(bad({ matches: [0, 1, 2] })).toThrow(GameError);
    expect(bad({ matches: [0, 0, 1, 2] })).toThrow(GameError);
    expect(() => matchLinks({ left: [0, 1, 2], right: [1, 2, 0] }, [0, 1, 5])).toThrow(GameError);
  });

  it('a cancelled answer can be given again', () => {
    const alice = game.join('Alice', 'sock-a');
    game.join('Bob', 'sock-b');
    toAnswering();
    const right = rightMatches(prompt());
    game.answer(alice.id, 0, { matches: right.map(() => -1) });
    game.unanswer(alice.id, 0);
    game.answer(alice.id, 0, { matches: right });
    game.next();
    expect(rec.last('player:result', 'sock-a')).toMatchObject({ correct: true });
  });

  it('a rejoining phone gets the same columns', () => {
    const alice = game.join('Alice', 'sock-a');
    game.join('Bob', 'sock-b');
    toAnswering();
    const before = prompt().match;
    game.disconnect('sock-a');
    game.resync(game.rejoin(alice.sessionToken, 'sock-a2'));
    expect((rec.last('question:prompt', 'sock-a2') as QuestionPromptPayload).match).toEqual(before);
  });
});
