import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DRAW_MAX_POINTS,
  DRAW_WORDS,
  PAUSE_GRACE_MS,
  QUESTION_INTRO_MS,
  RESUME_COUNTDOWN_MS,
  type DrawQuestion,
  type DrawStroke,
  type DrawStrokesPayload,
  type GameStatePayload,
  type PlayerResultPayload,
  type Question,
  type QuestionPromptPayload,
  type QuestionRevealPayload,
  type QuestionShowPayload,
  type Quiz,
  type ServerToClientEvents,
  type SurvivalStatePayload,
  type TeamId,
} from '@lbq/shared';
import { Game, type GameSettings, type GameTransport, type Player } from './Game.js';
import { GameError } from './errors.js';
import { isNearMiss } from './matching.js';
import { CLASSIC_QUIZ, rightAnswer, wrongAnswer } from './testing.js';

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

const draw = (words: string[] = ['Licorne'], basePoints: 0 | 1000 | 2000 = 1000): DrawQuestion => ({
  text: 'Dessine-moi…',
  type: 'DRAW',
  words,
  timeLimitSec: 90,
  basePoints,
});

const mcq = CLASSIC_QUIZ.questions[0]!;
const quizOf = (...questions: Question[]): Quiz => ({ id: 'draw', title: 'Dessin', questions });

const stroke = (id: number, points = [100, 100, 200, 150]): DrawStroke => ({
  id,
  color: 0,
  size: 1,
  points,
});

