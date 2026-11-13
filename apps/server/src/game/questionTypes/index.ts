import {
  TYPE_ANSWER_MAX_LENGTH,
  WHO_OF_US_MAJORITY_BONUS,
  WORD_CLOUD_MAX_LENGTH,
  type AnswerInput,
  type LobbyMember,
  type PlayerResultPayload,
  type Question,
  type QuestionPromptPayload,
  type QuestionShowPayload,
  type RevealDetails,
} from '@lbq/shared';
import { GameError } from '../errors.js';
import type { Answer, Player } from '../Game.js';
import {
  isPermutation,
  orderPoints,
  orderReveal,
  placedCount,
  shownItems,
  shuffleOrder,
} from './order.js';
import {
  bluffBonus,
  bluffPrompt,
  bluffResult,
  bluffReveal,
  bluffShow,
  judgeVote,
  newBluff,
  type BluffState,
} from './bluff.js';
import {
  drawBonus,
  drawPrompt,
  drawResult,
  drawReveal,
  drawShow,
  judgeGuess,
  type DrawState,
} from './draw.js';
import {
  listAnswer,
  listPrompt,
  listResult,
  listReveal,
  newList,
  settleList,
  type ListState,
} from './list.js';
import {
  colorsPrompt,
  colorsResult,
  colorsReveal,
  colorsShow,
  judgeColors,
  type ColorsState,
} from './colors.js';
import {
  judgeMissing,
  missingPrompt,
  missingReveal,
  missingShow,
  newMissing,
  type MissingState,
} from './missing.js';
import { judgePointless, pointlessResult, pointlessReveal, settlePointless } from './pointless.js';
import {
  judgeBet,
  newWager,
  wagerBonus,
  wagerPrompt,
  wagerResult,
  wagerReveal,
  wagerShow,
  type WagerState,
} from './wager.js';
import {
  judgeNeedle,
  wavelengthBonus,
  wavelengthPrompt,
  wavelengthResult,
  wavelengthReveal,
  wavelengthShow,
  type WavelengthState,
} from './wavelength.js';
import {
  potatoPrompt,
  potatoResult,
  potatoReveal,
  potatoShow,
  settlePotato,
  type PotatoState,
} from './hotPotato.js';
import { pinPoints } from './pin.js';
import { mostVoted, tallyVotes, voteCounts } from './whoOfUs.js';
import {
  judgeMatch,
  matchColumns,
  matchResult,
  matchReveal,
  newMatch,
  type MatchState,
} from './match.js';
import { wordCloud } from './wordCloud.js';

/**
 * The question types of T27 (ORDER, PIN, WHO_OF_US, WORD_CLOUD), T26 (BLUFF) and T30 (DRAW), kept out of
 * `Game.ts`: it calls these hooks for them, and its own code for the older types. Answers still
 * go through `Game.answer` and its scoring flow (time points, streak, team averages, pause).
 */
export type ExtraQuestion = Extract<
  Question,
  {
    type:
      | 'ORDER'
      | 'PIN'
      | 'WHO_OF_US'
      | 'WORD_CLOUD'
      | 'BLUFF'
      | 'DRAW'
      | 'LIST'
      | 'COLORS'
      | 'MISSING'
      | 'POINTLESS'
      | 'WAGER'
      | 'WAVELENGTH'
      | 'HOT_POTATO'
      | 'MATCH';
  }
>;
export type ClassicQuestion = Exclude<Question, ExtraQuestion>;

export function isExtraQuestion(q: Question): q is ExtraQuestion {
  return (
    q.type === 'ORDER' ||
    q.type === 'PIN' ||
    q.type === 'WHO_OF_US' ||
    q.type === 'WORD_CLOUD' ||
    q.type === 'BLUFF' ||
    q.type === 'DRAW' ||
    q.type === 'LIST' ||
    q.type === 'COLORS' ||
    q.type === 'MISSING' ||
    q.type === 'POINTLESS' ||
    q.type === 'WAGER' ||
    q.type === 'WAVELENGTH' ||
    q.type === 'HOT_POTATO' ||
    q.type === 'MATCH'
  );
}

