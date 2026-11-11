import {
  POTATO_WRONG_LOCK_MS,
  potatoPassPoints,
  potatoSurvivorPoints,
  type AnswerInput,
  type HotPotatoQuestion,
  type LobbyMember,
  type PlayerResultPayload,
  type PotatoAnswerAck,
  type PotatoPrompt,
  type PotatoShow,
  type PotatoStatus,
  type PotatoSub,
  type RevealDetails,
} from '@lbq/shared';
import { GameError } from '../errors.js';
import type { Answer, Player } from '../Game.js';

/**
 * HOT_POTATO — « Patate chaude » (T63, PLAN.md §3). One question = one round, all in ANSWERING.
 * When ANSWERING starts the server draws the secret fuse (the phase timer) and gives the bomb to
 * a random connected player with the first sub-question. Only the holder's phone gets the
 * sub-question (the TV too); the holder answers with `{ choiceIndex }`:
 * - right → a pass: the bomb goes to a random other player (never straight back to the one who
 *   passed it, when there is a choice) with the next sub-question;
 * - wrong → the next sub-question for the same holder, answerable after POTATO_WRONG_LOCK_MS.
 * Sub-questions come in the quiz's order, shuffled again once all were asked. When the fuse runs
 * out (or the host skips) the holder loses: 0 points, `correct = false`; every other present
 * player is `correct` with `basePoints / 2`, and everyone earns `basePoints / 10` per pass.
 */
export interface PotatoState {
  /** null: nobody holds it (a game alone, or every other player left). */
  holderId: string | null;
  /** Who passed the bomb to the holder (null for the first holder). */
  fromId: string | null;
  /** The fuse drawn at the start, in ms (the ANSWERING timer — never sent). */
  fuseMs: number;
  /** Sub-question indexes still to ask, in order (refilled shuffled once empty). */
  queue: number[];
  /** Index (in the quiz's list) of the holder's sub-question (null: none). */
  current: number | null;
  /** How many sub-questions were asked so far (the current one included). */
  asked: number;
  /** The holder answered wrong: answers refused until this time (ms since epoch). */
  lockedUntil: number;
  /** Passes per player. */
  passes: Map<string, number>;
  /** Players who took part (connected at the start, or held the bomb): they score at the end. */
  present: Set<string>;
  /** Fewer than 2 players at the start: nothing played, nobody scores (like a poll). */
  alone: boolean;
}

/** A fuse length (ms) in [fuseMinSec, fuseMaxSec], drawn with `random`. */
export function drawFuseMs(q: HotPotatoQuestion, random: () => number): number {
  const { fuseMinSec, fuseMaxSec } = q.potato;
  const span = (fuseMaxSec - fuseMinSec) * 1000;
  return fuseMinSec * 1000 + Math.min(span, Math.floor(random() * (span + 1)));
}

function shuffled(count: number, random: () => number): number[] {
  const list = Array.from({ length: count }, (_, i) => i);
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j]!, list[i]!];
  }
  return list;
}

/** The next sub-question: the quiz's order first, then reshuffled rounds (no immediate repeat). */
export function nextSub(q: HotPotatoQuestion, state: PotatoState, random: () => number): void {
  if (state.queue.length === 0) {
    const order = shuffled(q.potato.questions.length, random);
    // Never the same sub-question twice in a row across the reshuffle.
    if (order.length > 1 && order[0] === state.current) order.push(order.shift()!);
    state.queue = order;
  }
  state.current = state.queue.shift()!;
  state.asked++;
}

const pickRandom = <T>(list: readonly T[], random: () => number): T | undefined =>
  list[Math.min(list.length - 1, Math.floor(random() * list.length))];

/**
 * Who gets the bomb from `fromId`: a random other player, connected ones first (an offline one
 * would pause the game); never straight back to whoever passed it to `fromId` when there is
 * another choice. undefined: nobody else in the game.
 */
export function pickReceiver(
  players: readonly Player[],
  fromId: string,
  previousId: string | null,
  random: () => number,
): Player | undefined {
  const others = players.filter((p) => p.id !== fromId);
  const online = others.filter((p) => p.socketId !== null);
  const pool = online.length > 0 ? online : others;
  const notBack = pool.filter((p) => p.id !== previousId);
  return pickRandom(notBack.length > 0 ? notBack : pool, random);
}

