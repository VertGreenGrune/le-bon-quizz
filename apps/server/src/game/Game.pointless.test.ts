import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PAUSE_GRACE_MS,
  POINTLESS_MISSED_SHOWN,
  QuestionSchema,
  RESUME_COUNTDOWN_MS,
  acceptKind,
  answerCancellable,
  answerText,
  jokerAvailability,
  pointlessPoints,
  type PlayerJokersPayload,
  type PlayerResultPayload,
  type PointlessQuestion,
  type Question,
  type QuestionPromptPayload,
  type QuestionRevealPayload,
  type QuestionShowPayload,
  type Quiz,
  type ServerToClientEvents,
  type SurvivalStatePayload,
} from '@lbq/shared';
import { Game, type GameSettings, type GameTransport, type Player } from './Game.js';
import { GameError } from './errors.js';
import { matchItem } from './matching.js';
import { CLASSIC_QUIZ, introOf } from './testing.js';

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

const AFRICA = [
  'Maroc',
  'Sénégal',
  'Égypte | Egypte',
  'Côte d’Ivoire | Cote d Ivoire',
  'Madagascar',
  'Burkina Faso',
  'Djibouti',
  'Lesotho',
  'Eswatini | Swaziland',
  'Comores',
  'Érythrée',
  'Tchad',
  'Niger',
  'Nigeria',
];

const pointless = (basePoints: 0 | 1000 | 2000 = 1000): PointlessQuestion => ({
  text: 'Citez un pays d’Afrique',
  type: 'POINTLESS',
  items: AFRICA,
  typoTolerance: true,
  timeLimitSec: 30,
  basePoints,
});

const mcq = CLASSIC_QUIZ.questions[0]!;
const quizOf = (...questions: Question[]): Quiz => ({ id: 'pl', title: 'Pas évident', questions });