/** Per-question setup, drawn when the question starts (kept for rejoins). */
export interface QuestionSetup {
  /** ORDER: `display[shown index]` = index in the right order. Empty for the other types. */
  display: number[];
  /** BLUFF: the lies, then the options of the vote. */
  bluff?: BluffState;
  /** DRAW: the word, the drawer and the drawing (set by `Game`, which keeps the rotation). */
  draw?: DrawState;
  /** LIST: the items each player found. */
  list?: ListState;
  /** COLORS: the board, its colors and the stage (set by `Game`, with its random source). */
  colors?: ColorsState;
  /** MISSING: the stage (memorizing « avant », then answering on « après »). */
  missing?: MissingState;
  /** WAGER: the guesses, then the slots of the bets. */
  wager?: WagerState;
  /** WAVELENGTH: the psychic, the scale, the target, the clue (set by `Game`: rotation, random). */
  wavelength?: WavelengthState;
  /** HOT_POTATO: the holder, the fuse, the sub-questions, the passes (set by `Game` at ANSWERING). */
  potato?: PotatoState;
  /** MATCH (T67): both columns' shuffle. */
  match?: MatchState;
}

export const NO_SETUP: QuestionSetup = { display: [] };

export function prepareQuestion(q: Question, random: () => number = Math.random): QuestionSetup {
  if (q.type === 'ORDER') return { display: shuffleOrder(q.items.length, random) };
  if (q.type === 'BLUFF') return { display: [], bluff: newBluff() };
  if (q.type === 'LIST') return { display: [], list: newList() };
  if (q.type === 'MISSING') return { display: [], missing: newMissing() };
  if (q.type === 'WAGER') return { display: [], wager: newWager() };
  if (q.type === 'MATCH') return { display: [], match: newMatch(q.pairs.length, random) };
  return NO_SETUP;
}

const lobbyMember = ({ id, nickname, avatar }: Player): LobbyMember => ({ id, nickname, avatar });

const byId = (players: Iterable<Player>) => new Map([...players].map((p) => [p.id, p]));

/** Host-only extras of `question:show`. */
export function extraShowFields(
  q: ExtraQuestion,
  setup: QuestionSetup,
  players: Iterable<Player>,
): Partial<QuestionShowPayload> {
  if (q.type === 'ORDER') return { items: shownItems(q, setup.display) };
  if (q.type === 'WHO_OF_US') return { candidates: [...players].map(lobbyMember) };
  if (q.type === 'BLUFF') {
    const bluff = bluffShow(setup.bluff!);
    return bluff.stage === 'vote' ? { bluff, timeLimitSec: q.voteTimeSec } : { bluff };
  }
  if (q.type === 'DRAW' && setup.draw) return { draw: drawShow(setup.draw, byId(players)) };
  if (q.type === 'LIST') return { list: { total: q.items.length } };
  if (q.type === 'COLORS' && setup.colors) return colorsShow(q, setup.colors);
  if (q.type === 'MISSING' && setup.missing) return missingShow(q, setup.missing);
  if (q.type === 'WAGER' && setup.wager) {
    const wager = wagerShow(q, setup.wager, byId(players));
    return wager.stage === 'bet' ? { wager, timeLimitSec: q.betTimeSec } : { wager };
  }
  if (q.type === 'WAVELENGTH' && setup.wavelength) {
    // The clue has its own time limit (the guesses use `timeLimitSec`).
    const wavelength = wavelengthShow(setup.wavelength, byId(players));
    return wavelength.stage === 'clue'
      ? { wavelength, timeLimitSec: q.clueTimeSec }
      : { wavelength };
  }
  if (q.type === 'MATCH' && setup.match) return { match: matchColumns(q, setup.match) };
  if (q.type === 'HOT_POTATO' && setup.potato)
    return { potato: potatoShow(q, setup.potato, byId(players), Date.now()) };
  return {};
}

