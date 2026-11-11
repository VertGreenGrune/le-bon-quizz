import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { introOf } from './testing.js';
import {
  PAUSE_GRACE_MS,
  POTATO_WRONG_LOCK_MS,
  QuestionSchema,
  RESUME_COUNTDOWN_MS,
  answerCancellable,
  answerText,
  jokerAvailability,
  type GameStatePayload,
  type HotPotatoQuestion,
  type PlayerResultPayload,
  type QuestionPromptPayload,
  type QuestionRevealPayload,
  type QuestionShowPayload,
  type Quiz,
  type RemoteAnswerPayload,
  type ServerToClientEvents,
  type StandingsPayload,
  type SurvivalStatePayload,
} from '@lbq/shared';
import { Game, type GameSettings, type GameTransport, type Player } from './Game.js';
import { GameError } from './errors.js';
import { drawFuseMs } from './questionTypes/hotPotato.js';

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

/** Sub-question n: « Combien font n + n ? », right answer always the 2nd choice. */
const subs = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    text: `Combien font ${i + 1} + ${i + 1} ?`,
    choices: [`${2 * i + 1}`, `${2 * i + 2}`, `${2 * i + 3}`],
    correct: 1,
  }));

const potato = (text: string, count = 4): HotPotatoQuestion => ({
  text,
  type: 'HOT_POTATO',
  timeLimitSec: 20,
  basePoints: 1000,
  potato: { questions: subs(count), fuseMinSec: 30, fuseMaxSec: 60 },
});

const quiz: Quiz = {
  id: 'potato',
  title: 'Patate',
  questions: [potato('Patate chaude !'), potato('Encore !')],
};

/** random() = 0.5: the middle player holds it first, fuse = 30 s + 15 s = 45 s. */
const FUSE_MS = 45_000;

