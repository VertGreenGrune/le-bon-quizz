import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { introOf } from './testing.js';
import {
  PAUSE_GRACE_MS,
  QUESTION_INTRO_MS,
  RESUME_COUNTDOWN_MS,
  type AnswerInput,
  type PlayerResultPayload,
  type QuestionPromptPayload,
  type QuestionRevealPayload,
  type QuestionShowPayload,
  type Quiz,
  type ServerToClientEvents,
  type StandingsPayload,
} from '@lbq/shared';
import { Game, type GameSettings, type GameTransport, type Player } from './Game.js';
import { GameError } from './errors.js';

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

const base = { timeLimitSec: 20, basePoints: 1000 as const };
const ITEMS = ['Beetlejuice', 'Batman', 'Edward aux mains d’argent', 'Ed Wood'];
const IMAGE = 'http://localhost:3001/uploads/carte.png';
/** Time frozen in the tests: a right answer earns its full 1000 points. */
const quiz: Quiz = {
  id: 'more-types',
  title: 'Nouveaux types',
  questions: [
    { ...base, text: 'Dans l’ordre de sortie', type: 'ORDER', items: ITEMS },
    {
      ...base,
      text: 'Où est Paris ?',
      type: 'PIN',
      imageUrl: IMAGE,
      zone: { x: 0.5, y: 0.3, radius: 0.1 },
    },
    {
      ...base,
      basePoints: 0,
      text: 'Qui de nous rate son train ?',
      type: 'WHO_OF_US',
      majorityBonus: true,
    },
    { ...base, text: 'Qui chante faux ?', type: 'WHO_OF_US', majorityBonus: false },
    { ...base, text: 'Un mot sur Tim Burton', type: 'WORD_CLOUD' },
    {
      ...base,
      text: 'QCM',
      type: 'MCQ',
      choices: [
        { text: 'Oui', isCorrect: true },
        { text: 'Non', isCorrect: false },
      ],
    },
  ],
};
const Q = { ORDER: 0, PIN: 1, WHO: 2, WHO_NO_BONUS: 3, CLOUD: 4, MCQ: 5 } as const;