describe('« Pas évident ! » (POINTLESS)', () => {
  let rec: ReturnType<typeof recorder>;
  let game: Game;

  const create = (quiz: Quiz = quizOf(pointless(), mcq), settings: Partial<GameSettings> = {}) => {
    game?.dispose();
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
    vi.useFakeTimers();
    create();
  });

  afterEach(() => {
    game.dispose();
    vi.useRealTimers();
  });

  const joinAll = (...names: string[]) => names.map((n) => game.join(n, `sock-${n}`));
  const prompt = (p: Player) => rec.last('question:prompt', p.socketId!) as QuestionPromptPayload;
  const show = () => rec.last('question:show', 'host') as QuestionShowPayload;
  const result = (p: Player) => rec.last('player:result', p.socketId!) as PlayerResultPayload;
  const reveal = () => rec.last('question:reveal', 'host') as QuestionRevealPayload;
  const say = (p: Player, text: string) => game.answer(p.id, game.questionIndex, { text });
  const phoneFrames = () =>
    JSON.stringify(rec.sent.filter((s) => !s.to.startsWith('host') && s.event !== 'remote:answer'));
  const start = (...names: string[]) => {
    const players = joinAll(...names);
    game.start();
    vi.advanceTimersByTime(introOf(game));
    expect(game.phase).toBe('ANSWERING');
    return players;
  };

  it('schema: 2–100 different items with spellings, 30 s by default; helpers', () => {
    expect(QuestionSchema.safeParse(pointless()).success).toBe(true);
    expect(QuestionSchema.safeParse({ ...pointless(), items: ['Seul'] }).success).toBe(false);
    expect(QuestionSchema.safeParse({ ...pointless(), items: ['Maroc', 'maroc'] }).success).toBe(
      false,
    );
    const many = Array.from({ length: 101 }, (_, i) => `Item ${i}`);
    expect(QuestionSchema.safeParse({ ...pointless(), items: many }).success).toBe(false);
    expect(QuestionSchema.safeParse({ ...pointless(), items: many.slice(0, 100) }).success).toBe(
      true,
    );
    expect(QuestionSchema.safeParse({ ...pointless(), buzzer: true }).success).toBe(false);
    const parsed = QuestionSchema.parse({ text: 'x', type: 'POINTLESS', items: ['a', 'b'] });
    expect(parsed).toMatchObject({ timeLimitSec: 30, typoTolerance: true });
    expect(answerText(pointless()).slice(0, 3)).toEqual(['Maroc', 'Sénégal', 'Égypte']);
    expect(answerCancellable('POINTLESS')).toBe(true);
    expect(acceptKind({ type: 'POINTLESS' })).toBe('text');
    expect(pointlessPoints(1000, 3)).toBe(333);
    expect(pointlessPoints(1000, 0)).toBe(0);
    // Shared with « Liste chrono »: exact first, then tolerant.
    expect(matchItem(['Niger', 'Nigeria'], 'nigeria', true)).toBe(1);
    expect(matchItem(['Niger', 'Nigeria'], 'niger', true)).toBe(0);
    expect(matchItem(['Madagascar'], 'Madagaskar', false)).toBe(-1);
  });

  it('the phones and the TV never get the items nor what others typed before the reveal', () => {
    const [alice, bob] = start('Alice', 'Bob', 'Chloé');
    expect(prompt(alice!)).toEqual({
      index: 0,
      type: 'POINTLESS',
      timeLimitSec: 30,
      maxLength: 40,
    });
    expect(JSON.stringify(show())).not.toContain('Maroc');
    say(alice!, 'Djibouti');
    say(bob!, 'Tchad');
    expect(rec.last('answer:count', 'host')).toEqual({ answered: 2, total: 3 });
    const frames = phoneFrames();
    for (const word of ['Maroc', 'Djibouti', 'Tchad', 'Lesotho'])
      expect(frames).not.toContain(word);
    const hostFrames = JSON.stringify(rec.sent.filter((s) => s.to === 'host'));
    expect(hostFrames).not.toContain('Djibouti');
  });

  it('a right answer given by k players earns basePoints / k each; unique = full points', () => {
    const [alice, bob, chloe, dan, eve, fay] = start('Alice', 'Bob', 'Chloé', 'Dan', 'Eve', 'Fay');
    vi.advanceTimersByTime(25_000); // no time factor
    say(alice!, 'Maroc');
    say(bob!, 'maroc');
    say(chloe!, 'Le Maroc'); // article ignored
    say(dan!, 'Senegal'); // accents
    say(eve!, 'Sénégal');
    say(fay!, 'Djibuti'); // typo
    expect(game.phase).toBe('REVEAL');
    expect(result(alice!)).toMatchObject({
      correct: true,
      pointsEarned: 333,
      pointless: { yours: 'Maroc', sharedBy: 3 },
    });
    expect(result(dan!)).toMatchObject({ pointsEarned: 500, pointless: { sharedBy: 2 } });
    expect(result(fay!)).toMatchObject({
      correct: true,
      pointsEarned: 1000,
      pointless: { yours: 'Djibouti', sharedBy: 1 },
    });
    const p = reveal().pointless!;
    expect(p.answers.map((a) => [a.text, a.players.length, a.points])).toEqual([
      ['Djibouti', 1, 1000],
      ['Sénégal', 2, 500],
      ['Maroc', 3, 333],
    ]);
    expect(p.wrong).toEqual([]);
    expect(p.missedCount).toBe(AFRICA.length - 3);
    expect(p.missed).toHaveLength(POINTLESS_MISSED_SHOWN);
    expect(p.missed).not.toContain('Maroc');
  });

  it('wrong and missing answers score 0; the spelling « | » and the closest item win', () => {
    const [alice, bob, chloe] = start('Alice', 'Bob', 'Chloé');
    say(alice!, 'France');
    say(bob!, 'Swaziland');
    vi.advanceTimersByTime(30_000);
    expect(game.phase).toBe('REVEAL');
    expect(result(alice!)).toMatchObject({
      correct: false,
      pointsEarned: 0,
      pointless: { yours: 'France', sharedBy: 0 },
    });
    expect(result(bob!)).toMatchObject({ pointless: { yours: 'Eswatini', sharedBy: 1 } });
    expect(result(chloe!)).toMatchObject({ correct: false, pointless: { sharedBy: 0 } });
    expect(reveal().pointless!.wrong).toEqual([
      { text: 'France', players: [expect.objectContaining({ nickname: 'Alice' })] },
    ]);
    expect(reveal().typedAnswers?.map((g) => g.text)).toEqual(['France', 'Swaziland']);
  });

  it('wrong answer kinds are refused', () => {
    const [alice] = start('Alice');
    expectGameError(() => game.answer(alice!.id, 0, { choiceIndex: 0 }), 'INVALID_PAYLOAD');
  });

  it('answers can be cancelled and given again', () => {
    create(quizOf(pointless()), { allAnsweredGraceMs: 2000 });
    const [alice, bob] = start('Alice', 'Bob');
    say(alice!, 'Maroc');
    say(bob!, 'Maroc');
    game.unanswer(bob!.id, 0);
    say(bob!, 'Lesotho');
    vi.advanceTimersByTime(2000);
    expect(result(alice!)).toMatchObject({ pointsEarned: 1000, pointless: { sharedBy: 1 } });
    expect(result(bob!)).toMatchObject({ pointsEarned: 1000, pointless: { yours: 'Lesotho' } });
  });

  it('a phone that reloads gets the prompt again (or not, once answered); the TV the reveal', () => {
    const [alice, bob] = start('Alice', 'Bob');
    game.disconnect('sock-Alice');
    game.resync(game.rejoin(alice!.sessionToken, 'sock-Alice-2'));
    expect(prompt(alice!)).toMatchObject({ type: 'POINTLESS', maxLength: 40 });
    say(alice!, 'Tchad');
    say(bob!, 'Niger');
    game.resyncHost('host-2');
    expect(
      (rec.last('question:reveal', 'host-2') as QuestionRevealPayload).pointless!.answers,
    ).toHaveLength(2);
    game.disconnect('sock-Bob');
    game.resync(game.rejoin(bob!.sessionToken, 'sock-Bob-2'));
    expect(result(bob!)).toMatchObject({ pointless: { yours: 'Niger', sharedBy: 1 } });
  });

  it('a pause refuses answers and freezes the clock', () => {
    const [alice, bob] = start('Alice', 'Bob');
    game.disconnect('sock-Bob');
    vi.advanceTimersByTime(PAUSE_GRACE_MS + 100);
    expect(game.paused).toBe(true);
    expectGameError(() => say(alice!, 'Maroc'), 'GAME_PAUSED');
    game.resync(game.rejoin(bob!.sessionToken, 'sock-Bob-2'));
    vi.advanceTimersByTime(RESUME_COUNTDOWN_MS);
    say(alice!, 'Maroc');
    say(bob!, 'Maroc');
    expect(result(bob!).pointsEarned).toBe(500);
  });

  it('team mode: average of the members’ points', () => {
    create(quizOf(pointless(), mcq), { mode: 'teams', teamCount: 2 });
    const [alice, bob, chloe] = joinAll('Alice', 'Bob', 'Chloé');
    game.setTeam(alice!.id, 0);
    game.setTeam(bob!.id, 0);
    game.setTeam(chloe!.id, 1);
    game.start();
    vi.advanceTimersByTime(introOf(game));
    say(alice!, 'Maroc');
    say(bob!, 'Maroc');
    say(chloe!, 'Comores');
    expect(result(alice!).team).toMatchObject({ id: 0, score: 500 });
    expect(result(chloe!).team).toMatchObject({ id: 1, score: 1000 });
  });

  it('« Survie »: a wrong or missing answer costs a heart, a shared right one doesn’t', () => {
    create(quizOf(pointless(), mcq), { mode: 'survival', hearts: 2 });
    const [alice, bob, chloe] = start('Alice', 'Bob', 'Chloé');
    say(alice!, 'Maroc');
    say(bob!, 'Maroc');
    say(chloe!, 'Paris');
    expect(result(alice!).survival).toMatchObject({ hearts: 2, lostHeart: false });
    expect(result(chloe!).survival).toMatchObject({ hearts: 1, lostHeart: true });
    const survival = rec.last('survival:state', 'all') as SurvivalStatePayload;
    expect(survival.players.map((p) => p.hearts)).toEqual([2, 2, 1]);
  });

  it('« ✅ Accepter » a refused typed answer: it counts as its own answer', () => {
    const [alice, bob, chloe] = start('Alice', 'Bob', 'Chloé');
    say(alice!, 'Zaïre');
    say(bob!, 'zaire');
    say(chloe!, 'Maroc');
    expect(result(alice!).correct).toBe(false);
    expectGameError(() => game.accept(0, { choiceIndex: 0 }), 'INVALID_PAYLOAD');
    game.accept(0, { text: 'Maroc' }); // already right: no-op
    game.accept(0, { text: 'Zaïre' });
    expect(result(alice!)).toMatchObject({ correct: true, pointsEarned: 500, accepted: true });
    expect(result(bob!)).toMatchObject({ pointless: { yours: 'zaire', sharedBy: 2 } });
    expect(result(chloe!).pointsEarned).toBe(1000);
    const p = reveal().pointless!;
    expect(p.answers.map((a) => [a.text, a.players.length, a.accepted])).toEqual([
      ['Maroc', 1, undefined],
      ['Zaïre', 2, true],
    ]);
    expect(p.wrong).toEqual([]);
  });

  describe('jokers', () => {
    it('availability: no Brouilleur, no Sablier', () => {
      const a = jokerAvailability('POINTLESS');
      expect(a.jokers).toBe(true);
      expect(a.unavailable).toEqual(['scramble', 'hourglass']);
    });

    it('50/50 = the first letter of a random item; Copieur shares the answer', () => {
      create(quizOf(pointless()), {
        jokers: true,
        jokerHand: ['fifty', 'copy', 'hourglass'],
        random: () => 0.99, // the last item: Nigeria
      });
      const [alice, bob] = joinAll('Alice', 'Bob');
      game.start();
      game.useJoker(alice!.id, 0, 'fifty');
      const joker = rec.last('joker:state', 'sock-Alice') as PlayerJokersPayload;
      expect(joker.effects.firstLetter).toBe('N');
      expectGameError(() => game.useJoker(bob!.id, 0, 'hourglass'), 'JOKER_REFUSED');
      game.useJoker(bob!.id, 0, 'copy', alice!.id);
      vi.advanceTimersByTime(introOf(game));
      say(alice!, 'Nigeria');
      expect(game.phase).toBe('REVEAL');
      expect(result(alice!)).toMatchObject({ pointsEarned: 500, pointless: { sharedBy: 2 } });
      expect(result(bob!)).toMatchObject({ pointsEarned: 500, pointless: { yours: 'Nigeria' } });
    });

    it('Double ou rien doubles the shared points; Gel blocks answers', () => {
      create(quizOf(pointless()), { jokers: true, jokerHand: ['double', 'freeze', 'shield'] });
      const [alice, bob] = joinAll('Alice', 'Bob');
      game.start();
      game.useJoker(alice!.id, 0, 'double');
      game.useJoker(bob!.id, 0, 'freeze', alice!.id);
      vi.advanceTimersByTime(introOf(game));
      expectGameError(() => say(alice!, 'Maroc'), 'FROZEN');
      vi.advanceTimersByTime(5000);
      say(alice!, 'Maroc');
      say(bob!, 'Maroc');
      expect(result(alice!).pointsEarned).toBe(1000);
      expect(result(bob!).pointsEarned).toBe(500);
    });
  });
});