describe('« Dessine-moi » (DRAW)', () => {
  let rec: ReturnType<typeof recorder>;
  let game: Game;

  const create = (quiz: Quiz = quizOf(draw()), settings: Partial<GameSettings> = {}) => {
    game?.dispose();
    rec = recorder();
    game = new Game('123456', quiz, rec.transport, {}, { mode: 'solo', ...settings });
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
  const state = () => rec.last('game:state', 'all') as GameStatePayload;
  const guess = (p: Player, text: string) => game.answer(p.id, game.questionIndex, { text });
  const drawerName = () => game.statePayload().draw?.drawer?.nickname;
  const toAnswering = () => {
    vi.advanceTimersByTime(QUESTION_INTRO_MS);
    expect(game.phase).toBe('ANSWERING');
  };
  /** Skips to the intro of the next question (host presses « Suivant »). */
  const nextQuestion = () => {
    const index = game.questionIndex;
    while (game.questionIndex === index) game.next();
    expect(game.phase).toBe('QUESTION_INTRO');
  };

  describe('rotation', () => {
    it('everyone draws once before anyone draws twice (join order)', () => {
      create(quizOf(draw(), draw(), draw(), draw()));
      joinAll('Alice', 'Bob', 'Chloé');
      game.start();
      const drawers = [drawerName()];
      for (let i = 1; i < 4; i++) {
        nextQuestion();
        drawers.push(drawerName());
      }
      expect(drawers).toEqual(['Alice', 'Bob', 'Chloé', 'Alice']);
    });

    it('skips an offline player, who draws as soon as they are back', () => {
      create(quizOf(draw(), draw(), draw()));
      const [, bob] = joinAll('Alice', 'Bob', 'Chloé');
      game.disconnect(bob!.socketId!);
      game.start();
      expect(drawerName()).toBe('Alice');
      game.resume(); // « Continuer sans Bob »
      game.rejoin(bob!.sessionToken, 'sock-Bob-2');
      nextQuestion();
      expect(drawerName()).toBe('Bob');
      nextQuestion();
      expect(drawerName()).toBe('Chloé');
    });

    it('team mode: the teams take turns', () => {
      create(quizOf(draw(), draw(), draw(), draw()), { mode: 'teams', teamCount: 2 });
      const players = joinAll('Alice', 'Bob', 'Chloé', 'Dan');
      const teams: TeamId[] = [0, 1, 1, 0];
      players.forEach((p, i) => game.setTeam(p.id, teams[i]!));
      game.start();
      const drawers = [drawerName()];
      for (let i = 1; i < 4; i++) {
        nextQuestion();
        drawers.push(drawerName());
      }
      expect(drawers).toEqual(['Alice', 'Bob', 'Dan', 'Chloé']);
    });

    it('a built-in word when the question has none, never twice in a game', () => {
      create(quizOf(draw([]), draw([])), { random: () => 0 });
      const [alice, bob] = joinAll('Alice', 'Bob');
      game.start();
      toAnswering();
      const first = prompt(alice!).draw!.word!;
      expect(DRAW_WORDS).toContain(first);
      nextQuestion();
      toAnswering();
      const second = prompt(bob!).draw!.word!;
      expect(DRAW_WORDS).toContain(second);
      expect(second).not.toBe(first);
    });
  });

  describe('word secrecy', () => {
    it('only the drawer’s phone gets the word before the reveal', () => {
      const [alice, bob, chloe] = joinAll('Alice', 'Bob', 'Chloé');
      game.start();
      toAnswering();
      expect(prompt(alice!)).toMatchObject({
        type: 'DRAW',
        draw: { word: 'Licorne', hint: '_______', drawer: { nickname: 'Alice' } },
      });
      expect(prompt(bob!).draw).toEqual({
        drawer: expect.objectContaining({ nickname: 'Alice' }),
        hint: '_______',
        maxLength: 40,
      });
      expect(show().draw).toEqual({
        drawer: expect.objectContaining({ nickname: 'Alice' }),
        hint: '_______',
      });
      game.draw(alice!.id, 0, [stroke(1)]);
      guess(bob!, 'cheval');
      guess(chloe!, 'licorne');
      const beforeReveal = rec.sent.filter((s) => s.to !== alice!.socketId);
      expect(JSON.stringify(beforeReveal).toLowerCase()).not.toContain('licorne');

      vi.advanceTimersByTime(90_000);
      expect(reveal().draw?.word).toBe('Licorne');
      expect(result(bob!).draw).toMatchObject({ word: 'Licorne', found: false, drew: false });
    });

    it('the TV hint keeps spaces and hyphens', () => {
      create(quizOf(draw(['Tour Eiffel'])));
      joinAll('Alice', 'Bob');
      game.start();
      expect(show().draw?.hint).toBe('____ ______');
    });
  });

  describe('guesses', () => {
    it('wrong guesses are not recorded (try again), near misses say « Presque ! »', () => {
      const [alice, bob, chloe] = joinAll('Alice', 'Bob', 'Chloé');
      game.start();
      toAnswering();
      expect(guess(bob!, 'cheval')).toEqual({ guess: 'wrong' });
      expect(guess(bob!, 'Lycorn')).toEqual({ guess: 'close' });
      expect(rec.last('answer:count', 'host')).toEqual({ answered: 0, total: 2 });
      expect(guess(bob!, 'la licorn')).toEqual({ guess: 'found' }); // article + typo
      expect(rec.last('answer:count', 'host')).toEqual({ answered: 1, total: 2 });
      expectGameError(() => guess(bob!, 'licorne'), 'ALREADY_ANSWERED');
      // Who found it is public, never what they typed.
      expect(state().draw?.found.map((p) => p.nickname)).toEqual(['Bob']);
      expectGameError(() => guess(alice!, 'licorne'), 'INVALID_PAYLOAD'); // the drawer
      expectGameError(() => game.answer(chloe!.id, 0, { choiceIndex: 0 }), 'INVALID_PAYLOAD');
      expect(game.phase).toBe('ANSWERING');
    });

    it('near misses: one typo too many, or a word of the answer', () => {
      expect(isNearMiss('Lycorn', 'Licorne')).toBe(true);
      expect(isNearMiss('tour', 'tour Eiffel')).toBe(true);
      expect(isNearMiss('chat noir', 'chat')).toBe(true);
      expect(isNearMiss('chien', 'chat')).toBe(false);
      expect(isNearMiss('cha', 'chat')).toBe(true); // short words: one letter off
      expect(isNearMiss('8', '9')).toBe(false);
    });
  });

  describe('scoring', () => {
    it('guessers by speed, the drawer +200 per finder; ends when everyone found', () => {
      const [alice, bob, chloe] = joinAll('Alice', 'Bob', 'Chloé');
      game.start();
      toAnswering();
      guess(bob!, 'licorne');
      vi.advanceTimersByTime(45_000);
      guess(chloe!, 'licorne');
      expect(game.phase).toBe('REVEAL');
      expect(result(bob!)).toMatchObject({ correct: true, pointsEarned: 1000, streak: 1 });
      expect(result(chloe!)).toMatchObject({ correct: true, pointsEarned: 750 });
      expect(result(alice!)).toMatchObject({
        correct: false,
        pointsEarned: 400,
        streak: 0,
        draw: { drew: true, found: false, finders: 2, word: 'Licorne' },
      });
      expect(reveal().draw?.found.map((p) => [p.nickname, p.ms])).toEqual([
        ['Bob', 0],
        ['Chloé', 45_000],
      ]);
    });

    it('the drawer’s bonus stops at basePoints; a 0-point question gives nothing', () => {
      create(quizOf(draw(), draw(['Licorne'], 0)));
      const players = joinAll('A', 'B', 'C', 'D', 'E', 'F', 'G');
      game.start();
      toAnswering();
      for (const p of players.slice(1)) guess(p, 'licorne');
      expect(result(players[0]!).pointsEarned).toBe(1000); // 6 finders, capped
      nextQuestion();
      toAnswering();
      const drawer = players[1]!;
      for (const p of players.filter((p) => p !== drawer)) guess(p, 'licorne');
      expect(result(drawer).pointsEarned).toBe(0);
      expect(result(players[0]!)).toMatchObject({ correct: true, pointsEarned: 0 });
    });

    it('timer over: nobody found → 0 for everyone; the drawer’s streak is untouched', () => {
      create(quizOf(mcq, draw()));
      const [alice, bob] = joinAll('Alice', 'Bob');
      game.start();
      toAnswering();
      game.answer(alice!.id, 0, rightAnswer(mcq));
      game.answer(bob!.id, 0, rightAnswer(mcq));
      nextQuestion();
      expect(drawerName()).toBe('Alice');
      toAnswering();
      guess(bob!, 'cheval');
      vi.advanceTimersByTime(90_000);
      expect(game.phase).toBe('REVEAL');
      expect(result(alice!)).toMatchObject({ pointsEarned: 0, streak: 1 });
      expect(result(bob!)).toMatchObject({ correct: false, pointsEarned: 0, streak: 0 });
      expect(game.questionStats[1]).toMatchObject({
        type: 'DRAW',
        correctCount: 0,
        answerCount: 0,
      });
    });

    it('a game alone: nobody to guess, straight to the reveal', () => {
      joinAll('Alice');
      game.start();
      vi.advanceTimersByTime(QUESTION_INTRO_MS);
      expect(game.phase).toBe('REVEAL');
    });
  });

  it('team mode: the drawer counts in their team’s average with their bonus', () => {
    create(quizOf(draw()), { mode: 'teams', teamCount: 2 });
    const [alice, bob, chloe, dan] = joinAll('Alice', 'Bob', 'Chloé', 'Dan');
    game.setTeam(alice!.id, 0);
    game.setTeam(dan!.id, 0);
    game.setTeam(bob!.id, 1);
    game.setTeam(chloe!.id, 1);
    game.start();
    toAnswering();
    guess(bob!, 'licorne');
    guess(dan!, 'licorne');
    vi.advanceTimersByTime(90_000); // Chloé never finds
    // Red: (Alice 400 + Dan 1000) / 2; Blue: (Bob 1000 + Chloé 0) / 2.
    expect(result(alice!).team).toEqual({ id: 0, score: 700, rank: 1 });
    expect(result(chloe!).team).toEqual({ id: 1, score: 500, rank: 2 });
  });

  describe('« Survie »', () => {
    const survival = () => rec.last('survival:state', 'all') as SurvivalStatePayload;

    it('never costs a heart; a ghost who finds the word earns a haunt', () => {
      create(quizOf(mcq, draw(), draw()), { mode: 'survival', hearts: 1 });
      const [alice, bob, chloe] = joinAll('Alice', 'Bob', 'Chloé');
      game.start();
      toAnswering();
      game.answer(alice!.id, 0, rightAnswer(mcq));
      game.answer(bob!.id, 0, wrongAnswer(mcq)); // Bob becomes a ghost
      game.answer(chloe!.id, 0, rightAnswer(mcq));
      nextQuestion();
      expect(drawerName()).toBe('Alice');
      toAnswering();
      guess(bob!, 'licorne');
      vi.advanceTimersByTime(90_000); // Chloé doesn't find it: still alive
      expect(result(chloe!).survival).toEqual({ hearts: 1, lostHeart: false });
      expect(result(alice!).survival).toEqual({ hearts: 1, lostHeart: false });
      expect(result(bob!).survival).toMatchObject({ hearts: 0, hauntEarned: true, ghost: true });
      expect(survival().players.map((p) => p.hearts)).toEqual([1, 0, 1]);
      expect(survival().finished).toBeUndefined();
    });
  });

  describe('drawing', () => {
    it('strokes go to the TV only, chunks append to their stroke, clear empties it', () => {
      const [alice, bob] = joinAll('Alice', 'Bob');
      game.start();
      expectGameError(() => game.draw(alice!.id, 0, [stroke(1)]), 'NOT_ANSWERING'); // intro
      toAnswering();
      game.draw(alice!.id, 0, [stroke(1)]);
      game.draw(alice!.id, 0, [stroke(1, [300, 300]), stroke(2, [5, 5])]);
      const sent = rec.sent.filter((s) => s.event === 'draw:strokes');
      expect(sent.map((s) => s.to)).toEqual(['host', 'host']);
      expect(sent[1]!.payload).toEqual({
        index: 0,
        strokes: [stroke(1, [300, 300]), stroke(2, [5, 5])],
      });
      expectGameError(() => game.draw(bob!.id, 0, [stroke(9)]), 'INVALID_PAYLOAD');
      game.draw(alice!.id, 0, [stroke(3)], true);
      expect(rec.last('draw:strokes', 'host')).toEqual({
        index: 0,
        clear: true,
        strokes: [stroke(3)],
      });

      guess(bob!, 'licorne');
      expect(reveal().draw?.strokes).toEqual([stroke(3)]);
      // Saved in the report as vector data.
      expect(game.questionStats[0]!.details.draw).toMatchObject({
        word: 'Licorne',
        strokes: [stroke(3)],
        drawer: { nickname: 'Alice' },
      });
    });

    it('refuses a drawing that gets too big', () => {
      const [alice] = joinAll('Alice', 'Bob');
      game.start();
      toAnswering();
      const big = Array.from({ length: 400 }, (_, i) => i % 700);
      const chunks = Array.from({ length: 20 }, (_, i) => stroke(i, big));
      const perMessage = 20 * 200;
      for (let n = perMessage; n <= DRAW_MAX_POINTS; n += perMessage)
        game.draw(
          alice!.id,
          0,
          chunks.map((c) => ({ ...c, id: c.id + n })),
        );
      expectGameError(() => game.draw(alice!.id, 0, [stroke(9999)]), 'INVALID_PAYLOAD');
      game.draw(alice!.id, 0, [stroke(1)], true); // clearing makes room again
    });
  });

  describe('pause', () => {
    it('the drawer dropping pauses the game: the canvas freezes, guesses wait', () => {
      const [alice, bob] = joinAll('Alice', 'Bob');
      game.start();
      toAnswering();
      game.draw(alice!.id, 0, [stroke(1)]);
      game.disconnect(alice!.socketId!);
      vi.advanceTimersByTime(PAUSE_GRACE_MS);
      expect(state().paused?.waitingFor.map((p) => p.nickname)).toEqual(['Alice']);
      expectGameError(() => game.draw(alice!.id, 0, [stroke(2)]), 'GAME_PAUSED');
      expectGameError(() => guess(bob!, 'licorne'), 'GAME_PAUSED');

      // Back: the phone gets its word and its drawing so far, the TV goes on after the 3-2-1.
      game.rejoin(alice!.sessionToken, 'sock-Alice-2');
      game.resync(alice!);
      expect(prompt(alice!).draw?.word).toBe('Licorne');
      expect(rec.last('draw:strokes', 'sock-Alice-2')).toEqual({
        index: 0,
        clear: true,
        strokes: [stroke(1)],
      });
      vi.advanceTimersByTime(RESUME_COUNTDOWN_MS);
      expect(game.paused).toBe(false);
      game.draw(alice!.id, 0, [stroke(2)]);
      expect(guess(bob!, 'licorne')).toEqual({ guess: 'found' });
      expect(result(bob!).pointsEarned).toBe(1000); // the pause isn't counted
    });

    it('a guesser dropping pauses it too (still has to find)', () => {
      const [, bob] = joinAll('Alice', 'Bob');
      game.start();
      toAnswering();
      game.disconnect(bob!.socketId!);
      vi.advanceTimersByTime(PAUSE_GRACE_MS);
      expect(game.paused).toBe(true);
    });
  });

  describe('rejoin', () => {
    it('the reloaded TV gets the drawing so far; a finder gets no new prompt', () => {
      const [alice, bob, chloe] = joinAll('Alice', 'Bob', 'Chloé');
      game.start();
      toAnswering();
      game.draw(alice!.id, 0, [stroke(1)]);
      game.draw(alice!.id, 0, [stroke(1, [400, 400]), stroke(2)]);
      game.resyncHost('host-2');
      expect(rec.last('question:show', 'host-2')).toMatchObject({ draw: { hint: '_______' } });
      expect(rec.last('draw:strokes', 'host-2')).toEqual({
        index: 0,
        clear: true,
        strokes: [stroke(1, [100, 100, 200, 150, 400, 400]), stroke(2)],
      });

      guess(bob!, 'licorne');
      game.disconnect(bob!.socketId!);
      game.rejoin(bob!.sessionToken, 'sock-Bob-2');
      game.resync(bob!);
      expect(rec.sent.some((s) => s.to === 'sock-Bob-2' && s.event === 'question:prompt')).toBe(
        false,
      );
      const resynced = rec.last('game:state', 'sock-Bob-2') as GameStatePayload;
      expect(resynced.draw?.found.map((p) => p.nickname)).toEqual(['Bob']);
      // A guesser who reloads gets the guess field back, without the word.
      game.resync(chloe!);
      expect(prompt(chloe!).draw?.word).toBeUndefined();
    });
  });

  it('takes no joker', () => {
    create(quizOf(draw()), { jokers: true, jokerHand: ['double', 'shield', 'freeze'] });
    const [alice, bob] = joinAll('Alice', 'Bob');
    game.start();
    expectGameError(() => game.useJoker(bob!.id, 0, 'double'), 'JOKER_REFUSED');
    expectGameError(() => game.useJoker(alice!.id, 0, 'freeze', bob!.id), 'JOKER_REFUSED');
  });
});