describe('« Patate chaude » (HOT_POTATO)', () => {
  let rec: ReturnType<typeof recorder>;
  let game: Game;

  const create = (settings: Partial<GameSettings> = {}, q: Quiz = quiz) => {
    game?.dispose();
    rec = recorder();
    game = new Game(
      '123456',
      q,
      rec.transport,
      {},
      { mode: 'solo', random: () => 0.5, allAnsweredGraceMs: 0, ...settings },
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
  const state = () => rec.last('game:state', 'all') as GameStatePayload;
  const result = (p: Player) => rec.last('player:result', p.socketId!) as PlayerResultPayload;
  const reveal = () => rec.last('question:reveal', 'host') as QuestionRevealPayload;
  const holderOf = (players: Player[]) => players.find((p) => p.id === state().potato?.holder?.id)!;
  const tap = (p: Player, choiceIndex: number) =>
    game.answer(p.id, game.questionIndex, { choiceIndex });
  /** The holder answers right (choice 1 is always right). */
  const pass = (players: Player[]) => tap(holderOf(players), 1);
  const toRound = () => {
    game.start();
    vi.advanceTimersByTime(introOf(game));
    expect(game.phase).toBe('ANSWERING');
  };

  it('schema: defaults, bounds; helpers', () => {
    const q = QuestionSchema.parse({
      text: 'Q',
      type: 'HOT_POTATO',
      potato: { questions: subs(3) },
    });
    expect(q).toMatchObject({ potato: { fuseMinSec: 30, fuseMaxSec: 60 } });
    const base = { text: 'Q', type: 'HOT_POTATO' };
    for (const bad of [
      { potato: { questions: subs(2) } },
      { potato: { questions: subs(31) } },
      { potato: { questions: [...subs(2), { text: 'X', choices: ['a'], correct: 0 }] } },
      { potato: { questions: [...subs(2), { text: 'X', choices: ['a', 'b'], correct: 2 }] } },
      { potato: { questions: subs(3), fuseMinSec: 9 } },
      { potato: { questions: subs(3), fuseMinSec: 40, fuseMaxSec: 30 } },
      { potato: { questions: subs(3) }, buzzer: true },
    ])
      expect(QuestionSchema.safeParse({ ...base, ...bad }).success).toBe(false);
    expect(answerCancellable('HOT_POTATO')).toBe(false);
    expect(jokerAvailability('HOT_POTATO').jokers).toBe(false);
    expect(answerText(potato('Q', 3))).toEqual([
      'Combien font 1 + 1 ? → 2',
      'Combien font 2 + 2 ? → 4',
      'Combien font 3 + 3 ? → 6',
    ]);
    const q3 = potato('Q');
    expect([0, 0.5, 0.9999999].map((r) => drawFuseMs(q3, () => r))).toEqual([
      30_000, 45_000, 60_000,
    ]);
  });

  it('only the holder gets the sub-question; nothing tells the right choice nor the fuse', () => {
    const players = joinAll('Alice', 'Bob', 'Chloé');
    const [alice, bob, chloe] = players;
    toRound();
    expect(holderOf(players)).toBe(bob);
    expect(prompt(bob!).potato).toEqual({
      holder: { id: bob!.id, nickname: 'Bob', avatar: bob!.avatar },
      sub: { number: 1, text: 'Combien font 1 + 1 ?', choices: ['1', '2', '3'] },
      passes: 0,
    });
    expect(prompt(alice!).potato).toEqual({
      holder: { id: bob!.id, nickname: 'Bob', avatar: bob!.avatar },
      passes: 0,
    });
    expect(prompt(chloe!).potato?.sub).toBeUndefined();
    expect(show().potato).toMatchObject({
      holder: { nickname: 'Bob' },
      sub: { number: 1, choices: ['1', '2', '3'] },
      fuseMinSec: 30,
    });
    expect(state().remainingMs).toBeUndefined();
    expect(state().potato).toMatchObject({ holder: { nickname: 'Bob' }, passes: 0 });
    // A few turns, then no frame before the reveal says which choice is right, nor the fuse.
    pass(players);
    tap(holderOf(players), 0); // wrong
    vi.advanceTimersByTime(POTATO_WRONG_LOCK_MS);
    pass(players);
    const before = JSON.stringify(rec.sent);
    expect(before).not.toContain('"correct"');
    expect(before).not.toContain(String(FUSE_MS));
    expect(before).not.toContain('"remainingMs":4');
    // A sub-question only ever went to the socket of the player holding the bomb.
    const withSub = rec.sent.filter(
      (s) => s.event === 'question:prompt' && (s.payload as QuestionPromptPayload).potato?.sub,
    );
    expect(withSub.length).toBe(4);
    for (const s of withSub) {
      const holderId = (s.payload as QuestionPromptPayload).potato!.holder!.id;
      expect(players.find((p) => p.id === holderId)!.socketId).toBe(s.to);
    }
    expect(game.phase).toBe('ANSWERING');
  });

  it('a right answer passes the bomb to someone else — never straight back with 3+ players', () => {
    const players = joinAll('Alice', 'Bob', 'Chloé');
    toRound();
    const holders = [holderOf(players).nickname];
    for (let i = 0; i < 4; i++) {
      expect(pass(players)).toEqual({ potato: 'pass' });
      holders.push(holderOf(players).nickname);
    }
    // random 0.5: Bob → (Alice, Chloé) Chloé → (Alice) Alice → (Bob) Bob → (Chloé) Chloé.
    expect(holders).toEqual(['Bob', 'Chloé', 'Alice', 'Bob', 'Chloé']);
    expect(state().potato).toMatchObject({ passes: 4, from: { nickname: 'Bob' } });
    // Sub-questions in order, then reshuffled (4 asked, 5th from the new round).
    expect(show().potato?.sub?.number).toBe(5);
    expect(prompt(players[2]!).potato?.sub?.number).toBe(5);
    expect(prompt(players[2]!).potato?.from?.nickname).toBe('Bob');
    // The old holder's phone no longer has a sub-question.
    expect(prompt(players[1]!).potato?.sub).toBeUndefined();
    expect(prompt(players[1]!).potato?.passes).toBe(2);
  });

  it('with 2 players the bomb goes back and forth', () => {
    const players = joinAll('Alice', 'Bob');
    toRound();
    const first = holderOf(players);
    pass(players);
    expect(holderOf(players)).not.toBe(first);
    pass(players);
    expect(holderOf(players)).toBe(first);
  });

  it('a wrong answer: same holder, next sub-question, locked for 2 s; others can’t answer', () => {
    const [alice, bob, chloe] = joinAll('Alice', 'Bob', 'Chloé');
    toRound();
    expectGameError(() => tap(alice!, 1), 'INVALID_PAYLOAD');
    expectGameError(() => game.answer(bob!.id, 0, { text: 'deux' }), 'INVALID_PAYLOAD');
    expectGameError(() => tap(bob!, 7), 'INVALID_PAYLOAD');
    expect(tap(bob!, 0)).toEqual({ potato: 'wrong' });
    expect(state().potato?.holder?.nickname).toBe('Bob');
    expect(prompt(bob!).potato).toMatchObject({ sub: { number: 2 }, lockMs: POTATO_WRONG_LOCK_MS });
    expect(show().potato?.lockMs).toBe(POTATO_WRONG_LOCK_MS);
    expectGameError(() => tap(bob!, 1), 'FROZEN');
    vi.advanceTimersByTime(POTATO_WRONG_LOCK_MS);
    expect(tap(bob!, 1)).toEqual({ potato: 'pass' });
    expect(state().potato?.holder?.nickname).toBe('Chloé');
    expect(chloe).toBeDefined();
  });

  it('the fuse goes off: the holder loses everything, the others share the survivor points', () => {
    const players = joinAll('Alice', 'Bob', 'Chloé');
    const [alice, bob, chloe] = players;
    toRound();
    pass(players); // Bob → Chloé
    pass(players); // Chloé → Alice
    pass(players); // Alice → Bob
    pass(players); // Bob → Chloé
    vi.advanceTimersByTime(FUSE_MS - 1);
    expect(game.phase).toBe('ANSWERING');
    vi.advanceTimersByTime(1);
    expect(game.phase).toBe('REVEAL');
    expect(result(chloe!)).toMatchObject({
      correct: false,
      pointsEarned: 0,
      streak: 0,
      potato: { exploded: true, passes: 1, passPoints: 0, survivorPoints: 0 },
    });
    expect(result(bob!)).toMatchObject({
      correct: true,
      pointsEarned: 700, // 500 + 2 × 100
      potato: { exploded: false, loser: { nickname: 'Chloé' }, passes: 2, passPoints: 200 },
    });
    expect(result(alice!)).toMatchObject({ correct: true, pointsEarned: 600, streak: 1 });
    expect(reveal().potato).toEqual({
      loser: { id: chloe!.id, nickname: 'Chloé', avatar: chloe!.avatar },
      players: [
        { id: chloe!.id, nickname: 'Chloé', avatar: chloe!.avatar, passes: 1, points: 0 },
        { id: bob!.id, nickname: 'Bob', avatar: bob!.avatar, passes: 2, points: 700 },
        { id: alice!.id, nickname: 'Alice', avatar: alice!.avatar, passes: 1, points: 600 },
      ],
      asked: 5,
      last: { text: expect.any(String), answer: expect.any(String) },
    });
    expect(game.questionStats[0]).toMatchObject({ type: 'HOT_POTATO', correctCount: 2 });
    // Answers are over.
    expectGameError(() => tap(chloe!, 1), 'NOT_ANSWERING');
    // Streak: the next round, Alice and Bob survive again → streak bonus.
    game.next();
    game.next();
    vi.advanceTimersByTime(introOf(game));
    vi.advanceTimersByTime(FUSE_MS);
    const holder = (reveal().potato?.loser?.nickname ?? '') as string;
    const survivor = players.find((p) => p.nickname !== holder && p.nickname !== 'Chloé')!;
    expect(result(survivor).streak).toBe(2);
    expect(result(survivor).streakBonus).toBe(100);
  });

  it('« Passer » from the host = the bomb goes off now', () => {
    const players = joinAll('Alice', 'Bob', 'Chloé');
    toRound();
    game.next();
    expect(game.phase).toBe('REVEAL');
    expect(reveal().potato?.loser?.nickname).toBe('Bob');
    expect(result(players[0]!).pointsEarned).toBe(500);
  });

  it('the holder drops: paused, the fuse frozen; back → 3-2-1 → the fuse goes on', () => {
    const players = joinAll('Alice', 'Bob', 'Chloé');
    const bob = players[1]!;
    toRound();
    vi.advanceTimersByTime(10_000);
    game.disconnect(bob.socketId!);
    vi.advanceTimersByTime(PAUSE_GRACE_MS);
    expect(game.paused).toBe(true);
    expect(state().paused?.waitingFor.map((p) => p.nickname)).toEqual(['Bob']);
    expect(state().remainingMs).toBeUndefined();
    expect(state().potato?.elapsedMs).toBe(10_000);
    expectGameError(() => tap(bob, 1), 'GAME_PAUSED');
    vi.advanceTimersByTime(120_000);
    expect(game.phase).toBe('ANSWERING');
    const back = game.rejoin(bob.sessionToken, 'sock-bob-2');
    game.resync(back);
    expect(prompt(back).potato?.sub?.number).toBe(1); // the sub-question back
    vi.advanceTimersByTime(RESUME_COUNTDOWN_MS);
    expect(game.paused).toBe(false);
    vi.advanceTimersByTime(FUSE_MS - 10_000 - 1);
    expect(game.phase).toBe('ANSWERING');
    vi.advanceTimersByTime(1);
    expect(game.phase).toBe('REVEAL');
    expect(reveal().potato?.loser?.nickname).toBe('Bob');
  });

  it('another player drops: no pause, the bomb is never passed to an offline player', () => {
    const players = joinAll('Alice', 'Bob', 'Chloé');
    const [alice, , chloe] = players;
    toRound();
    game.disconnect(chloe!.socketId!);
    vi.advanceTimersByTime(PAUSE_GRACE_MS * 2);
    expect(game.paused).toBe(false);
    pass(players); // Bob → Alice (Chloé is offline)
    expect(holderOf(players)).toBe(alice);
    // A phone that rejoins without the bomb gets the holder, never a sub-question.
    const back = game.rejoin(chloe!.sessionToken, 'sock-chloé-2');
    game.resync(back);
    expect(prompt(back).potato).toEqual({
      holder: { id: alice!.id, nickname: 'Alice', avatar: alice!.avatar },
      from: expect.objectContaining({ nickname: 'Bob' }),
      passes: 0,
    });
  });

  it('« Continuer sans » the offline holder: someone else gets the bomb', () => {
    const players = joinAll('Alice', 'Bob', 'Chloé');
    const bob = players[1]!;
    toRound();
    game.disconnect(bob.socketId!);
    vi.advanceTimersByTime(PAUSE_GRACE_MS);
    expect(game.paused).toBe(true);
    game.resume();
    expect(holderOf(players)).not.toBe(bob);
    expect(prompt(holderOf(players)).potato?.sub).toBeDefined();
    vi.advanceTimersByTime(RESUME_COUNTDOWN_MS);
    expect(game.paused).toBe(false);
    game.next();
    // Bob was excused (absent): no answer, no point, but not the loser.
    expect(reveal().potato?.loser?.nickname).not.toBe('Bob');
  });

  it('the holder is kicked: the bomb moves on; the last one kicked → reveal', () => {
    const players = joinAll('Alice', 'Bob', 'Chloé');
    const [alice, bob, chloe] = players;
    toRound();
    game.kick(bob!.id);
    expect([alice, chloe]).toContain(holderOf(players));
    expect(prompt(holderOf(players)).potato?.sub?.number).toBe(2);
    expect(game.phase).toBe('ANSWERING');
    game.kick(holderOf(players).id);
    expect(game.phase).toBe('ANSWERING'); // the last player holds it
    const last = holderOf(players);
    game.kick(last.id);
    expect(game.phase).toBe('REVEAL');
    expect(reveal().potato?.loser).toBeUndefined();
  });

  it('one player alone: revealed at once, nothing scored, streak and hearts untouched', () => {
    create({ mode: 'survival', hearts: 1 });
    const [alice] = joinAll('Alice');
    game.start();
    vi.advanceTimersByTime(introOf(game));
    expect(game.phase).toBe('REVEAL');
    expect(result(alice!)).toMatchObject({ pointsEarned: 0, potato: { exploded: false } });
    const surv = rec.last('survival:state') as SurvivalStatePayload;
    expect(surv.players[0]!.hearts).toBe(1);
  });

  it('the TV resync gets the holder and the sub-question; the remote gets the right choice', () => {
    const players = joinAll('Alice', 'Bob', 'Chloé');
    toRound();
    game.remoteConnected('remote-1');
    pass(players); // Bob → Chloé, sub 2
    expect((rec.last('remote:answer', 'remote-1') as RemoteAnswerPayload).answer).toEqual([
      '2. Combien font 2 + 2 ?',
      '→ 4',
    ]);
    game.hostConnected('tv-2');
    game.resyncHost('tv-2');
    expect((rec.last('game:state', 'tv-2') as GameStatePayload).potato?.holder?.nickname).toBe(
      'Chloé',
    );
    expect((rec.last('question:show', 'tv-2') as QuestionShowPayload).potato?.sub?.number).toBe(2);
  });

  it('team mode: team averages of the round', () => {
    create({ mode: 'teams', teamCount: 2 });
    const [alice, bob, chloe] = joinAll('Alice', 'Bob', 'Chloé');
    game.setTeam(alice!.id, 0);
    game.setTeam(bob!.id, 0);
    game.setTeam(chloe!.id, 1);
    toRound();
    // Bob holds it, passes to Chloé (100), Chloé to Alice (100), the fuse goes off on Alice.
    pass([alice!, bob!, chloe!]);
    pass([alice!, bob!, chloe!]);
    vi.advanceTimersByTime(FUSE_MS);
    game.next();
    const board = rec.last('leaderboard', 'host') as StandingsPayload;
    expect(board.teams?.map((t) => [t.id, t.score])).toEqual([
      [1, 600],
      [0, 300], // (0 + 600) / 2
    ]);
  });

  it('« Survie »: only the loser loses a heart', () => {
    create({ mode: 'survival', hearts: 3 });
    const players = joinAll('Alice', 'Bob', 'Chloé');
    toRound();
    game.next(); // explodes on Bob
    const surv = rec.last('survival:state') as SurvivalStatePayload;
    expect(Object.fromEntries(surv.players.map((p) => [p.nickname, p.hearts]))).toEqual({
      Alice: 3,
      Bob: 2,
      Chloé: 3,
    });
    expect(players).toHaveLength(3);
  });

  it('no joker on this type', () => {
    create({ jokers: true });
    const [alice, bob] = joinAll('Alice', 'Bob');
    game.start();
    game.jokers!.setHand(bob!.id, ['double']);
    expectGameError(() => game.useJoker(bob!.id, 0, 'double'), 'JOKER_REFUSED');
    expect(alice).toBeDefined();
  });
});
