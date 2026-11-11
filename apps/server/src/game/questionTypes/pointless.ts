import {
  listItemLabel,
  pointlessPoints,
  POINTLESS_MISSED_SHOWN,
  TYPE_ANSWER_MAX_LENGTH,
  type AnswerInput,
  type LobbyMember,
  type PlayerResultPayload,
  type PointlessQuestion,
  type PointlessReveal,
} from '@lbq/shared';
import { GameError } from '../errors.js';
import type { Answer, Player } from '../Game.js';
import { matchItem, normalizeAnswer } from '../matching.js';

/**
 * POINTLESS — « Pas évident ! » (T60, PLAN.md §3, after the BBC's « Pointless »). « Citez un pays
 * d'Afrique »: each phone types **one** answer (`player:answer { text }`, cancellable like a
 * typed answer), matched against `items` (« | » spellings, exact first then with the typo
 * tolerance, `matchItem`). The points only come at the reveal, once every answer is in
 * (`settlePointless`): an item given by `k` players earns each of them `basePoints / k` — a
 * unique right answer = full points (« 💎 Pas évident ! »); no time factor; wrong / none = 0.
 */

const member = ({ id, nickname, avatar }: Player): LobbyMember => ({ id, nickname, avatar });

/** One answer, judged: the item it names (`item`), right or not. Points are settled at the reveal. */
export function judgePointless(
  q: PointlessQuestion,
  given: AnswerInput,
): Pick<Answer, 'text' | 'item' | 'correct' | 'points'> {
  if (!('text' in given))
    throw new GameError('INVALID_PAYLOAD', 'Cette question attend une réponse écrite');
  const text = given.text.trim().slice(0, TYPE_ANSWER_MAX_LENGTH);
  const item = matchItem(q.items, text, q.typoTolerance);
  // Provisional points (never sent before the reveal): `settlePointless` divides them.
  return item >= 0
    ? { text, item, correct: true, points: q.basePoints }
    : { text, correct: false, points: 0 };
}

/**
 * Which right answers count as « the same »: the item they name, or — for an answer the host
 * accepted (T44, no item) — its normalized text.
 */
const groupKey = (a: Answer): string =>
  a.item !== undefined && a.item >= 0 ? `item:${a.item}` : `text:${normalizeAnswer(a.text ?? '')}`;

/** Right answers grouped by item (or accepted text), in the order of `players`. */
function rightGroups(players: Iterable<Player>): Map<string, Player[]> {
  const groups = new Map<string, Player[]>();
  for (const p of players) {
    if (!p.answer?.correct) continue;
    const key = groupKey(p.answer);
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return groups;
}

/** Before scoring the reveal: each right answer earns `basePoints / k` (k = players who gave it). */
export function settlePointless(q: PointlessQuestion, players: Iterable<Player>): void {
  for (const group of rightGroups(players).values())
    for (const p of group) p.answer!.points = pointlessPoints(q.basePoints, group.length);
}

/** The label of a right answer: the item's first spelling, or the accepted text as typed. */
const label = (q: PointlessQuestion, a: Answer): string =>
  a.item !== undefined && a.item >= 0 ? listItemLabel(q.items[a.item]!) : (a.text ?? '');

/** `answers`: earliest first (the first typing names a wrong group). */
export function pointlessReveal(
  q: PointlessQuestion,
  answers: readonly { player: Player; answer: Answer }[],
): PointlessReveal {
  const players = answers.map((a) => a.player);
  const right = [...rightGroups(players).values()].map((group) => {
    const a = group[0]!.answer!;
    return {
      text: label(q, a),
      players: group.map(member),
      points: pointlessPoints(q.basePoints, group.length),
      ...((a.item === undefined || a.item < 0) && { accepted: true as const }),
    };
  });
  // Rarest first (then the label, so a reload shows the same order).
  right.sort((a, b) => a.players.length - b.players.length || a.text.localeCompare(b.text, 'fr'));
  const wrong = new Map<string, { text: string; players: LobbyMember[] }>();
  for (const { player, answer } of answers) {
    if (answer.correct || answer.text === null) continue;
    const key = normalizeAnswer(answer.text);
    const group = wrong.get(key);
    if (group) group.players.push(member(player));
    else wrong.set(key, { text: answer.text, players: [member(player)] });
  }
  const given = new Set(answers.flatMap(({ answer }) => (answer.correct ? [answer.item] : [])));
  const missed = q.items.flatMap((item, i) => (given.has(i) ? [] : [listItemLabel(item)]));
  return {
    answers: right,
    wrong: [...wrong.values()].sort((a, b) => b.players.length - a.players.length),
    missed: missed.slice(0, POINTLESS_MISSED_SHOWN),
    missedCount: missed.length,
  };
}

/** The phone's result: what it answered and how many gave the same right answer. */
export function pointlessResult(
  q: PointlessQuestion,
  player: Player,
  players: Iterable<Player>,
): PlayerResultPayload['pointless'] {
  const a = player.answer;
  if (!a) return { sharedBy: 0 };
  if (!a.correct) return { ...(a.text !== null && { yours: a.text }), sharedBy: 0 };
  const key = groupKey(a);
  const sharedBy = [...players].filter((p) => p.answer?.correct && groupKey(p.answer) === key);
  return { yours: label(q, a), sharedBy: sharedBy.length };
}