/** What the phones need to answer — never the right order nor the PIN zone. */
export function extraPromptFields(
  q: ExtraQuestion,
  setup: QuestionSetup,
  players: Iterable<Player>,
  /** BLUFF / DRAW: the prompt is per player (own lie, the word for the drawer). */
  playerId = '',
): Partial<QuestionPromptPayload> {
  switch (q.type) {
    case 'ORDER':
      return { items: shownItems(q, setup.display) };
    case 'PIN':
      return { imageUrl: q.imageUrl! };
    case 'WHO_OF_US':
      return { candidates: [...players].map(lobbyMember) };
    case 'WORD_CLOUD':
      return { maxLength: WORD_CLOUD_MAX_LENGTH };
    case 'BLUFF': {
      // The vote has its own time limit: the phone's countdown and Gel are computed from it.
      const bluff = bluffPrompt(setup.bluff!, playerId);
      return bluff.stage === 'vote' ? { bluff, timeLimitSec: q.voteTimeSec } : { bluff };
    }
    case 'DRAW':
      return setup.draw ? { draw: drawPrompt(setup.draw, byId(players), playerId) } : {};
    case 'LIST':
      return { list: listPrompt(q, setup.list!, playerId) };
    case 'COLORS':
      return setup.colors ? colorsPrompt(q, setup.colors) : {};
    case 'MISSING':
      return setup.missing ? missingPrompt(q, setup.missing) : {};
    case 'POINTLESS':
      return { maxLength: TYPE_ANSWER_MAX_LENGTH };
    case 'WAGER': {
      // The bets have their own time limit: the phone's countdown and Gel are computed from it.
      const wager = wagerPrompt(q, setup.wager!, playerId);
      return wager.stage === 'bet' ? { wager, timeLimitSec: q.betTimeSec } : { wager };
    }
    case 'WAVELENGTH': {
      if (!setup.wavelength) return {};
      const wavelength = wavelengthPrompt(setup.wavelength, byId(players), playerId);
      return wavelength.stage === 'clue'
        ? { wavelength, timeLimitSec: q.clueTimeSec }
        : { wavelength };
    }
    case 'MATCH':
      return setup.match ? { match: matchColumns(q, setup.match) } : {};
    case 'HOT_POTATO':
      return setup.potato
        ? { potato: potatoPrompt(q, setup.potato, byId(players), playerId, Date.now()) }
        : {};
  }
}

