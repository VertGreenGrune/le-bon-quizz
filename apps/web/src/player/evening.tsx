import type { EveningStanding } from '@lbq/shared';
import { formatRank } from './playerState';
import { competitionRanks } from '../lib/ranks';

/**
 * « 🌙 Classement de la soirée » (T66) on the phone: this player's place in the chained quizzes,
 * « 🌙 Soirée : 2e sur 6 · 5400 pts ». Null when there is no evening (1st quiz) or no such player.
 */
export function eveningLine(evening: EveningStanding[] | null, nickname: string): string | null {
  if (!evening) return null;
  const index = evening.findIndex((e) => e.nickname === nickname);
  if (index < 0) return null;
  const rank = competitionRanks(evening.map((e) => e.score))[index]!;
  return `🌙 Soirée : ${formatRank(rank)} sur ${evening.length} · ${evening[index]!.score} pts`;
}

export function EveningLine({
  evening,
  nickname,
}: {
  evening: EveningStanding[] | null;
  nickname: string;
}) {
  const text = eveningLine(evening, nickname);
  if (!text) return null;
  return (
    <p className="rounded-2xl bg-black/25 px-4 py-2 text-lg font-bold" data-testid="evening-line">
      {text}
    </p>
  );
}
