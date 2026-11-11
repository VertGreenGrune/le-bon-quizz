import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { introOf } from './testing.js';
import {
  PAUSE_GRACE_MS,
  QuestionSchema,
  RESUME_COUNTDOWN_MS,
  WAVELENGTH_SPECTRA,
  answerCancellable,
  answerText,
  jokerAvailability,
  spectrumKey,
  wavelengthPoints,
  type PlayerResultPayload,
  type QuestionPromptPayload,
  type QuestionRevealPayload,
  type QuestionShowPayload,
  type Quiz,
  type RemoteAnswerPayload,
  type ServerToClientEvents,
  type StandingsPayload,
  type SurvivalStatePayload,
  type WavelengthQuestion,
} from '@lbq/shared';
import { Game, type GameSettings, type GameTransport, type Player } from './Game.js';
import { GameError } from './errors.js';
import { forbiddenWord, pickTarget } from './questionTypes/wavelength.js';

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

const wavelength = (
  text: string,
  spectra: WavelengthQuestion['spectra'] = [{ left: 'Froid', right: 'Chaud' }],
): WavelengthQuestion => ({
  text,
  type: 'WAVELENGTH',
  spectra,
  clueTimeSec: 30,
  timeLimitSec: 30,
  basePoints: 1000,
});

const quiz: Quiz = {
  id: 'wavelength',
  title: 'Onde',
  questions: [wavelength('Sur la même longueur d’onde !'), wavelength('Encore !')],
};

/** random() = 0.5 → spectrum in the middle of the list, target 10 + 40 = 50. */
const HALF = () => 0.5;

