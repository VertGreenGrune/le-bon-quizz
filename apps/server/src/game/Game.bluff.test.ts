import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { introOf } from './testing.js';
import {
  PAUSE_GRACE_MS,
  QUESTION_INTRO_MS,
  RESUME_COUNTDOWN_MS,
  type BluffQuestion,
  type PlayerJokersPayload,
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

const bluff = (text: string, truth: string): BluffQuestion => ({
  text,
  type: 'BLUFF',
  truth,
  timeLimitSec: 45,
  voteTimeSec: 20,
  basePoints: 1000,
});

const quiz: Quiz = {
  id: 'bluff',
  title: 'Mytho',
  questions: [
    bluff('Le premier court-métrage de Tim Burton ?', 'Vincent'),
    bluff('Le vrai prénom de Beetlejuice ?', 'Betelgeuse'),
  ],
};

describe('« Mytho ! » (BLUFF)', () => {
  let rec: ReturnType<typeof recorder>;
  let game: Game;

  const create = (settings: Partial<GameSettings> = {}) => {
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
  const lie = (p: Player, text: string) => game.answer(p.id, game.questionIndex, { text });
  const options = () => {
    const b = show().bluff;
    if (b?.stage !== 'vote') throw new Error('not voting');
    return b.options;
  };
  /** Votes for the option with this text. */
  const vote = (p: Player, text: string) =>
    game.answer(p.id, game.questionIndex, { choiceIndex: options().indexOf(text) });
  const toWriting = () => {
    game.start();
    vi.advanceTimersByTime(introOf(game));
    expect(game.phase).toBe('ANSWERING');
  };
  /** Alice, Bob, Chloé write their lies: the vote starts. */
  const threeLies = () => {
    const players = joinAll('Alice', 'Bob', 'Chloé');
    toWriting();
    lie(players[0]!, 'Frankenweenie');
    lie(players[1]!, 'Hansel et Gretel');
    lie(players[2]!, 'Le Cavalier');
    return players;
  };

  it('phones write a lie, then vote among the shuffled lies + the truth', () => {
    const [alice, bob] = joinAll('Alice', 'Bob');
    toWriting();
    expect(prompt(alice!)).toMatchObject({ type: 'BLUFF', bluff: { stage: 'write' } });
    expect(show().bluff).toEqual({ stage: 'write' });
    lie(alice!, 'Frankenweenie');
    expect(rec.last('answer:count', 'host')).toEqual({ answered: 1, total: 2 });
    lie(bob!, 'Hansel et Gretel');
    // Every lie in: the vote starts with its own timer.
    expect(game.phase).toBe('ANSWERING');
    expect(game.statePayload().remainingMs).toBe(20_000);
    expect([...options()].sort()).toEqual(['Frankenweenie', 'Hansel et Gretel', 'Vincent']);
    const own = options().indexOf('Frankenweenie');
    expect(prompt(alice!)).toMatchObject({
      timeLimitSec: 20,
      bluff: { stage: 'vote', options: options(), own },
    });
    expect(rec.last('answer:count', 'host')).toEqual({ answered: 0, total: 2 });
  });

  it('phones never learn which answer is true before the reveal', () => {
    const [alice] = threeLies();
    const toPhones = rec.sent.filter(
      (s) => s.to.startsWith('sock-') || (s.to === 'all' && s.event !== 'game:state'),
    );
    const json = JSON.stringify(toPhones);
    expect(json).not.toContain('truth');
    expect(json).not.toContain('"correct"');
    // The options are the same for everyone (no hint in the order).
    expect((prompt(alice!).bluff as { options: string[] }).options).toEqual(options());
  });

  it('refuses a lie too close to the truth (accents, case, typos, article)', () => {
    const [alice] = joinAll('Alice', 'Bob');
    toWriting();
    for (const text of ['Vincent', 'vincent !', 'Le Vincent', 'Vinsent'])
      expectGameError(() => lie(alice!, text), 'LIE_TOO_CLOSE');
    lie(alice!, 'Vincent et Victor'); // far enough
    lie(alice!, 'Frankenweenie'); // a new lie replaces the previous one
    expect(prompt(alice!).bluff).toEqual({ stage: 'write', maxLength: 40 });
    game.resync(alice!);
    expect(prompt(alice!).bluff).toEqual({
      stage: 'write',
      maxLength: 40,
      lie: 'Frankenweenie',
    });
  });

  it('merges identical lies; no vote for your own lie (merged ones too)', () => {
    const [alice, bob, chloe] = joinAll('Alice', 'Bob', 'Chloé');
    toWriting();
    lie(alice!, 'Frankenweenie');
    lie(bob!, 'frankenweenie !');
    lie(chloe!, 'Le Cavalier');
    expect([...options()].sort()).toEqual(['Frankenweenie', 'Le Cavalier', 'Vincent']);
    expectGameError(() => vote(alice!, 'Frankenweenie'), 'INVALID_PAYLOAD');
    expectGameError(() => vote(bob!, 'Frankenweenie'), 'INVALID_PAYLOAD');
    expectGameError(() => game.answer(alice!.id, 0, { text: 'x' }), 'INVALID_PAYLOAD');
    vote(chloe!, 'Frankenweenie'); // fooled by both
    vote(alice!, 'Vincent');
    vote(bob!, 'Le Cavalier');
    expect(game.phase).toBe('REVEAL');
    expect(result(alice!)).toMatchObject({ correct: true, pointsEarned: 1250 });
    expect(result(bob!)).toMatchObject({ correct: false, pointsEarned: 250 });
    expect(result(chloe!)).toMatchObject({ correct: false, pointsEarned: 250 });
    expect(result(chloe!).bluff?.fellFor?.map((p) => p.nickname)).toEqual(['Alice', 'Bob']);
  });

  it('scores: +1000 for the truth, +250 per player fooled (+500 at most), even without voting', () => {
    const [alice, bob, chloe] = threeLies();
    vote(bob!, 'Frankenweenie');
    vote(chloe!, 'Frankenweenie');
    vi.advanceTimersByTime(20_000); // Alice never votes
    expect(game.phase).toBe('REVEAL');
    expect(result(alice!)).toMatchObject({
      correct: false,
      pointsEarned: 500,
      streak: 0,
      bluff: { found: false, lie: 'Frankenweenie', fooledPoints: 500, truth: 'Vincent' },
    });
    expect(result(alice!).bluff!.fooled.map((p) => p.nickname)).toEqual(['Bob', 'Chloé']);
    expect(result(bob!)).toMatchObject({ correct: false, pointsEarned: 0 });

    // Reveal order: the lies that fooled the fewest first, the truth last.
    const r = reveal().bluff!;
    expect(r.truth).toBe('Vincent');
    expect(r.options.map((o) => [o.text, o.voters.length])).toEqual([
      ['Hansel et Gretel', 0],
      ['Le Cavalier', 0],
      ['Frankenweenie', 2],
      ['Vincent', 0],
    ]);
    expect(r.options[2]!.authors.map((a) => a.nickname)).toEqual(['Alice']);
    expect(r.options[3]).toMatchObject({ truth: true, authors: [] });
    expect(game.questionStats[0]).toMatchObject({
      type: 'BLUFF',
      correctCount: 0,
      answerCount: 2,
      choices: [],
      distribution: [], // the votes are in `details.bluff`, not in a shape distribution
    });
  });

  it('finding the truth counts for the streak, points do not depend on the speed', () => {
    const [alice, bob, chloe] = threeLies();
    vi.advanceTimersByTime(15_000);
    vote(alice!, 'Vincent');
    vote(bob!, 'Vincent');
    vote(chloe!, 'Vincent');
    expect(result(alice!)).toMatchObject({ correct: true, pointsEarned: 1000, streak: 1 });
    game.next();
    game.next();
    vi.advanceTimersByTime(introOf(game));
    lie(alice!, 'Bételgeuse Junior');
    lie(bob!, 'Bob');
    lie(chloe!, 'Lydia');
    vote(alice!, 'Betelgeuse');
    vote(bob!, 'Betelgeuse');
    vote(chloe!, 'Betelgeuse');
    expect(result(alice!)).toMatchObject({ correct: true, streak: 2, pointsEarned: 1100 });
  });

  it('the timers: writing then voting; the host can skip each stage', () => {
    const [alice, bob] = joinAll('Alice', 'Bob');
    toWriting();
    lie(alice!, 'Frankenweenie');
    vi.advanceTimersByTime(45_000); // Bob writes nothing: the vote starts anyway
    expect(show().bluff?.stage).toBe('vote');
    expect(options()).toHaveLength(2);
    expect(prompt(bob!).bluff).toMatchObject({ stage: 'vote' }); // can still vote
    game.next(); // host skips the vote
    expect(game.phase).toBe('REVEAL');

    create();
    const [a2] = joinAll('Alice', 'Bob');
    toWriting();
    game.next(); // skips the writing
    expect(options()).toEqual(['Vincent']);
    vote(a2!, 'Vincent');
    expect(game.phase).toBe('ANSWERING'); // Bob still has to vote
  });

  it('pauses in both stages: timer frozen, then resumed', () => {
    const [alice, bob] = joinAll('Alice', 'Bob');
    toWriting();
    vi.advanceTimersByTime(10_000);
    game.disconnect(bob!.socketId!);
    vi.advanceTimersByTime(PAUSE_GRACE_MS + 30_000);
    expect(game.paused).toBe(true);
    expectGameError(() => lie(alice!, 'Frankenweenie'), 'GAME_PAUSED');
    game.rejoin(bob!.sessionToken, 'sock-bob-2');
    vi.advanceTimersByTime(RESUME_COUNTDOWN_MS);
    expect(game.statePayload().remainingMs).toBe(35_000);
    lie(alice!, 'Frankenweenie');
    lie(bob!, 'Hansel et Gretel');
    expect(show().bluff?.stage).toBe('vote');

    vote(bob!, 'Frankenweenie');
    game.disconnect('sock-Alice');
    vi.advanceTimersByTime(PAUSE_GRACE_MS + 60_000);
    expect(game.paused).toBe(true);
    expect(game.phase).toBe('ANSWERING');
    const back = game.rejoin(alice!.sessionToken, 'sock-alice-2');
    game.resync(back);
    expect(rec.last('question:prompt', 'sock-alice-2')).toMatchObject({
      bluff: { stage: 'vote', own: options().indexOf('Frankenweenie') },
    });
    vi.advanceTimersByTime(RESUME_COUNTDOWN_MS);
    vote(alice!, 'Vincent');
    expect(game.phase).toBe('REVEAL');
    expect(result(bob!).correct).toBe(false);
  });

  it('a kicked player’s lie is dropped while writing', () => {
    const [alice, bob, chloe] = joinAll('Alice', 'Bob', 'Chloé');
    toWriting();
    lie(bob!, 'Hansel et Gretel');
    game.kick(bob!.id);
    lie(alice!, 'Frankenweenie');
    lie(chloe!, 'Le Cavalier');
    expect([...options()].sort()).toEqual(['Frankenweenie', 'Le Cavalier', 'Vincent']);
  });

  it('team mode: team averages with the bluff points', () => {
    create({ mode: 'teams', teamCount: 2 });
    const [alice, bob, chloe] = joinAll('Alice', 'Bob', 'Chloé');
    game.setTeam(alice!.id, 0);
    game.setTeam(bob!.id, 0);
    game.setTeam(chloe!.id, 1);
    toWriting();
    lie(alice!, 'Frankenweenie');
    lie(bob!, 'Hansel et Gretel');
    lie(chloe!, 'Le Cavalier');
    vote(alice!, 'Vincent'); // 1000
    vote(bob!, 'Le Cavalier'); // 0
    vote(chloe!, 'Frankenweenie'); // 0, fools… for Alice: +250
    game.next();
    const board = rec.last('leaderboard', 'host') as StandingsPayload;
    // Rouge: (1250 + 0) / 2 = 625; Bleue: Chloé fooled Bob = 250.
    expect(board.teams?.map((t) => [t.id, t.score])).toEqual([
      [0, 625],
      [1, 250],
    ]);
  });

  describe('jokers', () => {
    const jokerGame = () => {
      create({ jokers: true });
      return joinAll('Alice', 'Bob', 'Chloé', 'Dan');
    };
    const state = (p: Player) => rec.last('joker:state', p.socketId!) as PlayerJokersPayload;

    it('Copieur copies the vote (not the lie)', () => {
      const [alice, bob, chloe, dan] = jokerGame();
      game.start();
      game.jokers!.setHand(dan!.id, ['copy']);
      game.useJoker(dan!.id, 0, 'copy', alice!.id);
      vi.advanceTimersByTime(introOf(game));
      for (const [p, t] of [
        [alice!, 'Frankenweenie'],
        [bob!, 'Hansel et Gretel'],
        [chloe!, 'Le Cavalier'],
        [dan!, 'Batman 3'],
      ] as const)
        lie(p, t);
      expect(show().bluff?.stage).toBe('vote');
      vote(alice!, 'Vincent');
      vote(bob!, 'Batman 3');
      vote(chloe!, 'Vincent');
      expect(game.phase).toBe('REVEAL'); // Dan voted through Alice
      expect(result(dan!)).toMatchObject({ correct: true, pointsEarned: 1250 });
    });

    it('a copied vote for your own lie scores nothing', () => {
      const [alice, bob, chloe, dan] = jokerGame();
      game.start();
      game.jokers!.setHand(dan!.id, ['copy']);
      game.useJoker(dan!.id, 0, 'copy', alice!.id);
      vi.advanceTimersByTime(introOf(game));
      lie(alice!, 'Frankenweenie');
      lie(bob!, 'Hansel et Gretel');
      lie(chloe!, 'Le Cavalier');
      lie(dan!, 'Batman 3');
      vote(alice!, 'Batman 3');
      expect(result(dan!)).toBeUndefined();
      vote(bob!, 'Vincent');
      vote(chloe!, 'Vincent');
      expect(result(dan!)).toMatchObject({ correct: false, pointsEarned: 250 }); // fooled Alice
    });

    it('50/50 hides half of the others’ lies, never the truth nor your own', () => {
      const [alice, bob, chloe, dan] = jokerGame();
      game.start();
      game.jokers!.setHand(alice!.id, ['fifty']);
      game.useJoker(alice!.id, 0, 'fifty');
      expect(state(alice!).effects).toEqual({}); // applied when the vote starts
      vi.advanceTimersByTime(introOf(game));
      lie(alice!, 'Frankenweenie');
      lie(bob!, 'Hansel et Gretel');
      lie(chloe!, 'Le Cavalier');
      lie(dan!, 'Batman 3');
      const hidden = state(alice!).effects.hiddenChoices!;
      expect(hidden).toHaveLength(2);
      const texts = hidden.map((i) => options()[i]);
      expect(texts).not.toContain('Vincent');
      expect(texts).not.toContain('Frankenweenie');
    });

    it('no Brouilleur nor Sablier on a « Mytho ! »; Double ou rien works', () => {
      const [alice, bob] = jokerGame();
      game.start();
      game.jokers!.setHand(alice!.id, ['scramble', 'hourglass', 'double']);
      expectGameError(() => game.useJoker(alice!.id, 0, 'scramble', bob!.id), 'JOKER_REFUSED');
      expectGameError(() => game.useJoker(alice!.id, 0, 'hourglass'), 'JOKER_REFUSED');
      game.useJoker(alice!.id, 0, 'double');
    });
  });
});