describe('Game with the ORDER / PIN / WHO_OF_US / WORD_CLOUD types', () => {
  let rec: ReturnType<typeof recorder>;
  let game: Game;

  beforeEach(() => {
    vi.useFakeTimers();
    rec = recorder();
  });

  afterEach(() => {
    game?.dispose();
    vi.useRealTimers();
  });

  const create = (settings?: GameSettings) => {
    game = new Game(
      '123456',
      quiz,
      rec.transport,
      {},
      { mode: 'solo', allAnsweredGraceMs: 0, ...settings },
    );
    return game;
  };
  const join = (...names: string[]) => names.map((n) => game.join(n, `sock-${n}`));
  /** From the lobby or a leaderboard to ANSWERING of question `index`. */
  const goTo = (index: number) => {
    if (game.phase === 'LOBBY') game.start();
    while (game.questionIndex < index || game.phase !== 'QUESTION_INTRO') game.next();
    vi.advanceTimersByTime(introOf(game));
    expect(game.phase).toBe('ANSWERING');
  };
  const answer = (p: Player, a: AnswerInput) => game.answer(p.id, game.questionIndex, a);
  const prompt = (p: Player | string) =>
    rec.last('question:prompt', typeof p === 'string' ? p : p.socketId!) as QuestionPromptPayload;
  const result = (p: Player) => rec.last('player:result', p.socketId!) as PlayerResultPayload;
  const reveal = () => rec.last('question:reveal', 'host') as QuestionRevealPayload;
  /** The right ORDER answer, from the shuffled items of the prompt. */
  const rightOrder = (items: string[]) => ITEMS.map((item) => items.indexOf(item));

  it('never sends the answer to the phones (only the PIN picture) nor to the host before the reveal', () => {
    create();
    const [alice] = join('Alice', 'Bob');
    goTo(Q.ORDER);
    const order = prompt(alice!);
    expect(order).toMatchObject({ type: 'ORDER' });
    expect([...order.items!].sort()).toEqual([...ITEMS].sort());
    // Shuffled with no item in its place: the list itself never gives the answer away.
    order.items!.forEach((item, i) => expect(item).not.toBe(ITEMS[i]));
    const show = rec.last('question:show', 'host') as QuestionShowPayload;
    expect(show.items).toEqual(order.items); // same order on the TV
    expect(show.choices).toEqual([]);
    game.next();
    game.next();

    goTo(Q.PIN);
    expect(prompt(alice!)).toEqual({ index: 1, type: 'PIN', timeLimitSec: 20, imageUrl: IMAGE });
    const pinShow = rec.last('question:show', 'host') as QuestionShowPayload;
    expect(JSON.stringify(pinShow)).not.toMatch(/zone|radius/);
    game.next();
    game.next();

    goTo(Q.WHO);
    expect(prompt(alice!)).toMatchObject({ type: 'WHO_OF_US' });
    expect(prompt(alice!).candidates!.map((c) => c.nickname)).toEqual(['Alice', 'Bob']);
    expect((rec.last('question:show', 'host') as QuestionShowPayload).candidates).toHaveLength(2);
    game.next();
    game.next();

    goTo(Q.CLOUD);
    expect(prompt(alice!)).toEqual({
      index: 4,
      type: 'WORD_CLOUD',
      timeLimitSec: 20,
      maxLength: 20,
    });

    const phoneJson = JSON.stringify(
      rec.sent.filter((s) => s.to.startsWith('sock-') || s.to === 'all').map((s) => s.payload),
    );
    expect(phoneJson).not.toMatch(/zone|radius|majorityBonus|"x"|"y"/);
  });

  it('rejects answers of the wrong kind and invalid orders / votes', () => {
    create();
    const [alice] = join('Alice', 'Bob');
    goTo(Q.ORDER);
    expectGameError(() => answer(alice!, { choiceIndex: 0 }), 'INVALID_PAYLOAD');
    expectGameError(() => answer(alice!, { order: [0, 1, 2] }), 'INVALID_PAYLOAD'); // 4 items
    expectGameError(() => answer(alice!, { order: [0, 1, 1, 2] }), 'INVALID_PAYLOAD');
    expectGameError(() => answer(alice!, { order: [0, 1, 2, 4] }), 'INVALID_PAYLOAD');
    game.next();
    game.next();
    goTo(Q.PIN);
    expectGameError(() => answer(alice!, { value: 1 }), 'INVALID_PAYLOAD');
    game.next();
    game.next();
    goTo(Q.WHO);
    expectGameError(() => answer(alice!, { playerId: 'nobody' }), 'INVALID_PAYLOAD');
    expectGameError(() => answer(alice!, { text: 'Bob' }), 'INVALID_PAYLOAD');
    game.next();
    game.next();
    goTo(Q.CLOUD);
    expectGameError(() => answer(alice!, { point: { x: 0, y: 0 } }), 'INVALID_PAYLOAD');
    expect(alice!.answer).toBeNull();
  });

  it('order: full points when all right, a share per item in place, untouched list = 0', () => {
    create();
    const [alice, bob, chloe, dan] = join('Alice', 'Bob', 'Chloé', 'Dan');
    goTo(Q.ORDER);
    const items = prompt(alice!).items!;
    const right = rightOrder(items);
    answer(alice!, { order: right });
    // Bob swaps the first two: 2 of 4 in place.
    answer(bob!, { order: [right[1]!, right[0]!, right[2]!, right[3]!] });
    answer(chloe!, { order: [0, 1, 2, 3] }); // as shown: nothing in place
    expect(game.phase).toBe('ANSWERING');
    game.next(); // Dan doesn't answer

    expect(result(alice!)).toMatchObject({
      correct: true,
      pointsEarned: 1000,
      streak: 1,
      placed: { correct: 4, total: 4 },
    });
    expect(result(bob!)).toMatchObject({
      correct: false,
      pointsEarned: 500,
      streak: 0,
      placed: { correct: 2, total: 4 },
    });
    expect(result(chloe!)).toMatchObject({ pointsEarned: 0, placed: { correct: 0, total: 4 } });
    expect(result(dan!).placed).toBeUndefined();
    expect(reveal()).toEqual({
      type: 'ORDER',
      correctIndexes: [],
      distribution: [],
      order: { items: ITEMS, placed: [1, 1, 2, 2] },
    });
    expect(game.questionStats[0]).toMatchObject({
      type: 'ORDER',
      correctCount: 1,
      answerCount: 3,
      details: { order: { items: ITEMS, placed: [1, 1, 2, 2] } },
    });
  });

  it('pin: full points in the zone, half at its edge fading out, every pin at the reveal', () => {
    create();
    const [alice, bob, chloe] = join('Alice', 'Bob', 'Chloé');
    goTo(Q.PIN);
    answer(alice!, { point: { x: 0.55, y: 0.3 } }); // inside
    answer(bob!, { point: { x: 0.7, y: 0.3 } }); // 0.1 beyond the edge (falloff 0.2)
    answer(chloe!, { point: { x: 1, y: 1 } }); // far
    expect(result(alice!)).toMatchObject({ correct: true, pointsEarned: 1000, streak: 1 });
    expect(result(bob!)).toMatchObject({ correct: false, pointsEarned: 250, streak: 0 });
    expect(result(chloe!)).toMatchObject({ correct: false, pointsEarned: 0 });
    expect(reveal().pin).toEqual({
      imageUrl: IMAGE,
      zone: { x: 0.5, y: 0.3, radius: 0.1 },
      pins: [
        { x: 0.55, y: 0.3, nickname: 'Alice', avatar: alice!.avatar, correct: true },
        { x: 0.7, y: 0.3, nickname: 'Bob', avatar: bob!.avatar, correct: false },
        { x: 1, y: 1, nickname: 'Chloé', avatar: chloe!.avatar, correct: false },
      ],
    });
    expect(game.questionStats.at(-1)).toMatchObject({ correctCount: 1, answerCount: 3 });
  });

  it('who of us: votes counted, majority bonus (ties included), streak unchanged', () => {
    create();
    const [alice, bob, chloe, dan] = join('Alice', 'Bob', 'Chloé', 'Dan');
    goTo(Q.PIN);
    answer(alice!, { point: { x: 0.5, y: 0.3 } }); // right → streak 1
    game.next();
    game.next();
    goTo(Q.WHO);
    // Bob 2 votes, Chloé 2 votes (tie for the majority), Alice 0.
    answer(alice!, { playerId: bob!.id });
    answer(bob!, { playerId: chloe!.id });
    answer(chloe!, { playerId: bob!.id });
    answer(dan!, { playerId: chloe!.id });
    expect(reveal()).toMatchObject({
      type: 'WHO_OF_US',
      correctIndexes: [],
      distribution: [],
      majorityBonus: true,
      votes: [
        { nickname: 'Bob', avatar: bob!.avatar, count: 2 },
        { nickname: 'Chloé', avatar: chloe!.avatar, count: 2 },
      ],
    });
    expect(result(alice!)).toMatchObject({
      correct: false,
      poll: true,
      pointsEarned: 200,
      streak: 1, // kept
      streakBonus: 0,
      votesReceived: 0,
      withMajority: true,
      totalScore: 1200,
    });
    expect(result(bob!)).toMatchObject({ votesReceived: 2, pointsEarned: 200, streak: 0 });
    expect(game.questionStats.at(-1)).toMatchObject({ correctCount: 0, answerCount: 4 });
  });

  it('who of us without the bonus: 0 points; only the majority voters get the bonus', () => {
    create();
    const [alice, bob, chloe] = join('Alice', 'Bob', 'Chloé');
    goTo(Q.WHO);
    answer(alice!, { playerId: alice!.id }); // voting for oneself is allowed
    answer(bob!, { playerId: chloe!.id });
    answer(chloe!, { playerId: chloe!.id });
    expect(result(alice!)).toMatchObject({ pointsEarned: 0, withMajority: false });
    expect(result(bob!)).toMatchObject({ pointsEarned: 200, withMajority: true });
    expect(result(chloe!)).toMatchObject({ pointsEarned: 200, votesReceived: 2 });
    game.next();
    game.next();
    goTo(Q.WHO_NO_BONUS);
    answer(alice!, { playerId: bob!.id });
    answer(bob!, { playerId: bob!.id });
    game.next();
    expect(reveal().majorityBonus).toBeUndefined();
    expect(result(alice!)).toMatchObject({ pointsEarned: 0, withMajority: true, poll: true });
    expect(result(chloe!)).toMatchObject({ pointsEarned: 0, votesReceived: 0 });
    expect(result(chloe!).withMajority).toBeUndefined(); // didn't vote
  });

  it('word cloud: words grouped after normalization, 0 points, streak unchanged', () => {
    create();
    const [alice, bob, chloe, dan] = join('Alice', 'Bob', 'Chloé', 'Dan');
    goTo(Q.CLOUD);
    answer(alice!, { text: 'Gothique' });
    answer(bob!, { text: 'gothique !' });
    answer(chloe!, { text: 'Le génie' });
    answer(dan!, { text: 'Un texte bien trop long pour un nuage' });
    expect(reveal().words).toEqual([
      { text: 'Gothique', count: 2 },
      { text: 'Le génie', count: 1 },
      { text: 'Un texte bien trop l', count: 1 }, // cut at 20 characters
    ]);
    expect(result(alice!)).toMatchObject({
      correct: false,
      poll: true,
      pointsEarned: 0,
      streak: 0,
    });
    game.next();
    game.next();
    goTo(Q.MCQ);
    answer(alice!, { choiceIndex: 0 });
    game.next();
    expect(result(alice!)).toMatchObject({ correct: true, streak: 1 });
  });

  it('rejoin: same shuffled items for a phone and the host; reveal re-sent to the host', () => {
    create();
    const [alice, bob] = join('Alice', 'Bob');
    goTo(Q.ORDER);
    const items = prompt(alice!).items!;
    game.disconnect('sock-Alice');
    game.rejoin(alice!.sessionToken, 'sock-Alice-2');
    game.resync(alice!);
    expect(prompt('sock-Alice-2').items).toEqual(items);
    game.hostConnected('host-2');
    game.resyncHost('host-2');
    expect((rec.last('question:show', 'host-2') as QuestionShowPayload).items).toEqual(items);

    answer(alice!, { order: rightOrder(items) });
    answer(bob!, { order: rightOrder(items) });
    expect(game.phase).toBe('REVEAL');
    game.resyncHost('host-2');
    expect((rec.last('question:reveal', 'host-2') as QuestionRevealPayload).order).toBeDefined();
    game.rejoin(bob!.sessionToken, 'sock-Bob-2');
    game.resync(bob!);
    expect(rec.last('player:result', 'sock-Bob-2')).toMatchObject({
      correct: true,
      placed: { correct: 4, total: 4 },
    });
  });

  it('pause: answers refused while a player is missing, then accepted after the 3-2-1', () => {
    create();
    const [alice, bob] = join('Alice', 'Bob');
    goTo(Q.PIN);
    game.disconnect('sock-Bob');
    vi.advanceTimersByTime(PAUSE_GRACE_MS);
    expect(game.paused).toBe(true);
    expectGameError(() => answer(alice!, { point: { x: 0.5, y: 0.3 } }), 'GAME_PAUSED');
    game.rejoin(bob!.sessionToken, 'sock-Bob-2');
    vi.advanceTimersByTime(RESUME_COUNTDOWN_MS);
    expect(game.paused).toBe(false);
    answer(alice!, { point: { x: 0.5, y: 0.3 } });
    answer(bob!, { point: { x: 0.5, y: 0.35 } });
    expect(game.phase).toBe('REVEAL');
    expect(result(alice!)).toMatchObject({ correct: true, pointsEarned: 1000 });
  });

  describe('team mode', () => {
    it('partial order points and the majority bonus are averaged per team', () => {
      create({ mode: 'teams', teamCount: 2 });
      const [alice, bob, chloe] = join('Alice', 'Bob', 'Chloé');
      game.setTeam(alice!.id, 0);
      game.setTeam(bob!.id, 0);
      game.setTeam(chloe!.id, 1);
      goTo(Q.ORDER);
      const right = rightOrder(prompt(alice!).items!);
      answer(alice!, { order: right }); // 1000
      answer(bob!, { order: [right[1]!, right[0]!, right[2]!, right[3]!] }); // 500
      answer(chloe!, { order: [right[1]!, right[0]!, right[3]!, right[2]!] }); // 0
      game.next();
      const teams = () =>
        (rec.last('leaderboard', 'host') as StandingsPayload).teams!.map((t) => [t.id, t.score]);
      expect(teams()).toEqual([
        [0, 750],
        [1, 0],
      ]);
      game.next();
      goTo(Q.WHO);
      for (const p of [alice!, bob!, chloe!]) answer(p, { playerId: chloe!.id });
      expect(result(chloe!).team).toMatchObject({ id: 1, score: 200 });
      game.next();
      expect(teams()).toEqual([
        [0, 950],
        [1, 200],
      ]);
    });
  });
});