/** The round starts (ANSWERING): fuse, first holder (a connected player), first sub-question. */
export function startPotato(
  q: HotPotatoQuestion,
  players: readonly Player[],
  random: () => number,
): PotatoState {
  const online = players.filter((p) => p.socketId !== null);
  const alone = players.length < 2;
  const holder = alone ? undefined : pickRandom(online.length > 0 ? online : players, random);
  const state: PotatoState = {
    holderId: holder?.id ?? null,
    fromId: null,
    fuseMs: drawFuseMs(q, random),
    queue: q.potato.questions.map((_, i) => i),
    current: null,
    asked: 0,
    lockedUntil: 0,
    passes: new Map(),
    present: new Set(online.map((p) => p.id)),
    alone,
  };
  if (holder) {
    state.present.add(holder.id);
    nextSub(q, state, random);
  }
  return state;
}

/**
 * The holder answers their sub-question. Right → pass (new holder, next sub-question); wrong →
 * next sub-question after the lock. Refused for anyone else, during the lock, or without a choice.
 */
export function answerPotato(
  q: HotPotatoQuestion,
  state: PotatoState,
  playerId: string,
  given: AnswerInput,
  now: number,
  players: readonly Player[],
  random: () => number,
): PotatoAnswerAck {
  if (playerId !== state.holderId || state.current === null)
    throw new GameError('INVALID_PAYLOAD', 'Tu n’as pas la patate !');
  if (!('choiceIndex' in given)) throw new GameError('INVALID_PAYLOAD', 'Choisis une réponse');
  const sub = q.potato.questions[state.current]!;
  if (!Number.isInteger(given.choiceIndex) || !sub.choices[given.choiceIndex])
    throw new GameError('INVALID_PAYLOAD', 'Choix invalide');
  if (now < state.lockedUntil) throw new GameError('FROZEN', 'Raté ! Attends un instant…');
  if (given.choiceIndex !== sub.correct) {
    state.lockedUntil = now + POTATO_WRONG_LOCK_MS;
    nextSub(q, state, random);
    return 'wrong';
  }
  state.passes.set(playerId, (state.passes.get(playerId) ?? 0) + 1);
  const receiver = pickReceiver(players, playerId, state.fromId, random);
  // Nobody else left (everyone else kicked): the holder keeps it, with a new sub-question.
  if (receiver) {
    state.fromId = playerId;
    state.holderId = receiver.id;
    state.present.add(receiver.id);
  }
  state.lockedUntil = 0;
  nextSub(q, state, random);
  return 'pass';
}

/**
 * The holder left (kicked, or excused by the host while offline): the bomb goes to someone else,
 * with a new sub-question. Returns false when nobody is left to take it.
 */
export function handOff(
  q: HotPotatoQuestion,
  state: PotatoState,
  players: readonly Player[],
  random: () => number,
  exclude: ReadonlySet<string> = new Set(),
): boolean {
  const leaving = state.holderId;
  const candidates = players.filter((p) => !exclude.has(p.id));
  const receiver = pickReceiver(candidates, leaving ?? '', null, random);
  state.fromId = null;
  state.lockedUntil = 0;
  if (!receiver) {
    state.holderId = null;
    state.current = null;
    return false;
  }
  state.holderId = receiver.id;
  state.present.add(receiver.id);
  nextSub(q, state, random);
  return true;
}

/**
 * The bomb goes off (fuse, host skip): the holder loses (0, wrong); every other player who took
 * part (or is connected now) is right with the survivor points; everyone adds their passes.
 */
export function settlePotato(
  q: HotPotatoQuestion,
  state: PotatoState,
  players: Iterable<Player>,
): void {
  if (state.alone) return;
  for (const p of players) {
    const passes = state.passes.get(p.id) ?? 0;
    if (!state.present.has(p.id) && p.socketId === null && passes === 0) continue; // absent
    const loser = p.id === state.holderId;
    const points = loser
      ? 0
      : potatoSurvivorPoints(q.basePoints) + passes * potatoPassPoints(q.basePoints);
    p.answer = answerOf(!loser, points);
  }
}

function answerOf(correct: boolean, points: number): Answer {
  return { choiceIndex: null, text: null, value: null, responseMs: 0, correct, points };
}

const member = ({ id, nickname, avatar }: Player): LobbyMember => ({ id, nickname, avatar });

function memberOf(players: ReadonlyMap<string, Player>, id: string | null) {
  const p = id ? players.get(id) : undefined;
  return p ? member(p) : undefined;
}

