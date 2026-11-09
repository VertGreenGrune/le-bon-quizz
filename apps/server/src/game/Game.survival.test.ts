import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEMO_QUIZ,
  FREEZE_MS,
  PAUSE_GRACE_MS,
  QUESTION_INTRO_MS,
  RESUME_COUNTDOWN_MS,
  SURVIVAL_DEFAULT_HEARTS,
  type AnswerInput,
  type JokerUsedPayload,
  type PlayerJokersPayload,
  type PlayerResultPayload,
  type Question,
  type QuestionPromptPayload,
  type QuestionShowPayload,
  type Quiz,
  type ServerToClientEvents,
  type StandingsPayload,
  type SurvivalStatePayload,
} from '@lbq/shared';
import { Game, type GameSettings, type GameTransport, type Player } from './Game.js';
import { GameError } from './errors.js';
import { gameRecord } from './persistence.js';
import { rightAnswer, wrongAnswer, introOf } from './testing.js';

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
const mcq = (text: string): Question => ({
  ...base,
  text,
  type: 'MCQ',
  choices: [
    { text: 'Bon', isCorrect: true },
    { text: 'Faux A', isCorrect: false },
    { text: 'Faux B', isCorrect: false },
  ],
});
const ITEMS = ['Beetlejuice', 'Batman', 'Edward', 'Ed Wood'];
const ZONE = { x: 0.5, y: 0.3, radius: 0.1 };
const IMAGE = 'http://localhost:3001/uploads/carte.png';

/** 6 MCQ (choice 0 right). */
const quiz: Quiz = {
  id: 'survie',
  title: 'Survie',
  questions: [1, 2, 3, 4, 5, 6].map((i) => mcq(`Q${i}`)),
};
const RIGHT = { choiceIndex: 0 };
const WRONG = { choiceIndex: 1 };

