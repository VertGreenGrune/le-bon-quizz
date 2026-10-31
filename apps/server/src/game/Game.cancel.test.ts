import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ALL_ANSWERED_GRACE_MS,
  FREEZE_MS,
  MAX_ANSWER_CANCELS,
  PAUSE_GRACE_MS,
  type JokerType,
  type PlayerJokersPayload,
  type PlayerResultPayload,
  type Question,
  type QuestionPromptPayload,
  type Quiz,
  type ServerToClientEvents,
} from '@lbq/shared';
import { Game, type GameSettings, type GameTransport, type Player } from './Game.js';
import { GameError } from './errors.js';
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
  return { sent, transport, last, clear: () => (sent.length = 0) };
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

const mcq = (text: string, extra: Partial<Question> = {}): Question =>
  ({
    text,
    type: 'MCQ',
    timeLimitSec: 20,
    basePoints: 1000,
    choices: [
      { text: 'Bon', isCorrect: true },
      { text: 'Faux A', isCorrect: false },
      { text: 'Faux B', isCorrect: false },
    ],
    ...extra,
  }) as Question;

/** MCQ of 20 s / 1000 pts, choice 0 right: an answer after 4 s = 900 points. */
const quiz: Quiz = { id: 'cancel', title: 'Annuler', questions: [mcq('Q1'), mcq('Q2')] };
const RIGHT = { choiceIndex: 0 };
const WRONG = { choiceIndex: 1 };

