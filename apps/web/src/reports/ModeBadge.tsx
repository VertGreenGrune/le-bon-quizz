import { JOKERS, type GameMode, type JokerType } from '@lbq/shared';

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

/** Game played with jokers. */
export function JokersBadge() {
  return (
    <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
      🃏 Jokers
    </span>
  );
}

/** Report ranking: the jokers a player played, in order. */
export function JokersUsed({ jokers }: { jokers: JokerType[] }) {
  if (jokers.length === 0) return <span className="text-gray-400">—</span>;
  return (
    <span
      className="flex flex-wrap gap-1"
      aria-label={jokers.map((j) => JOKERS[j].name).join(', ')}
    >
      {jokers.map((j, i) => (
        <span key={i} title={JOKERS[j].name}>
          {JOKERS[j].icon}
        </span>
      ))}
    </span>
  );
}
