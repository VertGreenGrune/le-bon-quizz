import type { GameQuestionReport, GameSummary } from '@lbq/shared';

/** A poll has no right answer: left out of success rates and of "hardest first". */
export function isScored(q: Pick<GameQuestionReport, 'type'>): boolean {
  return q.type !== 'POLL';
}

/** Share of the players (answered or not) who got the question right, 0–100, rounded. */
export function percentCorrect(q: GameQuestionReport): number {
  return q.playerCount === 0 ? 0 : Math.round((q.correctCount / q.playerCount) * 100);
}

/** Players who didn't answer in time. */
export function noAnswerCount(q: GameQuestionReport): number {
  return Math.max(0, q.playerCount - q.answerCount);
}

/** Lowest success rate first, polls last; ties keep the quiz order. */
export function hardestFirst(questions: GameQuestionReport[]): GameQuestionReport[] {
  const rate = (q: GameQuestionReport) =>
    isScored(q) ? q.correctCount / (q.playerCount || 1) : Infinity;
  return [...questions].sort((a, b) => rate(a) - rate(b) || a.index - b.index);
}

/** Average success rate over the scored questions (0–100), null without any (polls only). */
export function averagePercentCorrect(questions: GameQuestionReport[]): number | null {
  const scored = questions.filter(isScored);
  if (scored.length === 0) return null;
  return Math.round(scored.reduce((sum, q) => sum + percentCorrect(q), 0) / scored.length);
}

/** "12 min", "1 h 05", "< 1 min"; null for a game that never ended. */
export function formatDuration(game: Pick<GameSummary, 'startedAt' | 'endedAt'>): string | null {
  if (!game.endedAt) return null;
  const min = Math.round((Date.parse(game.endedAt) - Date.parse(game.startedAt)) / 60_000);
  if (min < 1) return '< 1 min';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}
