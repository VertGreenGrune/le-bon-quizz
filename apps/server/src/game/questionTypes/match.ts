import {
  matchPoints,
  type AnswerInput,
  type MatchColumns,
  type MatchQuestion,
  type MatchReveal,
} from '@lbq/shared';
import { GameError } from '../errors.js';
import type { Answer, Player } from '../Game.js';

/**
 * « Associer » (MATCH, T67): pairs to link. Both columns are shuffled once per question (the same
 * on the TV and every phone); a player answers, per shown left item, the shown right item linked
 * to it. Points: time points × share of the pairs linked right.
 */
export interface MatchState {
  /** `left[shown]` = the pair whose left item is shown there. */
  left: number[];
  /** `right[shown]` = the pair whose right item is shown there. */
  right: number[];
}

function shuffle(count: number, random: () => number): number[] {
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

/** Both columns shuffled; never a partner straight across (row n of both columns). */
export function newMatch(count: number, random: () => number = Math.random): MatchState {
  const left = shuffle(count, random);
  let right = shuffle(count, random);
  for (let tries = 0; tries < 50 && right.some((p, i) => p === left[i]); tries++)
    right = shuffle(count, random);
  return { left, right };
}

export function matchColumns(q: MatchQuestion, state: MatchState): MatchColumns {
  return {
    left: state.left.map((p) => q.pairs[p]!.left),
    right: state.right.map((p) => q.pairs[p]!.right),
  };
}

/**
 * `matches[shown left]` = shown right (-1 = none), each right item linked at most once →
 * `links[pair]` = the pair of the right item linked to that pair's left item (-1 = none).
 */
export function matchLinks(state: MatchState, matches: readonly number[]): number[] {
  const count = state.left.length;
  const invalid = new GameError('INVALID_PAYLOAD', 'Associations invalides');
  if (matches.length !== count) throw invalid;
  const used = matches.filter((m) => m >= 0);
  if (used.some((m) => m >= count) || new Set(used).size !== used.length) throw invalid;
  const links = Array.from({ length: count }, () => -1);
  matches.forEach((m, shown) => {
    if (m >= 0) links[state.left[shown]!] = state.right[m]!;
  });
  return links;
}

export const rightLinks = (links: readonly number[]) => links.filter((l, p) => l === p).length;

export function judgeMatch(
  q: MatchQuestion,
  state: MatchState,
  given: AnswerInput,
  timePoints: number,
): Omit<Answer, 'responseMs' | 'choiceIndex' | 'text' | 'value'> {
  if (!('matches' in given))
    throw new GameError('INVALID_PAYLOAD', 'Cette question attend des associations');
  const links = matchLinks(state, given.matches);
  return { matchLinks: links, ...matchPoints(timePoints, rightLinks(links), q.pairs.length) };
}

/** The right pairs, how many found each, every player's links (best first, no answer last). */
export function matchReveal(
  q: MatchQuestion,
  answers: readonly { player: Player; answer: Answer }[],
  players: Iterable<Player>,
): MatchReveal {
  const found = q.pairs.map(() => 0);
  const rows: MatchReveal['answers'] = [];
  for (const { player, answer } of answers) {
    const links = answer.matchLinks;
    if (!links) continue;
    links.forEach((l, p) => {
      if (l === p) found[p]!++;
    });
    rows.push({
      nickname: player.nickname,
      avatar: player.avatar,
      links: [...links],
      right: rightLinks(links),
      points: answer.points,
    });
  }
  rows.sort((a, b) => b.right - a.right || b.points - a.points);
  for (const player of players) {
    if (answers.some((a) => a.player === player && a.answer.matchLinks)) continue;
    rows.push({ nickname: player.nickname, avatar: player.avatar, links: [], right: 0, points: 0 });
  }
  return { pairs: q.pairs, found, answers: rows };
}

export function matchResult(q: MatchQuestion, player: Player, state?: MatchState) {
  const links = player.answer?.matchLinks;
  // The board in the shown order: the phone draws the player's cables and the right ones.
  const board = state && {
    yours: state.left.map((p) => (links && links[p]! >= 0 ? state.right.indexOf(links[p]!) : -1)),
    right: state.left.map((p) => state.right.indexOf(p)),
  };
  return {
    match: {
      right: links ? rightLinks(links) : 0,
      total: q.pairs.length,
      ...(links && { yours: [...links] }),
      ...(board && { board }),
    },
  };
}
