import {
  WAGER_MAX_ABS,
  wagerAuthorPoints,
  wagerBetPoints,
  type LobbyMember,
  type PlayerResultPayload,
  type RevealDetails,
  type WagerPrompt,
  type WagerQuestion,
  type WagerShow,
  type WagerSlot,
  type WagerStatus,
} from '@lbq/shared';
import { GameError } from '../errors.js';
import type { Answer, Player } from '../Game.js';

/**
 * WAGER — « Paris sur les réponses » (T61, Wits & Wagers). ANSWERING has two stages:
 * 1. `guess` (`timeLimitSec`): every phone types a number (`player:answer { value }`, stored, not
 *    scored; a new one replaces it until the stage ends).
 * 2. `bet` (`betTimeSec`): the guesses (equal ones merged), sorted ascending, after a first slot
 *    « Plus petit que tout »; every phone bets on one slot (`{ choiceIndex }`, the scored answer,
 *    its own guess allowed). The winning slot = the biggest guess ≤ the right answer (none →
 *    « Plus petit que tout »). A winning bet = `basePoints` (+50 % on the two outer slots); the
 *    author(s) of the winning guess + `basePoints / 2`. No time points.
 * Nobody guessed → no bet stage (the question is revealed at once).
 */
export interface WagerState {
  stage: 'guess' | 'bet';
  /** Guess of each player (id → number). */
  guesses: Map<string, number>;
  /** Built when the bets start: slot 0 = « Plus petit que tout » (`value` null). */
  slots: { value: number | null; authors: string[] }[];
}

export function newWager(): WagerState {
  return { stage: 'guess', guesses: new Map(), slots: [] };
}

/** Stage 1: stores (or replaces) a player's guess. */
export function writeGuess(state: WagerState, playerId: string, value: number): void {
  if (!Number.isFinite(value) || Math.abs(value) > WAGER_MAX_ABS)
    throw new GameError('INVALID_PAYLOAD', 'Nombre invalide');
  state.guesses.set(playerId, value);
}

/** Stage 2 starts: equal guesses merged (authors in guess order), ascending, after « Plus petit… ». */
export function startBets(state: WagerState): void {
  const groups = new Map<number, string[]>();
  for (const [id, value] of state.guesses) {
    const authors = groups.get(value);
    if (authors) authors.push(id);
    else groups.set(value, [id]);
  }
  const sorted = [...groups.entries()].sort((a, b) => a[0] - b[0]);
  state.stage = 'bet';
  state.slots = [
    { value: null, authors: [] },
    ...sorted.map(([value, authors]) => ({ value, authors })),
  ];
}

/** Index of the winning slot: the biggest guess ≤ the right answer, else 0. */
export function winningSlot(state: WagerState, correct: number): number {
  let win = 0;
  state.slots.forEach((s, i) => {
    if (s.value !== null && s.value <= correct) win = i;
  });
  return win;
}

/** Slot 0 and the last one are the riskier bets (+50 %). */
export function isOuterSlot(state: WagerState, index: number): boolean {
  return index === 0 || index === state.slots.length - 1;
}

/** Index of the slot holding this player's guess, if any. */
export function ownSlot(state: WagerState, playerId: string): number | undefined {
  const i = state.slots.findIndex((s) => s.authors.includes(playerId));
  return i >= 0 ? i : undefined;
}

/** Stage 2 answer: right when the bet is on the winning slot. */
export function judgeBet(
  q: WagerQuestion,
  state: WagerState,
  choiceIndex: number,
): Pick<Answer, 'correct' | 'points'> {
  if (state.stage !== 'bet' || !state.slots[choiceIndex])
    throw new GameError('INVALID_PAYLOAD', 'Pari invalide');
  const win = winningSlot(state, q.wager.correct);
  const correct = choiceIndex === win;
  return { correct, points: correct ? wagerBetPoints(q.basePoints, isOuterSlot(state, win)) : 0 };
}