describe('« Survie » mode', () => {
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
      { mode: 'survival', allAnsweredGraceMs: 0, ...settings },
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

  const joinAll = (...names: string[]) => names.map((n) => game.join(n, `sock-${n}`)!);
  const survival = () => rec.last('survival:state', 'all') as SurvivalStatePayload;
  const hearts = (p: Player) => survival().players.find((s) => s.id === p.id)?.hearts;
  const result = (p: Player) => rec.last('player:result', p.socketId!) as PlayerResultPayload;
  const prompt = (p: Player) => rec.last('question:prompt', p.socketId!) as QuestionPromptPayload;
  const show = () => rec.last('question:show', 'host') as QuestionShowPayload;
  const jokerState = (p: Player) => rec.last('joker:state', p.socketId!) as PlayerJokersPayload;
  const answer = (p: Player, a: AnswerInput) => game.answer(p.id, game.questionIndex, a);
  const toAnswering = () => {
    if (game.phase === 'LOBBY') game.start();
    else {
      if (game.phase === 'REVEAL') game.next();
      game.next();
    }
    vi.advanceTimersByTime(introOf(game));
    expect(game.phase).toBe('ANSWERING');
  };
  /** Plays one question: each player answers (or not, `null`), then the host ends it. */
  const play = (answers: [Player, AnswerInput | null][]) => {
    toAnswering();
    for (const [p, a] of answers) if (a) answer(p, a);
    if (game.phase === 'ANSWERING') game.next();
    expect(game.phase).toBe('REVEAL');
  };

  describe('hearts', () => {
    it('everyone starts with the chosen hearts (default 3), shown from the lobby on', () => {
      const [alice] = joinAll('Alice');
      expect(survival()).toEqual({
        hearts: SURVIVAL_DEFAULT_HEARTS,
        players: [{ id: alice!.id, nickname: 'Alice', avatar: alice!.avatar, hearts: 3 }],
      });
      create({ hearts: 5 });
      const [bob] = joinAll('Bob');
      expect(hearts(bob!)).toBe(5);
      expect(game.statePayload().mode).toBe('survival');
    });

    it('a wrong or missing answer costs a heart, a right one none', () => {
      const [alice, bob, chloe] = joinAll('Alice', 'Bob', 'Chloé');
      play([
        [alice!, RIGHT],
        [bob!, WRONG],
        [chloe!, null],
      ]);
      expect([hearts(alice!), hearts(bob!), hearts(chloe!)]).toEqual([3, 2, 2]);
      expect(result(alice!).survival).toEqual({ hearts: 3, lostHeart: false });
      expect(result(bob!).survival).toEqual({ hearts: 2, lostHeart: true });
      expect(survival().players.find((p) => p.id === bob!.id)?.lastLoss).toBe(0);
    });

    describe('per question type', () => {
      type Case = {
        question: Question;
        /** Survives (right), loses a heart (wrong), or nothing happens for anybody. */
        right?: (p: Player) => AnswerInput;
        wrong?: (p: Player) => AnswerInput;
        noRightAnswer?: true;
        /** The wrong answer still earns points (ORDER, PIN). */
        partial?: true;
      };
      const order = (p: Player) => ITEMS.map((item) => prompt(p).items!.indexOf(item));
      const rightOrder = (p: Player) => ({ order: order(p) });
      const cases: Record<string, Case> = {
        MCQ: { question: mcq('QCM'), right: () => RIGHT, wrong: () => WRONG },
        TRUE_FALSE: {
          question: DEMO_QUIZ.questions.find((q) => q.type === 'TRUE_FALSE')!,
        },
        TYPE_ANSWER: { question: DEMO_QUIZ.questions.find((q) => q.type === 'TYPE_ANSWER')! },
        SLIDER: { question: DEMO_QUIZ.questions.find((q) => q.type === 'SLIDER')! },
        ORDER: {
          question: { ...base, text: 'Ordre', type: 'ORDER', items: ITEMS },
          right: rightOrder,
          wrong: (p) => {
            const [a, b, ...rest] = order(p);
            return { order: [b!, a!, ...rest] }; // 2 of 4 in place: partial points
          },
          partial: true,
        },
        PIN: {
          question: { ...base, text: 'Où ?', type: 'PIN', imageUrl: IMAGE, zone: ZONE },
          right: () => ({ point: { x: 0.5, y: 0.3 } }),
          wrong: () => ({ point: { x: 0.5, y: 0.45 } }), // just outside: partial points
          partial: true,
        },
        POLL: {
          question: DEMO_QUIZ.questions.find((q) => q.type === 'POLL')!,
          noRightAnswer: true,
        },
        WHO_OF_US: {
          question: { ...base, text: 'Qui ?', type: 'WHO_OF_US', majorityBonus: true },
          right: (p) => ({ playerId: p.id }),
          noRightAnswer: true,
        },
        WORD_CLOUD: {
          question: { ...base, text: 'Un mot', type: 'WORD_CLOUD' },
          right: () => ({ text: 'Génial' }),
          noRightAnswer: true,
        },
      };

      it.each(Object.entries(cases))('%s', (_type, c) => {
        create({}, { id: 'q', title: 'Q', questions: [c.question, mcq('Après')] });
        const [alice, bob, chloe] = joinAll('Alice', 'Bob', 'Chloé');
        const right = c.right ?? (() => rightAnswer(c.question));
        const wrong = c.wrong ?? c.right ?? (() => wrongAnswer(c.question));
        toAnswering();
        answer(alice!, right(alice!));
        answer(bob!, wrong(bob!));
        game.next(); // Chloé never answers
        expect(game.phase).toBe('REVEAL');
        if (c.noRightAnswer) {
          expect([hearts(alice!), hearts(bob!), hearts(chloe!)]).toEqual([3, 3, 3]);
          expect(result(chloe!).survival).toEqual({ hearts: 3, lostHeart: false });
          return;
        }
        expect([hearts(alice!), hearts(bob!), hearts(chloe!)]).toEqual([3, 2, 2]);
        if (c.partial) {
          expect(result(bob!).pointsEarned).toBeGreaterThan(0);
          expect(result(bob!).correct).toBe(false);
        }
      });

      it('BLUFF: not voting for the truth costs a heart (lie or no vote)', () => {
        create(
          {},
          {
            id: 'q',
            title: 'Q',
            questions: [
              {
                ...base,
                text: 'Premier court-métrage ?',
                type: 'BLUFF',
                truth: 'Vincent',
                timeLimitSec: 45,
                voteTimeSec: 20,
              },
            ],
          },
        );
        const [alice, bob, chloe] = joinAll('Alice', 'Bob', 'Chloé');
        toAnswering();
        answer(alice!, { text: 'Frankenweenie' });
        answer(bob!, { text: 'Hansel et Gretel' });
        game.next(); // Chloé writes nothing: vote
        const stage = show().bluff;
        if (stage?.stage !== 'vote') throw new Error('not voting');
        const choice = (text: string) => ({ choiceIndex: stage.options.indexOf(text) });
        answer(alice!, choice('Vincent'));
        answer(bob!, choice('Frankenweenie'));
        game.next();
        expect(game.phase).toBe('REVEAL');
        expect([hearts(alice!), hearts(bob!), hearts(chloe!)]).toEqual([3, 2, 2]);
        // Alice fooled Bob: points, but the heart only depends on finding the truth.
        expect(result(bob!).survival?.lostHeart).toBe(true);
      });
    });
  });

  describe('ghosts', () => {
    it('at 0 hearts the player becomes a ghost who keeps answering, never below 0', () => {
      create({ hearts: 1 });
      const [alice, bob, chloe] = joinAll('Alice', 'Bob', 'Chloé');
      play([
        [alice!, RIGHT],
        [bob!, WRONG],
        [chloe!, RIGHT],
      ]);
      expect(result(bob!).survival).toEqual({
        hearts: 0,
        lostHeart: true,
        eliminated: true,
        ghost: true,
      });
      expect(survival().players.find((p) => p.id === bob!.id)).toMatchObject({
        hearts: 0,
        eliminatedAt: 0,
      });
      // Still plays: wrong again → nothing more to lose.
      play([
        [alice!, RIGHT],
        [bob!, WRONG],
        [chloe!, RIGHT],
      ]);
      expect(result(bob!).survival).toEqual({ hearts: 0, lostHeart: false, ghost: true });
      expect(survival().players.find((p) => p.id === bob!.id)?.eliminatedAt).toBe(0);
    });

    it('a correct ghost answer earns a haunt (not on a question without a right answer)', () => {
      const poll = DEMO_QUIZ.questions.find((q) => q.type === 'POLL')!;
      create({ hearts: 1 }, { ...quiz, questions: [mcq('A'), poll, mcq('B')] });
      const [alice, bob, chloe] = joinAll('Alice', 'Bob', 'Chloé');
      play([
        [alice!, RIGHT],
        [bob!, WRONG],
        [chloe!, RIGHT],
      ]);
      play([
        [alice!, RIGHT],
        [bob!, RIGHT],
        [chloe!, RIGHT],
      ]); // poll
      expect(result(bob!).survival?.hauntEarned).toBeUndefined();
      play([
        [alice!, RIGHT],
        [bob!, RIGHT],
        [chloe!, RIGHT],
      ]);
      expect(result(bob!).survival).toMatchObject({ ghost: true, hauntEarned: true });
      expect(survival().players.find((p) => p.id === bob!.id)?.haunts).toBe(1);
    });
  });

  describe('haunting', () => {
    /** Bob is a ghost with one haunt, Alice and Chloé alive: at the REVEAL of question 2. */
    const setup = (settings: Partial<GameSettings> = {}) => {
      create({ hearts: 1, ...settings });
      const players = joinAll('Alice', 'Bob', 'Chloé');
      const [alice, bob, chloe] = players;
      play([
        [alice!, RIGHT],
        [bob!, WRONG],
        [chloe!, RIGHT],
      ]);
      play([
        [alice!, RIGHT],
        [bob!, RIGHT],
        [chloe!, RIGHT],
      ]);
      return players as [Player, Player, Player];
    };

    it('Gel: lands on the target’s next question, announced, haunt spent', () => {
      const [alice, bob] = setup();
      game.haunt(bob.id, 'freeze', alice.id);
      expect(rec.last('joker:used', 'all')).toEqual({
        questionIndex: 1,
        joker: 'freeze',
        by: { id: bob.id, nickname: 'Bob', avatar: bob.avatar },
        target: { id: alice.id, nickname: 'Alice', avatar: alice.avatar },
        haunt: true,
      } satisfies JokerUsedPayload);
      expect(survival().players.find((p) => p.id === bob.id)?.haunts).toBeUndefined();
      expectGameError(() => game.haunt(bob.id, 'freeze', alice.id), 'JOKER_REFUSED'); // spent
      toAnswering();
      expect(jokerState(alice).effects.frozen).toEqual({
        ms: FREEZE_MS,
        by: { id: bob.id, nickname: 'Bob', avatar: bob.avatar },
      });
      expectGameError(() => answer(alice, RIGHT), 'FROZEN');
      vi.advanceTimersByTime(FREEZE_MS);
      answer(alice, RIGHT);
    });

    it('Brouilleur: moving buttons on the target’s next choix multiple question', () => {
      const [alice, bob] = setup();
      game.haunt(bob.id, 'scramble', alice.id);
      toAnswering();
      expect(jokerState(alice).effects.scrambled?.choices).toHaveLength(3);
    });

    it('refused: living player, no haunt, a ghost / oneself as target, paused, lobby', () => {
      create({ hearts: 1 });
      const [alice, bob, chloe] = joinAll('Alice', 'Bob', 'Chloé');
      expectGameError(() => game.haunt(bob!.id, 'freeze', alice!.id), 'JOKER_REFUSED'); // lobby
      play([
        [alice!, RIGHT],
        [bob!, WRONG],
        [chloe!, WRONG],
      ]);
      expectGameError(() => game.haunt(alice!.id, 'freeze', bob!.id), 'JOKER_REFUSED'); // alive
      expectGameError(() => game.haunt(bob!.id, 'freeze', alice!.id), 'JOKER_REFUSED'); // none
      create({ hearts: 1 });
      const [a, b, c, d] = joinAll('A', 'B', 'C', 'D');
      play([
        [a!, RIGHT],
        [b!, WRONG],
        [c!, WRONG],
        [d!, RIGHT],
      ]);
      play([
        [a!, RIGHT],
        [b!, RIGHT],
        [c!, RIGHT],
        [d!, RIGHT],
      ]);
      expectGameError(() => game.haunt(b!.id, 'freeze', c!.id), 'JOKER_REFUSED'); // ghost
      expectGameError(() => game.haunt(b!.id, 'freeze', b!.id), 'JOKER_REFUSED'); // oneself
      game.next();
      game.next(); // QUESTION_INTRO of question 3
      game.disconnect(d!.socketId!);
      vi.advanceTimersByTime(PAUSE_GRACE_MS);
      expect(game.paused).toBe(true);
      expectGameError(() => game.haunt(b!.id, 'freeze', a!.id), 'GAME_PAUSED');
    });

    it('two haunts of the same kind can’t stack on one target; a Bouclier blocks it', () => {
      create({ hearts: 1, jokers: true });
      const [alice, bob, chloe, dan] = joinAll('Alice', 'Bob', 'Chloé', 'Dan');
      game.start();
      game.jokers!.setHand(dan!.id, ['shield']);
      vi.advanceTimersByTime(introOf(game));
      for (const [p, a] of [
        [alice!, RIGHT],
        [bob!, WRONG],
        [chloe!, WRONG],
        [dan!, RIGHT],
      ] as const)
        answer(p, a);
      expect(game.phase).toBe('REVEAL');
      play([
        [alice!, RIGHT],
        [bob!, RIGHT],
        [chloe!, RIGHT],
        [dan!, RIGHT],
      ]);
      game.haunt(bob!.id, 'freeze', alice!.id);
      expectGameError(() => game.haunt(chloe!.id, 'freeze', alice!.id), 'JOKER_REFUSED');
      // Dan arms a Bouclier during the next question; Chloé's haunt bounces off it.
      toAnswering();
      game.useJoker(dan!.id, game.questionIndex, 'shield');
      game.haunt(chloe!.id, 'freeze', dan!.id);
      expect(rec.last('joker:used', 'all')).toMatchObject({ haunt: true, blocked: true });
      expect(jokerState(dan!).shield).toBeUndefined();
    });

    it('works without the Jokers option: no hands, no joker bar, but the effects', () => {
      const [alice, bob] = setup({ jokers: false });
      expect(game.statePayload().jokers).toBeUndefined();
      expectGameError(() => game.useJoker(alice.id, game.questionIndex, 'double'), 'JOKER_REFUSED');
      expect(jokerState(alice).hand).toEqual([]);
      game.haunt(bob.id, 'freeze', alice.id);
      toAnswering();
      expectGameError(() => answer(alice, RIGHT), 'FROZEN');
      expect(gameRecord(game, 'host', null)?.jokers).toBe(false);
    });
  });

  describe('end of the game', () => {
    it('ends early once one player is left alive: podium after that leaderboard', () => {
      create({ hearts: 1 });
      const [alice, bob, chloe] = joinAll('Alice', 'Bob', 'Chloé');
      play([
        [alice!, RIGHT],
        [bob!, WRONG],
        [chloe!, RIGHT],
      ]);
      expect(survival().finished).toBeUndefined();
      game.next();
      game.next();
      expect(game.phase).toBe('QUESTION_INTRO');
      vi.advanceTimersByTime(introOf(game));
      answer(alice!, WRONG);
      answer(bob!, RIGHT);
      answer(chloe!, WRONG);
      expect(game.phase).toBe('REVEAL');
      // Alice and Chloé both lost their last heart on question 2: nobody alive → finished.
      expect(survival().finished).toBe(true);
      game.next();
      expect(game.phase).toBe('LEADERBOARD');
      game.next();
      expect(game.phase).toBe('PODIUM');
    });

    it('the last survivor wins even with fewer points; ghosts by elimination, then points', () => {
      const free = (text: string): Question => ({ ...mcq(text), basePoints: 0 });
      create({ hearts: 2 }, { ...quiz, questions: [mcq('Q1'), free('Q2'), free('Q3'), mcq('Q4')] });
      const [alice, bob, chloe, dan] = joinAll('Alice', 'Bob', 'Chloé', 'Dan');
      // Q1 (1000 pts): only Bob right.
      play([
        [alice!, WRONG],
        [bob!, RIGHT],
        [chloe!, WRONG],
        [dan!, WRONG],
      ]);
      // Q2 (0 pt): Chloé and Dan out, Bob down to 1 heart, Alice right.
      play([
        [alice!, RIGHT],
        [bob!, WRONG],
        [chloe!, WRONG],
        [dan!, WRONG],
      ]);
      // Q3 (0 pt): Bob out, Alice right: last survivor, with 0 points against Bob's 1000.
      play([
        [alice!, RIGHT],
        [bob!, WRONG],
        [chloe!, RIGHT],
        [dan!, RIGHT],
      ]);
      expect(survival().finished).toBe(true);
      game.next();
      const board = rec.last('leaderboard', 'host') as StandingsPayload;
      expect(board.top.map((p) => [p.nickname, p.score])).toEqual([
        ['Alice', 0],
        ['Bob', 1000],
        ['Chloé', 0],
        ['Dan', 0],
      ]);
      expect(board.top[0]!.survival).toEqual({ hearts: 1 });
      expect(board.top[3]!.survival).toEqual({ hearts: 0, eliminatedAt: 1 });
      // Chloé and Dan: same elimination, same points → same rank.
      expect(game.standings().map((s) => [s.nickname, s.rank])).toEqual([
        ['Alice', 1],
        ['Bob', 2],
        ['Chloé', 3],
        ['Dan', 3],
      ]);
      expect(result(alice!).rank).toBe(1);
      expect(game.standings()[0]).toMatchObject({ hearts: 1, eliminatedAt: null });
      expect(game.standings()[3]).toMatchObject({ hearts: 0, eliminatedAt: 1 });
      game.next();
      expect(game.phase).toBe('PODIUM');
      expect((rec.last('podium', 'all') as StandingsPayload).top.map((p) => p.nickname)).toEqual([
        'Alice',
        'Bob',
        'Chloé',
      ]);
    });

    it('several survivors at the end of the quiz: ranked by points', () => {
      create({ hearts: 3 }, { ...quiz, questions: [mcq('A')] });
      const [alice, bob] = joinAll('Alice', 'Bob');
      play([
        [alice!, WRONG],
        [bob!, RIGHT],
      ]);
      expect(game.standings().map((s) => s.nickname)).toEqual(['Bob', 'Alice']);
      game.next();
      game.next();
      expect(game.phase).toBe('PODIUM');
    });

    it('a game started alone goes on until that player is a ghost', () => {
      create({ hearts: 1 });
      const [alice] = joinAll('Alice');
      play([[alice!, RIGHT]]);
      expect(survival().finished).toBeUndefined();
      play([[alice!, WRONG]]);
      expect(survival().finished).toBe(true);
    });

    it('a kick can leave one survivor: the game ends after the leaderboard', () => {
      create({ hearts: 3 });
      const [alice, bob] = joinAll('Alice', 'Bob');
      play([
        [alice!, RIGHT],
        [bob!, RIGHT],
      ]);
      game.kick(bob!.id);
      expect(survival().finished).toBe(true);
      game.next();
      game.next();
      expect(game.phase).toBe('PODIUM');
    });

    it('saves the mode, the hearts and each player’s survival', () => {
      create({ hearts: 1 });
      const [alice, bob] = joinAll('Alice', 'Bob');
      play([
        [alice!, RIGHT],
        [bob!, WRONG],
      ]);
      const record = gameRecord(game, 'host', null)!;
      expect(record).toMatchObject({ mode: 'survival', hearts: 1, jokers: false });
      expect(record.results.map((r) => [r.nickname, r.hearts, r.eliminatedAt])).toEqual([
        ['Alice', 1, null],
        ['Bob', 0, 0],
      ]);
    });
  });

  describe('pause and rejoin', () => {
    it('a player excused with « Continuer sans » keeps their hearts', () => {
      const [alice, bob] = joinAll('Alice', 'Bob');
      toAnswering();
      game.disconnect(bob!.socketId!);
      vi.advanceTimersByTime(PAUSE_GRACE_MS);
      expect(game.paused).toBe(true);
      game.resume();
      vi.advanceTimersByTime(RESUME_COUNTDOWN_MS);
      answer(alice!, WRONG);
      expect(game.phase).toBe('REVEAL');
      expect([hearts(alice!), hearts(bob!)]).toEqual([2, 3]);
    });

    it('a player who drops mid-question and is not excused loses one', () => {
      const [alice, bob] = joinAll('Alice', 'Bob');
      toAnswering();
      answer(alice!, RIGHT);
      game.disconnect(bob!.socketId!);
      vi.advanceTimersByTime(PAUSE_GRACE_MS);
      game.next(); // the host skips the paused question
      expect(game.phase).toBe('REVEAL');
      expect(hearts(bob!)).toBe(2);
    });

    it('a rejoining phone and host screen get the hearts back', () => {
      create({ hearts: 1 });
      const [alice, bob] = joinAll('Alice', 'Bob');
      play([
        [alice!, RIGHT],
        [bob!, WRONG],
      ]);
      game.disconnect(bob!.socketId!);
      const back = game.rejoin(bob!.sessionToken, 'sock-bob-2');
      rec.sent.length = 0;
      game.resync(back);
      expect(rec.last('survival:state', 'sock-bob-2')).toMatchObject({ finished: true });
      expect((rec.last('player:result', 'sock-bob-2') as PlayerResultPayload).survival).toEqual({
        hearts: 0,
        lostHeart: true,
        eliminated: true,
        ghost: true,
      });
      game.resyncHost('host-2');
      expect(
        (rec.last('survival:state', 'host-2') as SurvivalStatePayload).players.map((p) => p.hearts),
      ).toEqual([1, 0]);
    });

    it('solo / team games send no survival data', () => {
      const solo = new Game(
        '654321',
        quiz,
        rec.transport,
        {},
        { mode: 'solo', allAnsweredGraceMs: 0 },
      );
      rec.sent.length = 0;
      const p = solo.join('Zoé', 'sock-z');
      solo.start();
      expect(rec.sent.some((s) => s.event === 'survival:state')).toBe(false);
      expect(solo.standings()[0]).not.toHaveProperty('hearts');
      expect(p).toBeDefined();
      solo.dispose();
    });
  });
});