/** Checks the answer kind matches the question, then whether it is right and its points. */
export function judgeExtra(
  q: ExtraQuestion,
  given: AnswerInput,
  timePoints: number,
  setup: QuestionSetup,
  players: ReadonlyMap<string, Player>,
  playerId = '',
): Omit<Answer, 'responseMs'> {
  const none = { choiceIndex: null, text: null, value: null };
  const invalid = (message: string) => new GameError('INVALID_PAYLOAD', message);
  switch (q.type) {
    case 'ORDER': {
      if (!('order' in given)) throw invalid('Cette question attend un ordre');
      if (!isPermutation(given.order, q.items.length)) throw invalid('Ordre invalide');
      const placed = placedCount(given.order, setup.display);
      return {
        ...none,
        order: [...given.order],
        ...orderPoints(timePoints, placed, q.items.length),
      };
    }
    case 'PIN':
      if (!('point' in given)) throw invalid('Cette question attend un point sur l’image');
      return { ...none, point: { ...given.point }, ...pinPoints(timePoints, given.point, q.zone) };
    case 'WHO_OF_US':
      if (!('playerId' in given)) throw invalid('Cette question attend un joueur');
      if (!players.has(given.playerId)) throw invalid('Joueur introuvable');
      // Points (majority bonus) are settled at the reveal, once every vote is in.
      return { ...none, votedFor: given.playerId, correct: false, points: 0 };
    case 'WORD_CLOUD': {
      if (!('text' in given)) throw invalid('Cette question attend une réponse écrite');
      const text = given.text.trim().slice(0, WORD_CLOUD_MAX_LENGTH);
      return { ...none, text, correct: false, points: 0 };
    }
    case 'BLUFF':
      // The lies are stored by `Game.answer` (stage 1); this is the vote (stage 2).
      if (!('choiceIndex' in given)) throw invalid('Vote pour une des réponses');
      return {
        ...none,
        choiceIndex: given.choiceIndex,
        ...judgeVote(q, setup.bluff!, playerId, given.choiceIndex),
      };
    case 'DRAW':
      // `Game.answer` only records right guesses (and refuses the drawer's).
      if (!('text' in given)) throw invalid('Cette question attend un mot');
      return { ...none, ...judgeGuess(setup.draw!, given.text, timePoints) };
    case 'LIST': {
      // `Game.answer` records it only once the player found every item (`questionTypes/list.ts`).
      if (!('text' in given)) throw invalid('Cette question attend une réponse écrite');
      const { responseMs: _ms, ...answer } = listAnswer(q, setup.list!, playerId);
      return answer;
    }
    case 'COLORS':
      return { ...none, ...judgeColors(setup.colors!, given, timePoints) };
    case 'MISSING':
      return { ...none, ...judgeMissing(q, setup.missing!, given, timePoints) };
    case 'POINTLESS':
      return { ...none, ...judgePointless(q, given) };
    case 'WAGER':
      // The guesses are stored by `Game.answer` (stage 1); this is the bet (stage 2).
      if (!('choiceIndex' in given)) throw invalid('Parie sur une des réponses');
      return {
        ...none,
        choiceIndex: given.choiceIndex,
        ...judgeBet(q, setup.wager!, given.choiceIndex),
      };
    case 'WAVELENGTH':
      // The clue is stored by `Game.answer` (stage 1); this is a needle (stage 2).
      if (!('value' in given)) throw invalid('Place l’aiguille sur l’échelle');
      return { ...none, ...judgeNeedle(q, setup.wavelength!, given.value) };
    case 'MATCH':
      return { ...none, ...judgeMatch(q, setup.match!, given, timePoints) };
    case 'HOT_POTATO':
      // The holder's answers are handled by `Game.answer` (`questionTypes/hotPotato.ts`).
      throw invalid('Tu n’as pas la patate !');
  }
}

/**
 * Points that don't come from the player's own answer (BLUFF: players fooled by their lie; DRAW:
 * the drawer's, per player who found the word).
 */
export function extraBonusPoints(
  q: ExtraQuestion,
  setup: QuestionSetup,
  player: Player,
  players: Iterable<Player>,
): number {
  if (q.type === 'BLUFF') return bluffBonus(q, setup.bluff!, player, players);
  if (q.type === 'DRAW' && setup.draw) return drawBonus(q, setup.draw, player, players);
  if (q.type === 'WAGER') return wagerBonus(q, setup.wager!, player);
  if (q.type === 'WAVELENGTH' && setup.wavelength)
    return wavelengthBonus(setup.wavelength, player, players);
  return 0;
}

/** Before scoring the reveal: WHO_OF_US majority bonus, LIST answers of the partial finders. */
export function settleExtra(
  q: ExtraQuestion,
  setup: QuestionSetup,
  players: Iterable<Player>,
): void {
  if (q.type === 'LIST') return settleList(q, setup.list!, players);
  if (q.type === 'POINTLESS') return settlePointless(q, players);
  if (q.type === 'HOT_POTATO') return setup.potato && settlePotato(q, setup.potato, players);
  if (q.type !== 'WHO_OF_US' || !q.majorityBonus) return;
  const list = [...players];
  const winners = mostVoted(tallyVotes(list.flatMap((p) => p.answer?.votedFor ?? [])));
  for (const p of list) {
    const vote = p.answer?.votedFor;
    if (p.answer && vote && winners.has(vote)) p.answer.points = WHO_OF_US_MAJORITY_BONUS;
  }
}

