import type { GameMode } from '@lbq/shared';

/** "Solo" / "Équipes" tag of a past game. */
export function ModeBadge({ mode }: { mode: GameMode }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${
        mode === 'teams' ? 'bg-brand/15 text-brand' : 'bg-gray-100 text-gray-600'
      }`}
    >
      {mode === 'teams' ? '👥 Équipes' : 'Solo'}
    </span>
  );
}
