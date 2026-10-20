import type { RankedPlayer } from '@lbq/shared';

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

export interface Scored {
  id: string;
  nickname: string;
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
    .map(({ player }) => ({ nickname: player.nickname, score: player.totalScore }));
}
