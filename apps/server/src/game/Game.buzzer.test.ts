import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FREEZE_MS,
  PAUSE_GRACE_MS,
  QUESTION_INTRO_MS,
  RESUME_COUNTDOWN_MS,
  QuizSchema,
  type GameStatePayload,
  type PlayerResultPayload,
  type QuestionPromptPayload,
  type QuestionRevealPayload,
  type QuestionShowPayload,
  type Quiz,
  type ServerToClientEvents,
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

/** Q1 classic MCQ, Q2 + Q3 au buzzer (MCQ, typed answer), Q4 slider au buzzer. */
const BUZZER_QUIZ: Quiz = QuizSchema.parse({
  id: 'buzz',
  title: 'Buzzer',
  questions: [
    {
      type: 'MCQ',
      text: 'Échauffement',
      timeLimitSec: 20,
      choices: [
        { text: 'Oui', isCorrect: true },
        { text: 'Non', isCorrect: false },
      ],
    },
    {
      type: 'MCQ',
      text: 'Qui a réalisé Edward aux mains d’argent ?',
      timeLimitSec: 20,
      buzzer: true,
      choices: [
        { text: 'Tim Burton', isCorrect: true },
        { text: 'Steven Spielberg', isCorrect: false },
      ],
    },
    {
      type: 'TYPE_ANSWER',
      text: 'Le plus grand océan ?',
      timeLimitSec: 20,
      buzzer: true,
      acceptedAnswers: ['Pacifique'],
    },
    {
      type: 'SLIDER',
      text: 'Prise de la Bastille ?',
      timeLimitSec: 20,
      buzzer: true,
      slider: { min: 1700, max: 1900, correct: 1789, margin: 5 },
    },
  ],
});

