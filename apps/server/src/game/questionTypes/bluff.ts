import {
  bluffFoolPoints,
  BLUFF_MAX_LENGTH,
  type BluffOption,
  type BluffPrompt,
  type BluffQuestion,
  type BluffShow,
  type LobbyMember,
  type PlayerResultPayload,
  type RevealDetails,
} from '@lbq/shared';
import { GameError } from '../errors.js';
import { matchesAnswer, normalizeAnswer } from '../matching.js';
import type { Answer, Player } from '../Game.js';

/**
 * BLUFF — « Mytho ! » (PLAN.md §3, Fibbage-like). ANSWERING has two stages:
 * 1. `write` (`timeLimitSec`): every phone sends a lie (`player:answer { text }`), refused when
 *    it is (almost) the real answer; a new one replaces the previous one.
 * 2. `vote` (`voteTimeSec`): the lies (same lies merged) and the truth, shuffled, are the
 *    options; every phone votes (`{ choiceIndex }`, the scored answer), never for its own lie.
 * Finding the truth = `basePoints`; fooling players = `bluffFoolPoints`
 * (+250 each, +500 at most). No time points.
 */
export interface BluffState {
  stage: 'write' | 'vote';
  /** Lie of each player (id → text as typed). */
  lies: Map<string, string>;
  /** Built when the vote starts. */
  options: { text: string; truth: boolean; authors: string[] }[];
}

export function newBluff(): BluffState {
  return { stage: 'write', lies: new Map(), options: [] };
}

/** Stage 1: stores (or replaces) a player's lie. */
export function writeLie(q: BluffQuestion, state: BluffState, playerId: string, text: string) {
  const lie = text.trim().slice(0, BLUFF_MAX_LENGTH);
  if (!lie || !normalizeAnswer(lie))
    throw new GameError('INVALID_PAYLOAD', 'Écris quelque chose !');
  // Same matching as the typed answers, typos included: a lie can't be the truth in disguise.
  if (matchesAnswer(lie, [q.truth], true))
    throw new GameError('LIE_TOO_CLOSE', 'Trop proche de la vraie réponse ! Invente autre chose.');
  state.lies.set(playerId, lie);
}

/** Stage 2 starts: lies merged after normalization (first author's spelling) + the truth. */
export function startVote(
  q: BluffQuestion,
  state: BluffState,
  random: () => number = Math.random,
): void {
  const groups = new Map<string, { text: string; truth: boolean; authors: string[] }>();
  for (const [id, text] of state.lies) {
    const key = normalizeAnswer(text);
    const group = groups.get(key);
    if (group) group.authors.push(id);
    else groups.set(key, { text, truth: false, authors: [id] });
  }
  const options = [...groups.values(), { text: q.truth, truth: true, authors: [] }];
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [options[i], options[j]] = [options[j]!, options[i]!];
  }
  state.stage = 'vote';
  state.options = options;
}

/** Index of the option this player wrote, if any. */
export function ownOption(state: BluffState, playerId: string): number | undefined {
  const i = state.options.findIndex((o) => o.authors.includes(playerId));
  return i >= 0 ? i : undefined;
}

/** Option indexes of the lies, except the player's own one (Copieur / 50/50 helpers). */
export function otherLies(state: BluffState, playerId: string): number[] {
  return state.options.flatMap((o, i) => (o.truth || o.authors.includes(playerId) ? [] : [i]));
}

/** Refuses a vote for one's own lie (sent by the phone; a copied vote just scores nothing). */
export function checkVote(state: BluffState, playerId: string, choiceIndex: number): void {
  if (ownOption(state, playerId) === choiceIndex)
    throw new GameError('INVALID_PAYLOAD', 'Tu ne peux pas voter pour ton propre mytho !');
}

/** Stage 2 answer: right when it is the truth (a vote for one's own lie scores nothing). */
export function judgeVote(
  q: BluffQuestion,
  state: BluffState,
  playerId: string,
  choiceIndex: number,
): Pick<Answer, 'correct' | 'points'> {
  const option = state.options[choiceIndex];
  if (state.stage !== 'vote' || !option) throw new GameError('INVALID_PAYLOAD', 'Choix invalide');
  if (option.authors.includes(playerId)) return { correct: false, points: 0 };
  return { correct: option.truth, points: option.truth ? q.basePoints : 0 };
}

/** Players (ids) who voted for this player's lie. */
function fooledBy(state: BluffState, playerId: string, players: Iterable<Player>): Player[] {
  const own = ownOption(state, playerId);
  if (own === undefined) return [];
  return [...players].filter((p) => p.id !== playerId && p.answer?.choiceIndex === own);
}

/** Points for fooling the others (added at the reveal, voted or not). */
export function bluffBonus(
  q: BluffQuestion,
  state: BluffState,
  player: Player,
  players: Iterable<Player>,
): number {
  return bluffFoolPoints(q.basePoints, fooledBy(state, player.id, players).length);
}

const member = ({ id, nickname, avatar }: Player): LobbyMember => ({ id, nickname, avatar });

export function bluffShow(state: BluffState): BluffShow {
  return state.stage === 'write'
    ? { stage: 'write' }
    : { stage: 'vote', options: state.options.map((o) => o.text) };
}

/** What one phone gets: never which option is true. */
export function bluffPrompt(state: BluffState, playerId: string): BluffPrompt {
  if (state.stage === 'write') {
    const lie = state.lies.get(playerId);
    return { stage: 'write', maxLength: BLUFF_MAX_LENGTH, ...(lie && { lie }) };
  }
  const own = ownOption(state, playerId);
  return {
    stage: 'vote',
    options: state.options.map((o) => o.text),
    ...(own !== undefined && { own }),
  };
}

/**
 * Reveal: every option with its authors and voters, the lies that fooled the fewest first and
 * the truth last (the TV reveals them in this order; ties by text). Kicked authors are left out.
 */
export function bluffReveal(
  q: BluffQuestion,
  state: BluffState,
  players: ReadonlyMap<string, Player>,
): RevealDetails {
  const list = [...players.values()];
  const options: BluffOption[] = state.options.map((o, i) => ({
    text: o.text,
    truth: o.truth,
    authors: o.authors.flatMap((id) => {
      const p = players.get(id);
      return p ? [member(p)] : [];
    }),
    voters: list.filter((p) => p.answer?.choiceIndex === i).map(member),
  }));
  options.sort(
    (a, b) =>
      Number(a.truth) - Number(b.truth) ||
      a.voters.length - b.voters.length ||
      a.text.localeCompare(b.text, 'fr'),
  );
  return { bluff: { truth: q.truth, options } };
}

/** `player:result.bluff`. */
export function bluffResult(
  q: BluffQuestion,
  state: BluffState,
  player: Player,
  players: ReadonlyMap<string, Player>,
): Partial<PlayerResultPayload> {
  const fooled = fooledBy(state, player.id, players.values()).map(member);
  const voted = player.answer?.choiceIndex;
  const option = voted != null ? state.options[voted] : undefined;
  const lie = state.lies.get(player.id);
  const fellFor =
    option && !option.truth && !option.authors.includes(player.id)
      ? option.authors.flatMap((id) => {
          const p = players.get(id);
          return p ? [member(p)] : [];
        })
      : undefined;
  return {
    bluff: {
      truth: q.truth,
      found: !!option?.truth,
      ...(lie && { lie }),
      fooled,
      fooledPoints: bluffFoolPoints(q.basePoints, fooled.length),
      ...(fellFor && { fellFor }),
    },
  };
}