describe('« Annuler ma réponse » (T43)', () => {
  let rec: ReturnType<typeof recorder>;
  let game: Game;

  /** The real 2 s « everyone answered » grace (no `allAnsweredGraceMs` override). */
  const create = (q: Quiz = quiz, settings: Partial<GameSettings> = {}) => {
    game?.dispose();
    rec = recorder();
    game = new Game('123456', q, rec.transport, {}, { mode: 'solo', ...settings });
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
  const answer = (p: Player, input: object) =>
    game.answer(p.id, game.questionIndex, input as { choiceIndex: number });
  const cancel = (p: Player) => game.unanswer(p.id, game.questionIndex);
  const result = (p: Player) => rec.last('player:result', p.socketId!) as PlayerResultPayload;
  const count = () => rec.last('answer:count', 'host') as { answered: number; total: number };
  const start = () => {
    game.start();
    vi.advanceTimersByTime(introOf(game));
    expect(game.phase).toBe('ANSWERING');
  };

  it('removes the answer, the count goes down, the new answer is scored from its own time', () => {
    const [alice, bob] = joinAll('Alice', 'Bob');
    start();
    answer(alice!, WRONG);
    expect(count()).toEqual({ answered: 1, total: 2 });
    vi.advanceTimersByTime(2000);
    expect(cancel(alice!)).toEqual({ cancelsLeft: MAX_ANSWER_CANCELS - 1 });
    expect(alice!.answer).toBeNull();
    expect(count()).toEqual({ answered: 0, total: 2 });
    vi.advanceTimersByTime(2000);
    answer(alice!, RIGHT); // at 4 s
    answer(bob!, RIGHT); // at 4 s
    vi.advanceTimersByTime(ALL_ANSWERED_GRACE_MS);
    expect(game.phase).toBe('REVEAL');
    expect(result(alice!)).toMatchObject({ correct: true, pointsEarned: 900 });
    expect(result(bob!)).toMatchObject({ correct: true, pointsEarned: 900 });
  });

  it('everyone answered: the reveal waits 2 s, a cancel meanwhile stops it', () => {
    const [alice, bob] = joinAll('Alice', 'Bob');
    start();
    answer(alice!, RIGHT);
    answer(bob!, RIGHT);
    expect(count()).toEqual({ answered: 2, total: 2 });
    vi.advanceTimersByTime(ALL_ANSWERED_GRACE_MS - 1);
    expect(game.phase).toBe('ANSWERING');
    cancel(bob!);
    vi.advanceTimersByTime(5000);
    expect(game.phase).toBe('ANSWERING'); // waits for Bob again
    answer(bob!, WRONG);
    vi.advanceTimersByTime(ALL_ANSWERED_GRACE_MS - 1);
    expect(game.phase).toBe('ANSWERING');
    vi.advanceTimersByTime(1);
    expect(game.phase).toBe('REVEAL');
    expect(result(bob!).correct).toBe(false);
  });

  it('the timer still reveals: a cancelled answer not given again = no answer', () => {
    const [alice, bob] = joinAll('Alice', 'Bob');
    start();
    answer(alice!, RIGHT);
    answer(bob!, RIGHT);
    cancel(alice!);
    vi.advanceTimersByTime(20_000);
    expect(game.phase).toBe('REVEAL');
    expect(result(alice!)).toMatchObject({ correct: false, pointsEarned: 0, streak: 0 });
    expect(result(bob!).correct).toBe(true);
  });

  it('the timer running out during the grace reveals at once', () => {
    const [alice] = joinAll('Alice');
    start();
    vi.advanceTimersByTime(19_000);
    answer(alice!, RIGHT);
    vi.advanceTimersByTime(1000);
    expect(game.phase).toBe('REVEAL');
  });

  it('refusals: no answer, after the reveal, paused, more than 3 cancels', () => {
    const [alice, bob] = joinAll('Alice', 'Bob');
    start();
    expectGameError(() => cancel(alice!), 'CANCEL_REFUSED');
    for (let i = MAX_ANSWER_CANCELS; i > 0; i--) {
      answer(alice!, RIGHT);
      expect(cancel(alice!).cancelsLeft).toBe(i - 1);
    }
    answer(alice!, RIGHT);
    expectGameError(() => cancel(alice!), 'CANCEL_REFUSED');
    expect(alice!.answer).not.toBeNull();
    // Paused (Bob dropped before answering).
    answer(bob!, WRONG);
    cancel(bob!);
    game.disconnect('sock-Bob');
    vi.advanceTimersByTime(PAUSE_GRACE_MS);
    expect(game.paused).toBe(true);
    expectGameError(() => cancel(alice!), 'GAME_PAUSED');
    game.end();
    expectGameError(() => cancel(alice!), 'NOT_ANSWERING');
  });

  it('the limit is per question: the next question gives 3 cancels again', () => {
    const [alice] = joinAll('Alice');
    start();
    for (let i = 0; i < MAX_ANSWER_CANCELS; i++) {
      answer(alice!, RIGHT);
      cancel(alice!);
    }
    answer(alice!, RIGHT);
    vi.advanceTimersByTime(ALL_ANSWERED_GRACE_MS);
    game.next();
    game.next();
    vi.advanceTimersByTime(introOf(game));
    answer(alice!, RIGHT);
    expect(cancel(alice!).cancelsLeft).toBe(MAX_ANSWER_CANCELS - 1);
  });

  it('a phone that rejoins after cancelling gets the prompt again', () => {
    const [alice, bob] = joinAll('Alice', 'Bob');
    start();
    answer(alice!, RIGHT);
    cancel(alice!);
    game.disconnect('sock-Alice');
    rec.clear();
    game.resync(game.rejoin(alice!.sessionToken, 'sock-Alice-2'));
    const prompt = rec.last('question:prompt', 'sock-Alice-2') as QuestionPromptPayload;
    expect(prompt).toMatchObject({ index: 0, choiceCount: 3 });
    answer(alice!, RIGHT);
    answer(bob!, RIGHT);
    vi.advanceTimersByTime(ALL_ANSWERED_GRACE_MS);
    expect(game.phase).toBe('REVEAL');
  });

  describe('question types', () => {
    const buzzerQ = mcq('Buzz', { buzzer: true } as Partial<Question>);
    const drawQ = {
      text: 'Dessine',
      type: 'DRAW',
      timeLimitSec: 60,
      basePoints: 1000,
      words: ['chat'],
    } as Question;
    const bluffQ = {
      text: 'Mytho',
      type: 'BLUFF',
      timeLimitSec: 45,
      basePoints: 1000,
      truth: 'Vincent',
      voteTimeSec: 20,
    } as Question;

    it('refused on « Buzzer », « Dessine-moi » and « Mytho ! » questions (no grace there)', () => {
      create({ ...quiz, questions: [bluffQ, drawQ, buzzerQ] });
      const [alice, bob] = joinAll('Alice', 'Bob');
      start();
      // « Mytho ! »: writing, then the vote (revealed at once when everyone voted).
      answer(alice!, { text: 'Frankenweenie' });
      expectGameError(() => cancel(alice!), 'CANCEL_REFUSED');
      answer(bob!, { text: 'Le Cavalier' });
      const options = (rec.last('question:prompt', 'sock-Alice') as QuestionPromptPayload).bluff;
      expect(options?.stage).toBe('vote');
      const own = options?.stage === 'vote' ? options.own : undefined;
      answer(alice!, { choiceIndex: own === 0 ? 1 : 0 });
      expectGameError(() => cancel(alice!), 'CANCEL_REFUSED');
      const bobOwn = (rec.last('question:prompt', 'sock-Bob') as QuestionPromptPayload).bluff;
      const bobOwnIndex = bobOwn?.stage === 'vote' ? bobOwn.own : undefined;
      answer(bob!, { choiceIndex: bobOwnIndex === 0 ? 1 : 0 });
      expect(game.phase).toBe('REVEAL');
      // « Dessine-moi »: a found word stays found.
      game.next();
      game.next();
      vi.advanceTimersByTime(introOf(game));
      const guesser = game.statePayload().draw?.drawer?.id === alice!.id ? bob! : alice!;
      answer(guesser, { text: 'chat' });
      expect(game.phase).toBe('REVEAL');
      expectGameError(() => cancel(guesser), 'NOT_ANSWERING');
      // « Buzzer »: judged out loud, nothing to cancel.
      game.next();
      game.next();
      vi.advanceTimersByTime(introOf(game));
      game.buzz(alice!.id, game.questionIndex);
      expectGameError(() => cancel(alice!), 'CANCEL_REFUSED');
    });

    it('« Qui de nous ? » votes and « select all » selections can be cancelled', () => {
      const whoQ = {
        text: 'Qui ?',
        type: 'WHO_OF_US',
        timeLimitSec: 20,
        basePoints: 0,
        majorityBonus: false,
      } as Question;
      const multi = {
        ...mcq('Tout'),
        choices: [
          { text: 'A', isCorrect: true },
          { text: 'B', isCorrect: true },
          { text: 'C', isCorrect: false },
        ],
      } as Question;
      create({ ...quiz, questions: [whoQ, multi] });
      const [alice] = joinAll('Alice');
      start();
      answer(alice!, { playerId: alice!.id });
      cancel(alice!);
      expect(alice!.answer).toBeNull();
      answer(alice!, { playerId: alice!.id });
      vi.advanceTimersByTime(ALL_ANSWERED_GRACE_MS);
      game.next();
      game.next();
      vi.advanceTimersByTime(introOf(game));
      answer(alice!, { choiceIndexes: [0] });
      cancel(alice!);
      answer(alice!, { choiceIndexes: [0, 1] });
      vi.advanceTimersByTime(ALL_ANSWERED_GRACE_MS);
      expect(result(alice!)).toMatchObject({ correct: true });
    });
  });

  describe('jokers', () => {
    const withJokers = () => create(quiz, { jokers: true });
    const hand = (p: Player, jokers: JokerType[]) => game.jokers!.setHand(p.id, jokers);
    const play = (p: Player, joker: JokerType, target?: Player) =>
      game.useJoker(p.id, game.questionIndex, joker, target?.id);
    const jokerState = (p: Player) => rec.last('joker:state', p.socketId!) as PlayerJokersPayload;

    it('Copieur: the copier can’t cancel; the target cancelling removes the copy, redone later', () => {
      withJokers();
      const [alice, bob, chloe] = joinAll('Alice', 'Bob', 'Chloé');
      game.start();
      hand(bob!, ['copy']);
      play(bob!, 'copy', alice!);
      vi.advanceTimersByTime(introOf(game));
      answer(alice!, RIGHT);
      expect(bob!.answer?.choiceIndex).toBe(0);
      expect(jokerState(bob!).effects.copied).toBe(true);
      expectGameError(() => cancel(bob!), 'CANCEL_REFUSED');
      answer(chloe!, RIGHT);
      // Everyone answered (the copy included): Alice cancels during the grace.
      cancel(alice!);
      expect(bob!.answer).toBeNull();
      expect(jokerState(bob!).effects.copied).toBeUndefined();
      expect(count()).toEqual({ answered: 1, total: 3 });
      vi.advanceTimersByTime(ALL_ANSWERED_GRACE_MS);
      expect(game.phase).toBe('ANSWERING');
      answer(alice!, WRONG);
      expect(bob!.answer?.choiceIndex).toBe(1);
      vi.advanceTimersByTime(ALL_ANSWERED_GRACE_MS);
      expect(game.phase).toBe('REVEAL');
      expect(result(bob!).correct).toBe(false);
    });

    it('a joker played stays played (one per question) and applies to the new answer', () => {
      withJokers();
      const [alice, bob] = joinAll('Alice', 'Bob');
      game.start();
      hand(alice!, ['double', 'shield']);
      vi.advanceTimersByTime(introOf(game));
      vi.advanceTimersByTime(4000);
      answer(alice!, WRONG);
      play(alice!, 'double'); // after answering (T42)
      cancel(alice!);
      expect(jokerState(alice!).played?.joker).toBe('double');
      expectGameError(() => play(alice!, 'shield'), 'JOKER_REFUSED');
      answer(alice!, RIGHT); // at 4 s: 900, doubled
      answer(bob!, RIGHT);
      vi.advanceTimersByTime(ALL_ANSWERED_GRACE_MS);
      expect(result(alice!)).toMatchObject({ correct: true, pointsEarned: 1800 });
    });

    it('Sablier played after answering halves the time of the new answer', () => {
      withJokers();
      const [alice] = joinAll('Alice');
      game.start();
      hand(alice!, ['hourglass']);
      vi.advanceTimersByTime(introOf(game));
      answer(alice!, RIGHT);
      play(alice!, 'hourglass');
      cancel(alice!);
      vi.advanceTimersByTime(8000);
      answer(alice!, RIGHT); // at 8 s, scored as 4 s
      vi.advanceTimersByTime(ALL_ANSWERED_GRACE_MS);
      expect(result(alice!)).toMatchObject({ correct: true, pointsEarned: 900 });
    });

    it('Gel: a player who cancelled can be frozen and can’t answer again during the freeze', () => {
      withJokers();
      const [alice, bob] = joinAll('Alice', 'Bob');
      game.start();
      hand(bob!, ['freeze']);
      vi.advanceTimersByTime(introOf(game));
      answer(alice!, RIGHT);
      expectGameError(() => play(bob!, 'freeze', alice!), 'JOKER_REFUSED'); // already answered
      cancel(alice!);
      play(bob!, 'freeze', alice!);
      expectGameError(() => answer(alice!, RIGHT), 'FROZEN');
      vi.advanceTimersByTime(FREEZE_MS);
      answer(alice!, RIGHT);
      expect(alice!.answer?.correct).toBe(true);
    });
  });

  describe('modes', () => {
    it('team mode: the team average uses the new answer', () => {
      create(quiz, { mode: 'teams' });
      const [alice, bob] = joinAll('Alice', 'Bob');
      game.setTeam(alice!.id, 0);
      game.setTeam(bob!.id, 1);
      start();
      answer(alice!, WRONG);
      cancel(alice!);
      answer(alice!, RIGHT);
      answer(bob!, WRONG);
      vi.advanceTimersByTime(ALL_ANSWERED_GRACE_MS);
      expect(result(alice!).team).toMatchObject({ id: 0, score: 1000, rank: 1 });
      expect(result(bob!).team).toMatchObject({ id: 1, score: 0 });
    });

    it('« Survie »: a wrong answer cancelled and given right keeps the heart', () => {
      create(quiz, { mode: 'survival', hearts: 2 });
      const [alice, bob] = joinAll('Alice', 'Bob');
      start();
      answer(alice!, WRONG);
      cancel(alice!);
      answer(alice!, RIGHT);
      answer(bob!, RIGHT);
      vi.advanceTimersByTime(ALL_ANSWERED_GRACE_MS);
      expect(result(alice!).survival).toMatchObject({ hearts: 2, lostHeart: false });
    });
  });
});
