import {
  listCorrect,
  listItemLabel,
  listPoints,
  TYPE_ANSWER_MAX_LENGTH,
  type ListFoundItem,
  type ListGuessAck,
  type ListQuestion,
  type ListReveal,
  type ListStatus,
  type LobbyMember,
  type PlayerResultPayload,
  type QuestionPromptPayload,
} from '@lbq/shared';
import { matchItem } from '../matching.js';
import type { Answer, Player } from '../Game.js';

/**
 * LIST — « Liste chrono » (T57, PLAN.md §3). Players type as many items of the list as they can
 * during ANSWERING (`player:answer { text }`, as often as they like): each guess is matched like a
 * typed answer against the items this player hasn't found yet. Nothing is recorded as the
 * player's answer until they found every item (so « everyone answered » = everyone found
 * everything); at the reveal the others get their answer from what they found
 * (`settleList`). Points = `listPoints` (basePoints × share found, no time factor); right =
 * at least half of the items (`listCorrect`).
 */
export interface ListState {
  /** Per player, the items found (index in the list) and when (ms since ANSWERING started). */
  found: Map<string, { index: number; ms: number }[]>;
}

export function newList(): ListState {
  return { found: new Map() };
}

const member = ({ id, nickname, avatar }: Player): LobbyMember => ({ id, nickname, avatar });

const foundBy = (state: ListState, playerId: string) => state.found.get(playerId) ?? [];

/** The item a guess names (`matchItem` of `matching.ts`, shared with « Pas évident ! »). */
const matchListItem = (q: ListQuestion, guess: string, skip: ReadonlySet<number>) =>
  matchItem(q.items, guess, q.typoTolerance, skip);

/** Checks one guess and, when it names a new item, adds it to what the player found. */
export function checkListGuess(
  q: ListQuestion,
  state: ListState,
  playerId: string,
  text: string,
  ms: number,
): ListGuessAck {
  const guess = text.trim().slice(0, TYPE_ANSWER_MAX_LENGTH);
  const found = foundBy(state, playerId);
  const done = new Set(found.map((f) => f.index));
  const index = matchListItem(q, guess, new Set());
  if (index >= 0 && done.has(index)) {
    // Maybe another, unfound item also matches (two close spellings): prefer it.
    const other = matchListItem(q, guess, done);
    if (other < 0) return { result: 'already', item: item(q, index), found: found.length };
    return add(q, state, playerId, other, ms);
  }
  if (index < 0) return { result: 'wrong', found: found.length };
  return add(q, state, playerId, index, ms);
}

function add(
  q: ListQuestion,
  state: ListState,
  playerId: string,
  index: number,
  ms: number,
): ListGuessAck {
  const found = [...foundBy(state, playerId), { index, ms }];
  state.found.set(playerId, found);
  return { result: 'found', item: item(q, index), found: found.length };
}

const item = (q: ListQuestion, index: number): ListFoundItem => ({
  index,
  text: listItemLabel(q.items[index]!),
});

export function foundAll(q: ListQuestion, state: ListState, playerId: string): boolean {
  return foundBy(state, playerId).length >= q.items.length;
}

/** The player's answer from what they found (time = when they found their last item). */
export function listAnswer(q: ListQuestion, state: ListState, playerId: string): Answer {
  const found = foundBy(state, playerId);
  return {
    choiceIndex: null,
    text: null,
    value: null,
    responseMs: Math.max(0, ...found.map((f) => f.ms)),
    correct: listCorrect(found.length, q.items.length),
    points: listPoints(q.basePoints, found.length, q.items.length),
  };
}

/** At the reveal: players who found some items but not all get their answer now. */
export function settleList(q: ListQuestion, state: ListState, players: Iterable<Player>): void {
  for (const p of players)
    if (!p.answer && foundBy(state, p.id).length > 0) p.answer = listAnswer(q, state, p.id);
}

/** Players who found at least one item, most first (then the first to reach that count). */
function counts(state: ListState, players: Iterable<Player>) {
  return [...players]
    .map((p) => ({ player: p, found: foundBy(state, p.id) }))
    .sort(
      (a, b) =>
        b.found.length - a.found.length ||
        Math.max(0, ...a.found.map((f) => f.ms)) - Math.max(0, ...b.found.map((f) => f.ms)),
    );
}

/** Live on the TV: per item how many players found it (never which), per player how many. */
export function listStatus(
  q: ListQuestion,
  state: ListState,
  players: Iterable<Player>,
): ListStatus {
  const items = q.items.map(() => 0);
  for (const found of state.found.values()) for (const f of found) items[f.index]!++;
  return {
    items,
    players: counts(state, players).map(({ player, found }) => ({
      ...member(player),
      found: found.length,
    })),
  };
}

export function listPrompt(
  q: ListQuestion,
  state: ListState,
  playerId: string,
): QuestionPromptPayload['list'] {
  return {
    total: q.items.length,
    maxLength: TYPE_ANSWER_MAX_LENGTH,
    found: foundBy(state, playerId).map((f) => item(q, f.index)),
  };
}

/** Every item with who found it (fastest first), then every player's count. */
export function listReveal(
  q: ListQuestion,
  state: ListState,
  players: Iterable<Player>,
): ListReveal {
  const list = [...players];
  return {
    items: q.items.map((text, index) => ({
      text: listItemLabel(text),
      finders: list
        .flatMap((p) => {
          const f = foundBy(state, p.id).find((x) => x.index === index);
          return f ? [{ p, ms: f.ms }] : [];
        })
        .sort((a, b) => a.ms - b.ms)
        .map(({ p }) => member(p)),
    })),
    players: counts(state, list).map(({ player, found }) => ({
      ...member(player),
      found: found.length,
    })),
  };
}

export function listResult(
  q: ListQuestion,
  state: ListState,
  player: Player,
): PlayerResultPayload['list'] {
  const found = new Set(foundBy(state, player.id).map((f) => f.index));
  return {
    found: found.size,
    total: q.items.length,
    missed: q.items.flatMap((text, i) => (found.has(i) ? [] : [listItemLabel(text)])),
  };
}
