import type { RankedPlayer, SurvivalPlayer, SurvivalStatePayload } from '@lbq/shared';

/** « ❤️❤️🖤 » for 2 hearts left out of 3, « 👻 » for a ghost. */
export function heartsText(hearts: number, max: number): string {
  if (hearts <= 0) return '👻';
  return '❤️'.repeat(hearts) + '🖤'.repeat(Math.max(0, max - hearts));
}

/** Players who lost their last heart on this question (the « éliminé » moment). */
export function eliminatedAt(
  survival: SurvivalStatePayload | null,
  questionIndex: number,
): SurvivalPlayer[] {
  return survival?.players.filter((p) => p.eliminatedAt === questionIndex) ?? [];
}

/** Players still alive. */
export function survivors(survival: SurvivalStatePayload | null): SurvivalPlayer[] {
  return survival?.players.filter((p) => p.hearts > 0) ?? [];
}

/** Leaderboard / podium / report line: « ❤️ 2 » or « 👻 éliminé à la question 3 ». */
export function survivalLabel(s: NonNullable<RankedPlayer['survival']>): string {
  if (s.eliminatedAt !== undefined) return `👻 éliminé à la question ${s.eliminatedAt + 1}`;
  return `❤️ ${s.hearts}`;
}
