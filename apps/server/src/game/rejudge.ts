import {
  acceptKind,
  acceptedChoiceIndexes,
  isMultipleAnswer,
  type AcceptedAnswers,
  type Question,
  type TeamId,
  type TypedAnswerGroup,
} from '@lbq/shared';
import { GameError } from './errors.js';
import type { Answer, Player, QuestionStats } from './Game.js';
import type { JokerSnapshot, Jokers } from './jokers.js';
import { matchesAnswer, normalizeAnswer } from './matching.js';
import { sliderPoints } from './scoring.js';
import type { Survival, SurvivalSnapshot } from './survival.js';

/**
 * « ✅ Accepter aussi cette réponse » (T44, PLAN.md §3). At the reveal of a question whose answer
 * was set wrong, the host makes a refused answer right too: the game goes back to the state saved
 * just before the reveal's settlement (`Settlement`), judges every answer again with the accepted
 * answers (`rejudgeAnswer`, from each player's real answer time) and settles the question again —
 * streak, jokers, team averages, « Survie » — with the same random draws (`ReplayRandom`).
 */

/** What the host accepts: one of a choice, a typed answer, a wider slider margin. */
export type AcceptInput = { choiceIndex?: number; text?: string; margin?: number };

const invalid = (message: string) => new GameError('INVALID_PAYLOAD', message);

/**
 * The accepted answers once `input` is added, or null when it changes nothing (already right:
 * accepting twice is a no-op). Throws `INVALID_PAYLOAD` for a type that doesn't take it.
 */
export function addAccept(
  q: Question,
  accepted: AcceptedAnswers,
  input: AcceptInput,
): AcceptedAnswers | null {
  switch (acceptKind(q)) {
    case 'choice': {
      const i = input.choiceIndex;
      if (i === undefined || !('choices' in q) || !q.choices[i])
        throw invalid('Choisis une réponse à accepter');
      if (acceptedChoiceIndexes(q, accepted).includes(i)) return null;
      return {
        ...accepted,
        choiceIndexes: [...(accepted.choiceIndexes ?? []), i].sort((a, b) => a - b),
      };
    }
    case 'text': {
      const text = input.text?.trim();
      if (!text || q.type !== 'TYPE_ANSWER') throw invalid('Choisis une réponse à accepter');
      if (
        matchesAnswer(text, q.acceptedAnswers, q.typoTolerance) ||
        matchesAnswer(text, accepted.texts ?? [], false)
      )
        return null;
      return { ...accepted, texts: [...(accepted.texts ?? []), text] };
    }
    case 'margin': {
      if (input.margin === undefined || q.type !== 'SLIDER')
        throw invalid('Choisis une tolérance à accepter');
      const margin = Math.min(input.margin, q.slider.max - q.slider.min);
      if (margin <= (accepted.margin ?? q.slider.margin)) return null;
      return { ...accepted, margin };
    }
    default:
      throw invalid('Impossible d’accepter une autre réponse sur cette question');
  }
}

/**
 * One answer judged again with the accepted answers. An accept never makes a right answer
 * wrong; a newly right answer gets its time-based points from `scoringMs` (the real answer time,
 * halved by a Sablier). SLIDER: every guess is scored again with the wider margin.
 */
export function rejudgeAnswer(
  q: Question,
  original: Answer,
  accepted: AcceptedAnswers,
  timePoints: (ms: number) => number,
  scoringMs: number,
): Answer {
  const right = (): Answer => ({ ...original, correct: true, points: timePoints(scoringMs) });
  if (q.type === 'SLIDER') {
    if (original.value === null || accepted.margin === undefined) return original;
    const margin = Math.max(accepted.margin, q.slider.margin);
    return {
      ...original,
      ...sliderPoints(timePoints(scoringMs), original.value, q.slider.correct, margin),
    };
  }
  if (original.correct) return original;
  if (q.type === 'TYPE_ANSWER')
    return original.text !== null && matchesAnswer(original.text, accepted.texts ?? [], false)
      ? right()
      : original;
  if (q.type !== 'MCQ' && q.type !== 'TRUE_FALSE') return original;
  if (isMultipleAnswer(q)) {
    // « Select all »: the set to tick grows with the accepted choices.
    const set = acceptedChoiceIndexes(q, accepted);
    const ticked = original.choiceIndexes ?? [];
    return ticked.length === set.length && ticked.every((i, k) => i === set[k])
      ? right()
      : original;
  }
  return original.choiceIndex !== null && accepted.choiceIndexes?.includes(original.choiceIndex)
    ? right()
    : original;
}

/**
 * TYPE_ANSWER reveal: the typed answers grouped after normalization, most frequent first
 * (earliest answer names a group). `accepted` marks the groups the host accepted.
 */