function sub(q: HotPotatoQuestion, state: PotatoState): PotatoSub | undefined {
  if (state.current === null) return undefined;
  const s = q.potato.questions[state.current]!;
  return { number: state.asked, text: s.text, choices: [...s.choices] };
}

function lockLeft(state: PotatoState, now: number): number {
  return Math.max(0, state.lockedUntil - now);
}

/** `game:state.potato` (everyone): holder, who passed it, time so far, passes. */
export function potatoStatus(
  state: PotatoState,
  players: ReadonlyMap<string, Player>,
  elapsedMs: number,
): PotatoStatus {
  const holder = memberOf(players, state.holderId);
  const from = memberOf(players, state.fromId);
  let passes = 0;
  for (const n of state.passes.values()) passes += n;
  return {
    ...(holder && { holder }),
    ...(from && { from }),
    elapsedMs: Math.max(0, Math.round(elapsedMs)),
    passes,
  };
}

/** TV: the holder and their sub-question (never the right choice). */
export function potatoShow(
  q: HotPotatoQuestion,
  state: PotatoState,
  players: ReadonlyMap<string, Player>,
  now: number,
): PotatoShow {
  const holder = memberOf(players, state.holderId);
  const current = sub(q, state);
  const lockMs = lockLeft(state, now);
  return {
    ...(holder && { holder }),
    ...(current && { sub: current }),
    ...(lockMs > 0 && { lockMs }),
    fuseMinSec: q.potato.fuseMinSec,
  };
}

/** One phone: the sub-question for the holder only. */
export function potatoPrompt(
  q: HotPotatoQuestion,
  state: PotatoState,
  players: ReadonlyMap<string, Player>,
  playerId: string,
  now: number,
): PotatoPrompt {
  const holder = memberOf(players, state.holderId);
  const from = memberOf(players, state.fromId);
  const mine = playerId !== '' && playerId === state.holderId;
  const current = mine ? sub(q, state) : undefined;
  const lockMs = mine ? lockLeft(state, now) : 0;
  return {
    ...(holder && { holder }),
    ...(from && { from }),
    ...(current && { sub: current }),
    ...(lockMs > 0 && { lockMs }),
    passes: state.passes.get(playerId) ?? 0,
  };
}

/** The remote (`remote:answer`): the current sub-question and its right choice. */
export function potatoRemoteAnswer(q: HotPotatoQuestion, state: PotatoState): string[] {
  if (state.current === null) return [];
  const s = q.potato.questions[state.current]!;
  return [`${state.asked}. ${s.text}`, `→ ${s.choices[s.correct] ?? ''}`];
}

/** Reveal (also saved in the report): the loser, then everyone by passes. */
export function potatoReveal(
  q: HotPotatoQuestion,
  state: PotatoState,
  players: ReadonlyMap<string, Player>,
): RevealDetails {
  const loser = state.alone ? undefined : memberOf(players, state.holderId);
  const list = [...players.values()]
    .map((p) => ({
      ...member(p),
      passes: state.passes.get(p.id) ?? 0,
      points: p.answer?.points ?? 0,
    }))
    .sort(
      (a, b) =>
        Number(b.id === loser?.id) - Number(a.id === loser?.id) ||
        b.passes - a.passes ||
        b.points - a.points,
    );
  const last = state.current !== null ? q.potato.questions[state.current] : undefined;
  return {
    potato: {
      ...(loser && { loser }),
      players: list,
      asked: state.asked,
      ...(last && { last: { text: last.text, answer: last.choices[last.correct] ?? '' } }),
    },
  };
}

/** `player:result.potato`. */
export function potatoResult(
  q: HotPotatoQuestion,
  state: PotatoState,
  player: Player,
  players: ReadonlyMap<string, Player>,
): Partial<PlayerResultPayload> {
  const loser = state.alone ? undefined : memberOf(players, state.holderId);
  const exploded = !!loser && loser.id === player.id;
  const passes = state.passes.get(player.id) ?? 0;
  const scored = !!player.answer;
  return {
    potato: {
      exploded,
      ...(loser && { loser }),
      passes,
      passPoints: exploded || !scored ? 0 : passes * potatoPassPoints(q.basePoints),
      survivorPoints: exploded || !scored ? 0 : potatoSurvivorPoints(q.basePoints),
    },
  };
}