/** Is this player an author of the winning guess (never « Plus petit que tout »)? */
function isWinningAuthor(q: WagerQuestion, state: WagerState, playerId: string): boolean {
  if (state.stage !== 'bet') return false;
  return state.slots[winningSlot(state, q.wager.correct)]!.authors.includes(playerId);
}

/** Points for writing the winning guess (added at the reveal, bet or not). */
export function wagerBonus(q: WagerQuestion, state: WagerState, player: Player): number {
  return isWinningAuthor(q, state, player.id) ? wagerAuthorPoints(q.basePoints) : 0;
}

const member = ({ id, nickname, avatar }: Player): LobbyMember => ({ id, nickname, avatar });

function members(ids: string[], players: ReadonlyMap<string, Player>): LobbyMember[] {
  return ids.flatMap((id) => {
    const p = players.get(id);
    return p ? [member(p)] : [];
  });
}

const unitOf = (q: WagerQuestion) => (q.wager.unit ? { unit: q.wager.unit } : {});

/** `game:state.wager`: the stage and who guessed already (never the numbers). */
export function wagerStatus(state: WagerState, players: ReadonlyMap<string, Player>): WagerStatus {
  return {
    stage: state.stage,
    guessed: state.stage === 'guess' ? members([...state.guesses.keys()], players) : [],
  };
}

/** TV: the slots with their authors once the bets start (never the right answer). */
export function wagerShow(
  q: WagerQuestion,
  state: WagerState,
  players: ReadonlyMap<string, Player>,
): WagerShow {
  if (state.stage === 'guess') return { stage: 'guess', ...unitOf(q) };
  const slots: WagerSlot[] = state.slots.map((s) => ({
    value: s.value,
    authors: members(s.authors, players),
  }));
  return { stage: 'bet', ...unitOf(q), slots };
}

/** One phone: its guess, then the slot values (numbers only) and its own slot. */
export function wagerPrompt(q: WagerQuestion, state: WagerState, playerId: string): WagerPrompt {
  if (state.stage === 'guess') {
    const guess = state.guesses.get(playerId);
    return { stage: 'guess', ...unitOf(q), ...(guess !== undefined && { guess }) };
  }
  const own = ownSlot(state, playerId);
  return {
    stage: 'bet',
    ...unitOf(q),
    slots: state.slots.map((s) => s.value),
    ...(own !== undefined && { own }),
  };
}

/** Reveal (and report): every slot with its authors and bettors, the winning one, the points. */
export function wagerReveal(
  q: WagerQuestion,
  state: WagerState,
  players: ReadonlyMap<string, Player>,
): RevealDetails {
  const list = [...players.values()];
  const bet = state.stage === 'bet';
  const winning = bet ? winningSlot(state, q.wager.correct) : 0;
  return {
    wager: {
      correct: q.wager.correct,
      ...unitOf(q),
      slots: state.slots.map((s, i) => ({
        value: s.value,
        authors: members(s.authors, players),
        bettors: list.filter((p) => p.answer?.choiceIndex === i).map(member),
      })),
      winning,
      betPoints: bet ? wagerBetPoints(q.basePoints, isOuterSlot(state, winning)) : 0,
      authorPoints: bet && winning > 0 ? wagerAuthorPoints(q.basePoints) : 0,
    },
  };
}

/** `player:result.wager`. */
export function wagerResult(
  q: WagerQuestion,
  state: WagerState,
  player: Player,
): Partial<PlayerResultPayload> {
  const guess = state.guesses.get(player.id);
  const choice = player.answer?.choiceIndex;
  const slot = choice != null ? state.slots[choice] : undefined;
  const winning =
    state.stage === 'bet'
      ? (state.slots[winningSlot(state, q.wager.correct)]!.value ?? null)
      : null;
  const author = isWinningAuthor(q, state, player.id);
  return {
    wager: {
      correct: q.wager.correct,
      ...unitOf(q),
      ...(guess !== undefined && { guess }),
      ...(slot && { bet: slot.value }),
      winning,
      won: !!player.answer?.correct,
      author,
      authorPoints: author ? wagerAuthorPoints(q.basePoints) : 0,
    },
  };
}