describe('« Sur la même longueur d’onde » (WAVELENGTH)', () => {
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
      { mode: 'solo', random: HALF, allAnsweredGraceMs: 0, ...settings },
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
  const clue = (p: Player, text: string) => game.answer(p.id, game.questionIndex, { text });
  const needle = (p: Player, value: number) => game.answer(p.id, game.questionIndex, { value });
  const toClue = () => {
    game.start();
    vi.advanceTimersByTime(introOf(game));
    expect(game.phase).toBe('ANSWERING');
  };
  const psychicOf = (players: Player[]) => {
    const id = show().wavelength?.psychic?.id;
    return players.find((p) => p.id === id)!;
  };
  /** Every frame a phone got (by socket id). */
  const phoneFrames = (...players: Player[]) =>
    rec.sent.filter((s) => players.some((p) => s.to === p.socketId) || s.to === 'all');

  it('schema: defaults, bounds; helpers', () => {
    const q = QuestionSchema.parse({ text: 'Q', type: 'WAVELENGTH' });
    expect(q).toMatchObject({ timeLimitSec: 30, clueTimeSec: 30, spectra: [] });
    for (const bad of [
      { clueTimeSec: 9 },
      { clueTimeSec: 121 },
      { spectra: [{ left: '', right: 'Chaud' }] },
      { spectra: [{ left: 'x'.repeat(31), right: 'Chaud' }] },
      { spectra: Array.from({ length: 31 }, () => ({ left: 'a', right: 'b' })) },
      { buzzer: true },
    ])
      expect(QuestionSchema.safeParse({ text: 'Q', type: 'WAVELENGTH', ...bad }).success).toBe(
        false,
      );
    expect(answerCancellable('WAVELENGTH')).toBe(true);
    expect(jokerAvailability('WAVELENGTH').jokers).toBe(false);
    expect(
      answerText(wavelength('Q'), undefined, undefined, {
        spectrum: { left: 'Froid', right: 'Chaud' },
        target: 63,
      }),
    ).toEqual(['63 sur 100', '(0 = Froid, 100 = Chaud)']);
    expect(answerText(wavelength('Q'))).toEqual([]);
    expect([0, 5, 6, 12, 13, 20, 21, 80].map((d) => wavelengthPoints(1000, d))).toEqual([
      1000, 1000, 600, 600, 300, 300, 0, 0,
    ]);
    expect(WAVELENGTH_SPECTRA.length).toBeGreaterThanOrEqual(60);
    expect(new Set(WAVELENGTH_SPECTRA.map(spectrumKey)).size).toBe(WAVELENGTH_SPECTRA.length);
    for (const s of WAVELENGTH_SPECTRA) {
      expect(s.left.length).toBeLessThanOrEqual(30);
      expect(s.right.length).toBeLessThanOrEqual(30);
    }
    expect([0, 0.5, 0.999999].map((r) => pickTarget(() => r))).toEqual([10, 50, 90]);
  });

  it('forbidden words: the ends of the scale (normalized, plural), not the small words', () => {
    const s = { left: 'Mauvais animal de compagnie', right: 'Bon animal de compagnie' };
    expect(forbiddenWord(s, 'Un chien de garde')).toBeUndefined();
    expect(forbiddenWord(s, 'Les ANIMAUX')).toBeUndefined(); // another word
    expect(forbiddenWord(s, 'Des animals')).toBe('animal');
    expect(forbiddenWord({ left: 'Froid', right: 'Chaud' }, 'Pas très chaud !')).toBe('chaud');
    expect(forbiddenWord({ left: 'Été', right: 'Hiver' }, 'Les ete')).toBe('ete');
    expect(forbiddenWord({ left: 'Froid', right: 'Chaud' }, 'Un glaçon')).toBeUndefined();
  });

  it('psychics take turns (the « Dessine-moi » rule), scales are not repeated', () => {
    create(
      { random: Math.random },
      {
        id: 'w',
        title: 'W',
        questions: [wavelength('1', []), wavelength('2', []), wavelength('3', [])],
      },
    );
    const players = joinAll('Alice', 'Bob', 'Chloé');
    const psychics: string[] = [];
    const scales: string[] = [];
    game.start();
    for (let i = 0; i < 3; i++) {
      psychics.push(show().wavelength!.psychic!.nickname);
      scales.push(spectrumKey(show().wavelength!.spectrum));
      game.next(); // intro → clue
      game.next(); // clue → reveal (no clue)
      game.next(); // reveal → leaderboard
      game.next(); // → next question
    }
    expect(psychics).toEqual(['Alice', 'Bob', 'Chloé']);
    expect(new Set(scales).size).toBe(3);
    expect(players).toHaveLength(3);
  });

  it('the target reaches the psychic’s phone only (never the TV nor the others) before the reveal', () => {
    const players = joinAll('Alice', 'Bob', 'Chloé');
    toClue();
    const psychic = psychicOf(players);
    expect(psychic.nickname).toBe('Alice');
    const [, bob, chloe] = players;
    expect(prompt(psychic).wavelength).toMatchObject({
      stage: 'clue',
      target: 50,
      spectrum: { left: 'Froid', right: 'Chaud' },
      maxLength: 40,
    });
    expect(prompt(psychic).timeLimitSec).toBe(30);
    expect(prompt(bob!).wavelength).not.toHaveProperty('target');
    expect(show().wavelength).toEqual({
      stage: 'clue',
      psychic: { id: psychic.id, nickname: 'Alice', avatar: psychic.avatar },
      spectrum: { left: 'Froid', right: 'Chaud' },
    });
    clue(psychic, 'Un bon thé');
    expect(show().wavelength).toMatchObject({ stage: 'guess', clue: 'Un bon thé' });
    expect(prompt(bob!).wavelength).toMatchObject({ stage: 'guess', clue: 'Un bon thé' });
    expect(prompt(psychic).wavelength).toMatchObject({ stage: 'guess', target: 50 });
    needle(bob!, 55);
    // Nothing with the target to the others nor the TV before the reveal.
    const leaks = [...phoneFrames(bob!, chloe!), ...rec.sent.filter((s) => s.to === 'host')]
      .filter((s) => s.event !== 'question:reveal' && s.event !== 'player:result')
      .filter((s) => JSON.stringify(s.payload).includes('"target"'));
    expect(leaks).toEqual([]);
    // The remote gets it (host's phone).
    game.remoteConnected('remote-1');
    game.resyncRemote('remote-1');
    expect((rec.last('remote:answer', 'remote-1') as RemoteAnswerPayload).answer).toEqual([
      '50 sur 100',
      '(0 = Froid, 100 = Chaud)',
    ]);
  });

  it('clue stage: only the psychic writes (once), forbidden words refused, the others wait', () => {
    const players = joinAll('Alice', 'Bob');
    toClue();
    const [alice, bob] = players;
    expect(rec.last('answer:count', 'host')).toEqual({ answered: 0, total: 1 });
    expectGameError(() => clue(bob!, 'Hop'), 'INVALID_PAYLOAD');
    expectGameError(() => needle(bob!, 40), 'INVALID_PAYLOAD');
    expectGameError(() => needle(alice!, 40), 'INVALID_PAYLOAD');
    expectGameError(() => clue(alice!, '   '), 'INVALID_PAYLOAD');
    expectGameError(() => clue(alice!, 'Pas trop chaud'), 'CLUE_REFUSED');
    expect(show().wavelength?.stage).toBe('clue');
    clue(alice!, 'Une douche tiède, un peu longue, avec de la musique très forte');
    expect(show().wavelength).toMatchObject({
      stage: 'guess',
      clue: 'Une douche tiède, un peu longue, avec de',
    });
    expect(show().timeLimitSec).toBe(30);
    expect(game.statePayload().remainingMs).toBe(30_000);
    expect(rec.last('answer:count', 'host')).toEqual({ answered: 0, total: 1 });
    // The psychic doesn't guess.
    expectGameError(() => needle(alice!, 50), 'INVALID_PAYLOAD');
    expectGameError(() => clue(alice!, 'Encore'), 'INVALID_PAYLOAD');
  });

  it('scores by distance; the psychic gets the guessers’ average, streak unchanged', () => {
    const players = joinAll('Alice', 'Bob', 'Chloé', 'David', 'Emma');
    toClue();
    const [alice, bob, chloe, david, emma] = players;
    alice!.streak = 4;
    clue(alice!, 'Tiède');
    needle(bob!, 53); // 3 → 1000
    needle(chloe!, 40); // 10 → 600
    needle(david!, 70); // 20 → 300
    needle(emma!, 0); // 50 → 0
    expect(game.phase).toBe('REVEAL');
    expect(result(bob!)).toMatchObject({
      correct: true,
      pointsEarned: 1000,
      wavelength: { target: 50, clue: 'Tiède', psychic: false, psychicName: 'Alice', yours: 53 },
    });
    expect(result(chloe!)).toMatchObject({ correct: true, pointsEarned: 600 });
    expect(result(david!)).toMatchObject({ correct: false, pointsEarned: 300, streak: 0 });
    expect(result(emma!)).toMatchObject({ correct: false, pointsEarned: 0 });
    expect(result(alice!)).toMatchObject({
      correct: false,
      pointsEarned: 475, // (1000 + 600 + 300 + 0) / 4
      streak: 4,
      wavelength: { psychic: true },
    });
    expect(result(alice!).wavelength).not.toHaveProperty('yours');
    expect(reveal().wavelength).toMatchObject({
      target: 50,
      clue: 'Tiède',
      psychic: { nickname: 'Alice' },
      psychicPoints: 475,
      needles: [
        { nickname: 'Bob', value: 53, points: 1000 },
        { nickname: 'Chloé', value: 40, points: 600 },
        { nickname: 'David', value: 70, points: 300 },
        { nickname: 'Emma', value: 0, points: 0 },
      ],
    });
  });

  it('a guesser without a needle counts as 0 for the psychic; timer reveals', () => {
    const [alice, bob, chloe] = joinAll('Alice', 'Bob', 'Chloé');
    toClue();
    clue(alice!, 'Tiède');
    needle(bob!, 50);
    vi.advanceTimersByTime(30_000);
    expect(game.phase).toBe('REVEAL');
    expect(result(alice!).pointsEarned).toBe(500);
    expect(result(chloe!)).toMatchObject({ correct: false, pointsEarned: 0, streak: 0 });
  });

  it('no clue before the timer: revealed at once, nobody scores, streaks kept', () => {
    const [alice, bob] = joinAll('Alice', 'Bob');
    toClue();
    bob!.streak = 3;
    vi.advanceTimersByTime(30_000);
    expect(game.phase).toBe('REVEAL');
    expect(reveal().wavelength).toMatchObject({ clue: null, needles: [], psychicPoints: 0 });
    expect(result(bob!)).toMatchObject({ pointsEarned: 0, streak: 3 });
    expect(result(alice!).wavelength).toMatchObject({ clue: null, psychic: true });
  });

  it('alone: the psychic gives a clue, nobody to guess, revealed', () => {
    const [alice] = joinAll('Alice');
    toClue();
    clue(alice!, 'Tiède');
    expect(game.phase).toBe('REVEAL');
    expect(result(alice!).pointsEarned).toBe(0);
  });

  it('needles can be cancelled (T43) and placed again', () => {
    create({ allAnsweredGraceMs: 2000 });
    const [alice, bob, chloe] = joinAll('Alice', 'Bob', 'Chloé');
    toClue();
    clue(alice!, 'Tiède');
    needle(bob!, 0);
    needle(chloe!, 50);
    expect(game.phase).toBe('ANSWERING'); // 2 s grace
    game.unanswer(bob!.id, 0);
    needle(bob!, 51);
    vi.advanceTimersByTime(2_000);
    expect(game.phase).toBe('REVEAL');
    expect(result(bob!).pointsEarned).toBe(1000);
    expectGameError(() => game.unanswer(alice!.id, 0), 'NOT_ANSWERING');
  });

  it('the host skips each stage (« Passer »)', () => {
    const [alice, bob] = joinAll('Alice', 'Bob');
    toClue();
    clue(alice!, 'Tiède');
    expect(show().wavelength?.stage).toBe('guess');
    game.next();
    expect(game.phase).toBe('REVEAL');
    expect(result(bob!).pointsEarned).toBe(0);
  });

  it('psychic offline: pauses the clue stage, and the guesses too; a guesser offline only in stage 2', () => {
    const [alice, bob, chloe] = joinAll('Alice', 'Bob', 'Chloé');
    toClue();
    // A guesser who drops during the clue: no pause (nothing to do yet).
    game.disconnect(chloe!.socketId!);
    vi.advanceTimersByTime(PAUSE_GRACE_MS + 1_000);
    expect(game.paused).toBe(false);
    let back = game.rejoin(chloe!.sessionToken, 'sock-chloe-2');
    game.resync(back);
    expect(rec.last('question:prompt', 'sock-chloe-2')).toMatchObject({
      wavelength: { stage: 'clue', psychic: { nickname: 'Alice' } },
    });
    // The psychic drops: paused, then the rejoin brings the target back.
    game.disconnect(alice!.socketId!);
    vi.advanceTimersByTime(PAUSE_GRACE_MS + 10_000);
    expect(game.paused).toBe(true);
    back = game.rejoin(alice!.sessionToken, 'sock-alice-2');
    game.resync(back);
    expect(rec.last('question:prompt', 'sock-alice-2')).toMatchObject({
      wavelength: { stage: 'clue', target: 50 },
    });
    vi.advanceTimersByTime(RESUME_COUNTDOWN_MS);
    expect(game.paused).toBe(false);
    clue(alice!, 'Tiède');
    // Stage 2: the psychic dropping pauses too (like the drawer).
    game.disconnect('sock-alice-2');
    vi.advanceTimersByTime(PAUSE_GRACE_MS + 1_000);
    expect(game.paused).toBe(true);
    expectGameError(() => needle(bob!, 50), 'GAME_PAUSED');
    back = game.rejoin(alice!.sessionToken, 'sock-alice-3');
    game.resync(back);
    expect(rec.last('question:prompt', 'sock-alice-3')).toMatchObject({
      wavelength: { stage: 'guess', target: 50, clue: 'Tiède' },
    });
    vi.advanceTimersByTime(RESUME_COUNTDOWN_MS);
    // A guesser rejoining gets the clue, never the target.
    game.disconnect('sock-chloe-2');
    back = game.rejoin(chloe!.sessionToken, 'sock-chloe-3');
    game.resync(back);
    const p = rec.last('question:prompt', 'sock-chloe-3') as QuestionPromptPayload;
    expect(p.wavelength).toMatchObject({ stage: 'guess', clue: 'Tiède' });
    expect(p.wavelength).not.toHaveProperty('target');
    // The TV after a reload.
    game.resyncHost('host-2');
    expect(rec.last('question:show', 'host-2')).toMatchObject({
      wavelength: { stage: 'guess', clue: 'Tiède' },
    });
    needle(bob!, 50);
    needle(chloe!, 50);
    expect(game.phase).toBe('REVEAL');
  });

  it('kicking the psychic during the clue: revealed without a clue', () => {
    const [alice, bob] = joinAll('Alice', 'Bob');
    toClue();
    game.kick(alice!.id);
    vi.advanceTimersByTime(0);
    expect(game.phase).toBe('REVEAL');
    expect(result(bob!).pointsEarned).toBe(0);
  });

  it('team mode: teams take turns as psychic; team averages', () => {
    create({ mode: 'teams', teamCount: 2 });
    const [alice, bob, chloe] = joinAll('Alice', 'Bob', 'Chloé');
    game.setTeam(alice!.id, 0);
    game.setTeam(bob!.id, 0);
    game.setTeam(chloe!.id, 1);
    toClue();
    expect(show().wavelength?.psychic?.nickname).toBe('Alice');
    clue(alice!, 'Tiède');
    needle(bob!, 50); // 1000
    needle(chloe!, 62); // 12 → 600
    expect(result(alice!).pointsEarned).toBe(800);
    game.next();
    const board = rec.last('leaderboard', 'host') as StandingsPayload;
    expect(board.teams?.map((t) => [t.id, t.score])).toEqual([
      [0, 900],
      [1, 600],
    ]);
    game.next();
    expect(show().wavelength?.psychic?.nickname).toBe('Chloé'); // the other team's turn
  });

  it('« Survie »: a far needle costs a heart; never the psychic', () => {
    create({ mode: 'survival', hearts: 3 });
    const [alice, bob, chloe] = joinAll('Alice', 'Bob', 'Chloé');
    toClue();
    clue(alice!, 'Tiède');
    needle(bob!, 55); // right
    needle(chloe!, 63); // 13 → wrong (300 points)
    const state = rec.last('survival:state') as SurvivalStatePayload;
    const hearts = Object.fromEntries(state.players.map((p) => [p.nickname, p.hearts]));
    expect(hearts).toEqual({ Alice: 3, Bob: 3, Chloé: 2 });
    expect(result(chloe!).pointsEarned).toBe(300);
  });

  it('« Survie » without a clue: nobody loses a heart', () => {
    create({ mode: 'survival', hearts: 3 });
    joinAll('Alice', 'Bob');
    toClue();
    vi.advanceTimersByTime(30_000);
    const state = rec.last('survival:state') as SurvivalStatePayload;
    expect(state.players.map((p) => p.hearts)).toEqual([3, 3]);
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