export function groupTypedAnswers(
  answers: readonly Answer[],
  accepted: AcceptedAnswers,
): TypedAnswerGroup[] {
  const groups = new Map<string, TypedAnswerGroup>();
  for (const answer of [...answers].sort((a, b) => a.responseMs - b.responseMs)) {
    if (answer.text === null) continue;
    const key = normalizeAnswer(answer.text);
    const group = groups.get(key);
    if (group) group.count++;
    else
      groups.set(key, {
        text: answer.text,
        count: 1,
        correct: answer.correct,
        ...(matchesAnswer(answer.text, accepted.texts ?? [], false) && { accepted: true as const }),
      });
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

/** Whether the host accepted anything on this question. */
export const hasAccepts = (a: AcceptedAnswers): boolean =>
  !!(a.choiceIndexes?.length || a.texts?.length || a.margin !== undefined);

/**
 * Random source of the joker engine, replayable: the draws of a reveal's settlement (jokers
 * earned for a streak) are recorded, and the same values come out again when the question is
 * settled again — fresh draws only beyond them.
 */
export class ReplayRandom {
  private recorded: number[] = [];
  private position = 0;
  private recording = false;

  constructor(private readonly source: () => number) {}

  readonly next = (): number => {
    if (!this.recording) return this.source();
    if (this.position < this.recorded.length) return this.recorded[this.position++]!;
    const value = this.source();
    this.recorded.push(value);
    this.position++;
    return value;
  };

  /** A new settlement: forget the previous draws, record these. */
  record(): void {
    this.recorded = [];
    this.position = 0;
    this.recording = true;
  }

  /** The same settlement again: the recorded draws first. */
  replay(): void {
    this.position = 0;
    this.recording = true;
  }

  stop(): void {
    this.recording = false;
  }
}

/** What a reveal's settlement reads and changes in its `Game`. */
export interface SettlementContext {
  players: ReadonlyMap<string, Player>;
  teamScores: Map<TeamId, number>;
  teamGains: Map<TeamId, number>;
  jokers: Jokers | null;
  survival: Survival | null;
  questionStats: QuestionStats[];
}

interface SavedPlayer {
  totalScore: number;
  correctCount: number;
  streak: number;
  /** The answer as the player gave it (judged with the quiz's own answers). */
  answer: Answer | null;
}

/** Everything a reveal's settlement changes, saved just before it, plus the host's accepts. */
export class Settlement {
  accepted: AcceptedAnswers = {};
  /** Players whose refused answer the host made right (`player:result.accepted`). */
  readonly acceptedIds = new Set<string>();

  private constructor(
    private readonly ctx: SettlementContext,
    private readonly players: Map<string, SavedPlayer>,
    private readonly teamScores: Map<TeamId, number>,
    private readonly teamGains: Map<TeamId, number>,
    private readonly jokers: JokerSnapshot | null,
    private readonly survival: SurvivalSnapshot | null,
    private readonly statsCount: number,
  ) {}

  static capture(ctx: SettlementContext): Settlement {
    const players = new Map<string, SavedPlayer>();
    for (const p of ctx.players.values())
      players.set(p.id, {
        totalScore: p.totalScore,
        correctCount: p.correctCount,
        streak: p.streak,
        answer: p.answer && { ...p.answer },
      });
    return new Settlement(
      ctx,
      players,
      new Map(ctx.teamScores),
      new Map(ctx.teamGains),
      ctx.jokers?.snapshot() ?? null,
      ctx.survival?.snapshot() ?? null,
      ctx.questionStats.length,
    );
  }

  /** The answer as given, before any accept. */
  original(playerId: string): Answer | null {
    const answer = this.players.get(playerId)?.answer;
    return answer ? { ...answer } : null;
  }

  /** Back to just before the settlement (players kicked since then are left as they are). */
  restore(): void {
    for (const p of this.ctx.players.values()) {
      const saved = this.players.get(p.id);
      if (!saved) continue;
      p.totalScore = saved.totalScore;
      p.correctCount = saved.correctCount;
      p.streak = saved.streak;
      p.answer = saved.answer && { ...saved.answer };
      p.lastResult = null;
    }
    resetMap(this.ctx.teamScores, this.teamScores);
    resetMap(this.ctx.teamGains, this.teamGains);
    if (this.jokers) this.ctx.jokers?.restore(this.jokers);
    if (this.survival) this.ctx.survival?.restore(this.survival);
    this.ctx.questionStats.length = this.statsCount;
  }
}

function resetMap<K, V>(target: Map<K, V>, saved: Map<K, V>): void {
  target.clear();
  for (const [k, v] of saved) target.set(k, v);
}
