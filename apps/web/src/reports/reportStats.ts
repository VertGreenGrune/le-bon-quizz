import type { GameQuestionReport, GameSummary } from '@lbq/shared';

/** Share of the players (answered or not) who got the question right, 0–100, rounded. */
export function percentCorrect(q: GameQuestionReport): number {
  return q.playerCount === 0 ? 0 : Math.round((q.correctCount / q.playerCount) * 100);
}

/** Players who didn't answer in time. */
export function noAnswerCount(q: GameQuestionReport): number {
  const answered = q.distribution.reduce((a, b) => a + b, 0);
  return Math.max(0, q.playerCount - answered);
}

/** Lowest success rate first; ties keep the quiz order. */
export function hardestFirst(questions: GameQuestionReport[]): GameQuestionReport[] {
  return [...questions].sort(
    (a, b) =>
      a.correctCount / (a.playerCount || 1) - b.correctCount / (b.playerCount || 1) ||
      a.index - b.index,
  );
}

/** Average success rate over all questions (0–100), null without questions. */
export function averagePercentCorrect(questions: GameQuestionReport[]): number | null {
  if (questions.length === 0) return null;
  return Math.round(questions.reduce((sum, q) => sum + percentCorrect(q), 0) / questions.length);
}

/** "12 min", "1 h 05", "< 1 min"; null for a game that never ended. */
export function formatDuration(game: Pick<GameSummary, 'startedAt' | 'endedAt'>): string | null {
  if (!game.endedAt) return null;
  const min = Math.round((Date.parse(game.endedAt) - Date.parse(game.startedAt)) / 60_000);
  if (min < 1) return '< 1 min';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}
