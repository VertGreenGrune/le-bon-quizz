import {
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
import { pinPoints } from './pin.js';
import { mostVoted, tallyVotes, voteCounts } from './whoOfUs.js';
import { wordCloud } from './wordCloud.js';

/**
 * The question types of T27 (ORDER, PIN, WHO_OF_US, WORD_CLOUD), kept out of `Game.ts`: it calls
 * these hooks for them, and its own code for the older types. Answers still go through
 * `Game.answer` and its scoring flow (time points, streak, team averages, pause).
 */
export type ExtraQuestion = Extract<
  Question,
  { type: 'ORDER' | 'PIN' | 'WHO_OF_US' | 'WORD_CLOUD' }
>;
export type ClassicQuestion = Exclude<Question, ExtraQuestion>;

export function isExtraQuestion(q: Question): q is ExtraQuestion {
  return (
    q.type === 'ORDER' || q.type === 'PIN' || q.type === 'WHO_OF_US' || q.type === 'WORD_CLOUD'
  );
}

/** Per-question setup, drawn when the question starts (kept for rejoins). */
export interface QuestionSetup {
  /** ORDER: `display[shown index]` = index in the right order. Empty for the other types. */
  display: number[];
}

export const NO_SETUP: QuestionSetup = { display: [] };

export function prepareQuestion(q: Question, random: () => number = Math.random): QuestionSetup {
  return q.type === 'ORDER' ? { display: shuffleOrder(q.items.length, random) } : NO_SETUP;
}

const lobbyMember = ({ id, nickname, avatar }: Player): LobbyMember => ({ id, nickname, avatar });

/** Host-only extras of `question:show`. */
export function extraShowFields(
  q: ExtraQuestion,
  setup: QuestionSetup,
  players: Iterable<Player>,
): Partial<QuestionShowPayload> {
  if (q.type === 'ORDER') return { items: shownItems(q, setup.display) };
  if (q.type === 'WHO_OF_US') return { candidates: [...players].map(lobbyMember) };
  return {};
}

/** What the phones need to answer — never the right order nor the PIN zone. */
export function extraPromptFields(
  q: ExtraQuestion,
  setup: QuestionSetup,
  players: Iterable<Player>,
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
  }
}

/** Checks the answer kind matches the question, then whether it is right and its points. */
export function judgeExtra(
  q: ExtraQuestion,
  given: AnswerInput,
  timePoints: number,
  setup: QuestionSetup,
  players: ReadonlyMap<string, Player>,
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
  }
}

/** Before scoring the reveal: WHO_OF_US majority bonus. */
export function settleExtra(q: ExtraQuestion, players: Iterable<Player>): void {
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
      return orderReveal(
        q,
        setup.display,
        answers.flatMap(({ answer }) => (answer.order ? [answer.order] : [])),
      );
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
