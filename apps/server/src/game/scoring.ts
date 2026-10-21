import type { AvatarId, RankedPlayer } from '@lbq/shared';

/**
 * Points for a correct answer (PLAN.md §3):
 * `round(basePoints * (1 - (responseMs / timeLimitMs) / 2))`.
 * `responseMs` is clamped to [0, timeLimitMs], so a correct answer earns between half and all
 * of `basePoints`.
 */
export function computePoints(basePoints: number, responseMs: number, timeLimitMs: number): number {
  if (basePoints <= 0 || timeLimitMs <= 0) return 0;
  const t = Math.min(Math.max(responseMs, 0), timeLimitMs);
  return Math.round(basePoints * (1 - t / timeLimitMs / 2));
}

/**
 * SLIDER (PLAN.md §3): a guess within ± `margin` of the correct value is correct and earns the
 * time-based points × (1 − 0.5 × distance / margin) — exact = full points, edge of the margin =
 * half. With margin 0 only the exact value is correct (full points). Outside: 0, wrong.
 */
export function sliderPoints(
  timePoints: number,
  guess: number,
  correct: number,
  margin: number,
): { correct: boolean; points: number } {
  const distance = Math.abs(guess - correct);
  // Float tolerance: steps like 0.1 make 0.3 − 0.1 ≠ 0.2.
  if (distance > margin + 1e-9) return { correct: false, points: 0 };
  const factor = margin > 0 ? 1 - (0.5 * Math.min(distance, margin)) / margin : 1;
  return { correct: true, points: Math.round(timePoints * factor) };
}

export const STREAK_BONUS_STEP = 100;
export const STREAK_BONUS_MAX = 500;

/**
 * Streak bonus (PLAN.md §3) for a correct answer that brings the streak of consecutive correct
 * answers to `streak` (this one included): +100 per correct answer after the first, capped at
 * +500 — 1 → 0, 2 → 100, …, 6+ → 500.
 */
export function streakBonus(streak: number): number {
  return Math.min(Math.max(streak - 1, 0) * STREAK_BONUS_STEP, STREAK_BONUS_MAX);
}

export interface Scored {
  id: string;
  nickname: string;
  avatar: AvatarId;
  totalScore: number;
}

/**
 * Sorts by score (desc, then nickname for a stable order) and assigns competition ranks:
 * equal scores share a rank, the next rank skips (1, 2, 2, 4).
 */
export function rankPlayers<T extends Scored>(players: Iterable<T>): { player: T; rank: number }[] {
  const sorted = [...players].sort(
    (a, b) => b.totalScore - a.totalScore || a.nickname.localeCompare(b.nickname),
  );
  const ranked: { player: T; rank: number }[] = [];
  sorted.forEach((player, i) => {
    const prev = ranked[i - 1];
    const rank = prev && prev.player.totalScore === player.totalScore ? prev.rank : i + 1;
    ranked.push({ player, rank });
  });
  return ranked;
}

export function topPlayers(players: Iterable<Scored>, size: number): RankedPlayer[] {
  return rankPlayers(players)
    .slice(0, size)
    .map(({ player }) => ({
      nickname: player.nickname,
      avatar: player.avatar,
      score: player.totalScore,
    }));
}

/**
 * Points a team earns on one question (PLAN.md §3): the average of the points earned by its
 * members present for that question, rounded. Averaging (instead of summing) keeps teams of
 * different sizes comparable; a team with nobody present earns 0.
 */
export function teamQuestionPoints(memberPoints: readonly number[]): number {
  if (memberPoints.length === 0) return 0;
  return Math.round(memberPoints.reduce((sum, p) => sum + p, 0) / memberPoints.length);
}

/** Same competition ranks as `rankPlayers` (ties share a rank), stable order by team id. */
export function rankTeams<T extends { id: number; score: number }>(
  teams: Iterable<T>,
): { team: T; rank: number }[] {
  const sorted = [...teams].sort((a, b) => b.score - a.score || a.id - b.id);
  const ranked: { team: T; rank: number }[] = [];
  sorted.forEach((team, i) => {
    const prev = ranked[i - 1];
    ranked.push({ team, rank: prev && prev.team.score === team.score ? prev.rank : i + 1 });
  });
  return ranked;
}
