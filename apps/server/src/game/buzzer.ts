import {
  buzzerAnswer,
  type BuzzerReveal,
  type BuzzerStatus,
  type LobbyMember,
  type PlayerResultPayload,
  type Question,
} from '@lbq/shared';
import type { Answer, Player } from './Game.js';

/**
 * « Buzzer » round of one question (PLAN.md §3 "Buzzer"): the phones only have a BUZZ button;
 * the first player to buzz (as processed by the server) has the hand and answers out loud, the
 * host judges it. The timers live in `Game.ts`; this is the per-question state and its payloads.
 */
export interface BuzzerRound {
  /** Who has the hand (timer frozen until the host judges). */
  holder: string | null;
  /** Every player who answered wrong during this question, in order (reveal, report, scoring). */
  wrong: string[];
  /**
   * Players who can't buzz right now (answered wrong). When nobody is left to buzz, it is
   * emptied and everyone can buzz again: only a right answer or the timer ends the question.
   */
  locked: string[];
  /** Who found the answer (the question then ends). */
  winner: string | null;
}

export const newBuzzerRound = (): BuzzerRound => ({
  holder: null,
  wrong: [],
  locked: [],
  winner: null,
});

const member = ({ id, nickname, avatar }: Player): LobbyMember => ({ id, nickname, avatar });

/** The judged answer stored on the player (scored by the usual REVEAL flow). */
export function buzzerAnswerOf(correct: boolean, basePoints: number, responseMs: number): Answer {
  return {
    choiceIndex: null,
    text: null,
    value: null,
    responseMs,
    correct,
    points: correct ? basePoints : 0,
  };
}

/** Players still in the game, in the order of `ids` (kicked ones are left out). */
function members(ids: string[], players: ReadonlyMap<string, Player>): LobbyMember[] {
  return ids.flatMap((id) => {
    const p = players.get(id);
    return p ? [member(p)] : [];
  });
}

/** `game:state.buzzer` (`wrong` = who can't buzz right now). */
export function buzzerStatus(
  round: BuzzerRound,
  players: ReadonlyMap<string, Player>,
): BuzzerStatus {
  const holder = round.holder ? players.get(round.holder) : undefined;
  return { ...(holder && { holder: member(holder) }), wrong: members(round.locked, players) };
}

/** `question:reveal.buzzer` (also saved in the report). */
export function buzzerReveal(
  q: Question,
  round: BuzzerRound,
  players: ReadonlyMap<string, Player>,
): BuzzerReveal {
  const winner = round.winner ? players.get(round.winner) : undefined;
  return {
    answer: buzzerAnswer(q),
    ...(winner && { winner: member(winner) }),
    wrong: members(round.wrong, players),
  };
}

/** `player:result.buzzer`. */
export function buzzerResult(
  q: Question,
  round: BuzzerRound,
  player: Player,
  players: ReadonlyMap<string, Player>,
): NonNullable<PlayerResultPayload['buzzer']> {
  const winner = round.winner ? players.get(round.winner) : undefined;
  return {
    answer: buzzerAnswer(q),
    won: round.winner === player.id,
    wrong: round.wrong.includes(player.id),
    ...(winner && { winner: member(winner) }),
  };
}