/** Type-specific part of the reveal (also saved in the report). `answers`: earliest first. */
export function extraRevealDetails(
  q: ExtraQuestion,
  setup: QuestionSetup,
  answers: readonly { player: Player; answer: Answer }[],
  players: Iterable<Player>,
): RevealDetails {
  switch (q.type) {
    case 'ORDER':
      return orderReveal(q, setup.display, [
        ...answers.map(({ player, answer }) => ({
          player,
          order: answer.order ?? null,
          points: answer.points,
        })),
        // T50: the players without an answer, listed last.
        ...[...players]
          .filter((p) => !answers.some((a) => a.player === p))
          .map((player) => ({ player, order: null, points: 0 })),
      ]);
    case 'PIN':
      return {
        pin: {
          imageUrl: q.imageUrl!,
          zone: q.zone,
          pins: answers.flatMap(({ player, answer }) =>
            answer.point
              ? [
                  {
                    ...answer.point,
                    nickname: player.nickname,
                    avatar: player.avatar,
                    correct: answer.correct,
                  },
                ]
              : [],
          ),
        },
      };
    case 'WHO_OF_US': {
      const tally = tallyVotes(answers.flatMap(({ answer }) => answer.votedFor ?? []));
      return {
        votes: voteCounts(tally, players),
        ...(q.majorityBonus && { majorityBonus: true as const }),
      };
    }
    case 'WORD_CLOUD':
      return { words: wordCloud(answers.flatMap(({ answer }) => answer.text ?? [])) };
    case 'BLUFF':
      return bluffReveal(q, setup.bluff!, byId(players));
    case 'DRAW':
      return setup.draw ? drawReveal(setup.draw, byId(players)) : {};
    case 'LIST':
      return { list: listReveal(q, setup.list!, players) };
    case 'COLORS':
      return setup.colors ? { colors: colorsReveal(setup.colors, answers, players) } : {};
    case 'MISSING':
      return missingReveal(q, answers);
    case 'POINTLESS':
      return { pointless: pointlessReveal(q, answers) };
    case 'WAGER':
      return wagerReveal(q, setup.wager!, byId(players));
    case 'WAVELENGTH':
      return setup.wavelength ? wavelengthReveal(setup.wavelength, byId(players)) : {};
    case 'HOT_POTATO':
      return setup.potato ? potatoReveal(q, setup.potato, byId(players)) : {};
    case 'MATCH':
      return { match: matchReveal(q, answers, players) };
  }
}

/** Type-specific part of a player's `player:result`. */
export function extraResultFields(
  q: ExtraQuestion,
  player: Player,
  setup: QuestionSetup,
  players: Iterable<Player>,
): Partial<PlayerResultPayload> {
  const answer = player.answer;
  if (q.type === 'BLUFF') return bluffResult(q, setup.bluff!, player, byId(players));
  if (q.type === 'DRAW' && setup.draw) return drawResult(setup.draw, player, byId(players));
  if (q.type === 'LIST') return { list: listResult(q, setup.list!, player) };
  if (q.type === 'COLORS' && setup.colors) return { colors: colorsResult(setup.colors, player) };
  if (q.type === 'POINTLESS') return { pointless: pointlessResult(q, player, players) };
  if (q.type === 'WAGER') return wagerResult(q, setup.wager!, player);
  if (q.type === 'WAVELENGTH' && setup.wavelength)
    return wavelengthResult(setup.wavelength, player, byId(players));
  if (q.type === 'HOT_POTATO' && setup.potato)
    return potatoResult(q, setup.potato, player, byId(players));
  if (q.type === 'MATCH') return matchResult(q, player, setup.match);
  if (q.type === 'ORDER' && answer?.order)
    return { placed: { correct: placedCount(answer.order, setup.display), total: q.items.length } };
  if (q.type === 'WHO_OF_US') {
    const tally = tallyVotes([...players].flatMap((p) => p.answer?.votedFor ?? []));
    const vote = answer?.votedFor;
    return {
      votesReceived: tally.get(player.id) ?? 0,
      ...(vote && { withMajority: mostVoted(tally).has(vote) }),
    };
  }
  return {};
}