describe('Game « Buzzer » questions', () => {
  let rec: ReturnType<typeof recorder>;
  let game: Game;

  const create = (settings?: GameSettings) => {
    game?.dispose();
    rec = recorder();
    game = new Game('123456', BUZZER_QUIZ, rec.transport, {}, settings);
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
  const state = () => game.statePayload();
  const lastState = () => rec.last('game:state', 'all') as GameStatePayload;
  const result = (p: Player) => rec.last('player:result', p.socketId!) as PlayerResultPayload;
  const reveal = () => rec.last('question:reveal', 'host') as QuestionRevealPayload;
  const member = (p: Player) => ({ id: p.id, nickname: p.nickname, avatar: p.avatar });
  /** Starts the game and goes to ANSWERING of question `index` (no one answers before). */
  const toAnswering = (index: number) => {
    game.start();
    for (let i = 0; i < index; i++) {
      vi.advanceTimersByTime(QUESTION_INTRO_MS);
      game.next(); // ANSWERING → REVEAL
      game.next(); // → LEADERBOARD
      game.next(); // → next question
    }
    vi.advanceTimersByTime(QUESTION_INTRO_MS);
    expect(game.phase).toBe('ANSWERING');
    expect(game.questionIndex).toBe(index);
  };

  it('phones only get a BUZZ prompt; the TV gets the question without choices + the answer', () => {
    const [alice] = joinAll('Alice', 'Bob');
    toAnswering(1);
    expect(rec.last('question:prompt', alice!.socketId!)).toEqual({
      index: 1,
      type: 'MCQ',
      timeLimitSec: 20,
      buzzer: true,
    } satisfies QuestionPromptPayload);
    const show = rec.last('question:show', 'host') as QuestionShowPayload;
    expect(show).toMatchObject({ choices: [], buzzer: { answer: ['Tim Burton'] } });
    // Nothing sent to the phones / the room carries the answer.
    const leaked = rec.sent.filter(
      (s) => s.to !== 'host' && JSON.stringify(s.payload).includes('Tim Burton'),
    );
    expect(leaked).toEqual([]);
    expect(state().buzzer).toEqual({ wrong: [] });
    // Answer buttons don't exist on a buzzer question.
    expectGameError(() => game.answer(alice!.id, 1, 0), 'INVALID_PAYLOAD');
    // A classic question has no buzzer status.
    create();
    joinAll('Alice');
    toAnswering(0);
    expect(state().buzzer).toBeUndefined();
  });

  it('the first buzz processed by the server wins the hand; the others are refused', () => {
    const [alice, bob] = joinAll('Alice', 'Bob');
    toAnswering(1);
    vi.advanceTimersByTime(3_000);
    game.buzz(bob!.id, 1);
    expectGameError(() => game.buzz(alice!.id, 1), 'BUZZER_TAKEN');
    expect(lastState().buzzer).toEqual({ holder: member(bob!), wrong: [] });
    expectGameError(() => game.buzz(alice!.id, 0), 'NOT_ANSWERING');
  });

  it('can only buzz during ANSWERING', () => {
    const [alice] = joinAll('Alice');
    game.start();
    game.next(); // Q1 → ANSWERING
    game.next(); // REVEAL
    game.next(); // LEADERBOARD
    game.next(); // Q2 intro
    expect(game.phase).toBe('QUESTION_INTRO');
    expectGameError(() => game.buzz(alice!.id, 1), 'NOT_ANSWERING');
  });

  it('freezes the timer while the player answers out loud', () => {
    const [alice] = joinAll('Alice', 'Bob');
    toAnswering(1);
    vi.advanceTimersByTime(5_000);
    game.buzz(alice!.id, 1);
    expect(lastState().remainingMs).toBe(15_000);
    vi.advanceTimersByTime(60_000); // the host takes their time
    expect(game.phase).toBe('ANSWERING');
    expect(state().remainingMs).toBe(15_000);
  });

  it('a wrong answer locks the player out; the others can buzz and the timer goes on', () => {
    const [alice, bob] = joinAll('Alice', 'Bob');
    toAnswering(1);
    vi.advanceTimersByTime(5_000);
    game.buzz(alice!.id, 1);
    vi.advanceTimersByTime(10_000);
    game.judge(false);
    expect(lastState()).toMatchObject({ remainingMs: 15_000, buzzer: { wrong: [member(alice!)] } });
    expect(lastState().buzzer?.holder).toBeUndefined();
    expectGameError(() => game.buzz(alice!.id, 1), 'ALREADY_ANSWERED');
    vi.advanceTimersByTime(14_000);
    game.buzz(bob!.id, 1);
    expect(lastState().remainingMs).toBe(1_000);
    game.judge(true);
    expect(game.phase).toBe('REVEAL');
    expect(reveal()).toMatchObject({
      type: 'MCQ',
      distribution: [],
      correctIndexes: [0],
      buzzer: { answer: ['Tim Burton'], winner: member(bob!), wrong: [member(alice!)] },
    });
    expect(result(bob!)).toMatchObject({
      correct: true,
      pointsEarned: 1000, // base points, whatever the time
      buzzer: { won: true, wrong: false, winner: member(bob!), answer: ['Tim Burton'] },
    });
    expect(result(alice!)).toMatchObject({
      correct: false,
      pointsEarned: 0,
      streak: 0,
      buzzer: { won: false, wrong: true, winner: member(bob!) },
    });
  });

  it('nobody right before the timer ends: nobody scores', () => {
    const [alice, bob] = joinAll('Alice', 'Bob');
    toAnswering(1);
    game.buzz(alice!.id, 1);
    game.judge(false);
    vi.advanceTimersByTime(20_000);
    expect(game.phase).toBe('REVEAL');
    expect(reveal().buzzer).toEqual({
      answer: ['Tim Burton'],
      wrong: [member(alice!)],
    });
    for (const p of [alice!, bob!]) expect(result(p)).toMatchObject({ pointsEarned: 0 });
    expect(result(bob!).buzzer).toEqual({ answer: ['Tim Burton'], won: false, wrong: false });
    expect(game.questionStats.at(-1)).toMatchObject({ correctCount: 0, answerCount: 1 });
  });

  it('everyone answered wrong: the question ends right away', () => {
    const [alice, bob] = joinAll('Alice', 'Bob');
    toAnswering(1);
    game.buzz(alice!.id, 1);
    game.judge(false);
    game.buzz(bob!.id, 1);
    game.judge(false);
    expect(game.phase).toBe('REVEAL');
  });

  it('judging needs someone with the hand', () => {
    joinAll('Alice');
    toAnswering(1);
    expectGameError(() => game.judge(true), 'INVALID_PAYLOAD');
  });

  it('usual streak rules: base points + streak bonus for the winner', () => {
    const [alice, bob] = joinAll('Alice', 'Bob');
    game.start();
    vi.advanceTimersByTime(QUESTION_INTRO_MS);
    game.answer(alice!.id, 0, 0); // Q1 right (streak 1)
    game.answer(bob!.id, 0, 0);
    game.next();
    game.next();
    vi.advanceTimersByTime(QUESTION_INTRO_MS);
    game.buzz(alice!.id, 1);
    game.judge(true);
    expect(result(alice!)).toMatchObject({ streak: 2, streakBonus: 100, pointsEarned: 1100 });
    expect(result(bob!)).toMatchObject({ streak: 0, pointsEarned: 0 }); // didn't buzz
  });

  it('works for the other buzzer types (typed answer, slider)', () => {
    const [alice] = joinAll('Alice');
    toAnswering(2);
    expect(rec.last('question:show', 'host')).toMatchObject({ buzzer: { answer: ['Pacifique'] } });
    game.buzz(alice!.id, 2);
    game.judge(true);
    expect(result(alice!)).toMatchObject({ correct: true, pointsEarned: 1000 });
    game.next();
    game.next();
    vi.advanceTimersByTime(QUESTION_INTRO_MS);
    const show = rec.last('question:show', 'host') as QuestionShowPayload;
    expect(show.buzzer).toEqual({ answer: ['1789 (± 5)'] });
    expect(show.slider).toBeUndefined();
    expect(rec.last('question:prompt', alice!.socketId!)).not.toHaveProperty('slider');
  });

  it('team mode: the team average applies as usual', () => {
    create({ mode: 'teams', teamCount: 2 });
    const [alice, bob, chloe] = joinAll('Alice', 'Bob', 'Chloé');
    game.setTeam(alice!.id, 0);
    game.setTeam(bob!.id, 0);
    game.setTeam(chloe!.id, 1);
    toAnswering(1);
    game.buzz(chloe!.id, 1);
    game.judge(false);
    game.buzz(alice!.id, 1);
    game.judge(true);
    expect(result(alice!).team).toEqual({ id: 0, score: 500, rank: 1 }); // (1000 + 0) / 2
    expect(result(chloe!).team).toEqual({ id: 1, score: 0, rank: 2 });
  });

  it('« Survie »: a wrong buzz costs a heart, not buzzing does not', () => {
    create({ mode: 'survival', hearts: 3 });
    const [alice, bob, chloe] = joinAll('Alice', 'Bob', 'Chloé');
    toAnswering(1); // nobody answered Q1 (classic): one heart lost each
    game.buzz(alice!.id, 1);
    game.judge(false);
    game.buzz(bob!.id, 1);
    game.judge(true);
    expect(result(alice!).survival).toEqual({ hearts: 1, lostHeart: true });
    expect(result(bob!).survival).toEqual({ hearts: 2, lostHeart: false });
    expect(result(chloe!).survival).toEqual({ hearts: 2, lostHeart: false });
    // Nobody buzzes at all: nobody loses a heart.
    game.next();
    game.next();
    vi.advanceTimersByTime(QUESTION_INTRO_MS + 20_000);
    expect(game.phase).toBe('REVEAL');
    for (const p of [alice!, bob!, chloe!]) expect(result(p).survival?.lostHeart).toBe(false);
  });

  it('jokers: none can be played, but a pending Gel delays the BUZZ by 5 s', () => {
    create({ mode: 'solo', jokers: true, jokerHand: ['freeze', 'double'] });
    const [alice, bob] = joinAll('Alice', 'Bob');
    game.start();
    game.useJoker(alice!.id, 0, 'freeze', bob!.id); // lands on Bob's next question
    game.next(); // Q1 ANSWERING
    game.next(); // REVEAL
    game.next(); // LEADERBOARD
    game.next(); // Q2 (buzzer) intro
    expectGameError(() => game.useJoker(bob!.id, 1, 'double'), 'JOKER_REFUSED');
    expect(rec.last('joker:state', bob!.socketId!)).toMatchObject({
      questionIndex: 1,
      buzzer: true,
      effects: { frozen: { ms: FREEZE_MS } },
    });
    vi.advanceTimersByTime(QUESTION_INTRO_MS + 2_000);
    expectGameError(() => game.buzz(bob!.id, 1), 'FROZEN');
    vi.advanceTimersByTime(FREEZE_MS - 2_000);
    game.buzz(bob!.id, 1);
    expect(state().buzzer?.holder?.id).toBe(bob!.id);
  });

  it('pause: the holder drops, the host can still judge; the timer stays frozen meanwhile', () => {
    const [alice, bob] = joinAll('Alice', 'Bob');
    toAnswering(1);
    vi.advanceTimersByTime(4_000);
    game.buzz(alice!.id, 1);
    vi.advanceTimersByTime(3_000);
    game.disconnect(alice!.socketId!);
    vi.advanceTimersByTime(PAUSE_GRACE_MS);
    expect(game.paused).toBe(true);
    expect(lastState()).toMatchObject({
      remainingMs: 16_000,
      paused: { waitingFor: [member(alice!)] },
      buzzer: { holder: member(alice!) },
    });
    expectGameError(() => game.buzz(bob!.id, 1), 'GAME_PAUSED');
    game.judge(false); // said out loud before the drop: Alice no longer awaited
    expect(rec.last('game:resuming', 'all')).toEqual({ inMs: RESUME_COUNTDOWN_MS });
    vi.advanceTimersByTime(RESUME_COUNTDOWN_MS);
    expect(game.paused).toBe(false);
    expect(lastState().remainingMs).toBe(16_000);
    vi.advanceTimersByTime(15_999);
    expect(game.phase).toBe('ANSWERING');
    vi.advanceTimersByTime(1);
    expect(game.phase).toBe('REVEAL');
  });

  it('pause while someone has the hand: after the 3-2-1 the clock stays frozen until judged', () => {
    const [alice] = joinAll('Alice', 'Bob');
    toAnswering(1);
    game.buzz(alice!.id, 1);
    game.hostConnected('host-1');
    game.hostDisconnected('host-1');
    vi.advanceTimersByTime(PAUSE_GRACE_MS);
    expect(game.paused).toBe(true);
    game.hostConnected('host-2');
    vi.advanceTimersByTime(RESUME_COUNTDOWN_MS);
    expect(game.paused).toBe(false);
    vi.advanceTimersByTime(60_000);
    expect(game.phase).toBe('ANSWERING');
    expect(state()).toMatchObject({ remainingMs: 20_000, buzzer: { holder: member(alice!) } });
    game.judge(true);
    expect(game.phase).toBe('REVEAL');
  });

  it('host screen reloaded while someone has the hand: the resync shows who and the answer', () => {
    const [alice] = joinAll('Alice', 'Bob');
    toAnswering(1);
    game.buzz(alice!.id, 1);
    game.resyncHost('host-2');
    const toHost2 = rec.sent.filter((s) => s.to === 'host-2');
    expect(toHost2[0]).toMatchObject({
      event: 'game:state',
      payload: { phase: 'ANSWERING', buzzer: { holder: member(alice!) } },
    });
    expect(toHost2.find((s) => s.event === 'question:show')?.payload).toMatchObject({
      buzzer: { answer: ['Tim Burton'] },
    });
    game.judge(true); // the reloaded screen can judge
    expect(game.phase).toBe('REVEAL');
  });

  it('phone rejoin: gets the BUZZ prompt again and the buzzer status', () => {
    const [alice, bob] = joinAll('Alice', 'Bob');
    toAnswering(1);
    game.buzz(alice!.id, 1);
    game.disconnect(bob!.socketId!);
    const back = game.rejoin(bob!.sessionToken, 'sock-bob-2');
    game.resync(back);
    const toBob = rec.sent.filter((s) => s.to === 'sock-bob-2');
    expect(toBob[0]).toMatchObject({
      event: 'game:state',
      payload: { buzzer: { holder: member(alice!), wrong: [] } },
    });
    expect(toBob.find((s) => s.event === 'question:prompt')?.payload).toMatchObject({
      buzzer: true,
    });
    // The holder who comes back keeps the hand.
    game.disconnect(alice!.socketId!);
    game.resync(game.rejoin(alice!.sessionToken, 'sock-alice-2'));
    expect(state().buzzer?.holder?.id).toBe(alice!.id);
  });

  it('kicking the player who has the hand frees it and restarts the timer', () => {
    const [alice, bob] = joinAll('Alice', 'Bob');
    toAnswering(1);
    vi.advanceTimersByTime(5_000);
    game.buzz(alice!.id, 1);
    vi.advanceTimersByTime(5_000);
    game.kick(alice!.id);
    expect(lastState()).toMatchObject({ remainingMs: 15_000, buzzer: { wrong: [] } });
    game.buzz(bob!.id, 1);
    game.judge(true);
    expect(game.phase).toBe('REVEAL');
  });
});
