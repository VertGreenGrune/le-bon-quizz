import type { GameQuestionReport } from '@lbq/shared';
import { Avatar } from '../components/Avatar';
import { MatchSideCard } from '../components/MatchSideCard';

/** « Associer » (T67) in the report: the right pairs, how many found each, every player's score. */
export function MatchDetails({ q }: { q: GameQuestionReport }) {
  const m = q.details.match;
  if (!m) return <p className="text-sm text-gray-500 italic">Détail indisponible</p>;
  const total = m.pairs.length;
  return (
    <div className="flex flex-col gap-3 text-sm" data-testid="match-report">
      <ol className="flex flex-col gap-1">
        {m.pairs.map((pair, p) => (
          <li
            key={p}
            className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-2 rounded-lg bg-gray-50 px-2 py-1"
          >
            <MatchSideCard side={pair.left} size="sm" />
            <span className="font-black text-gray-400">↔</span>
            <MatchSideCard side={pair.right} size="sm" />
            <span className="font-bold text-answer-green tabular-nums">✓ {m.found[p]}</span>
          </li>
        ))}
      </ol>
      <ul className="flex flex-col gap-1">
        {m.answers.map((a) => (
          <li key={a.nickname} className="flex items-center gap-2">
            <Avatar id={a.avatar} size="xs" />
            <span className="font-semibold">{a.nickname}</span>
            {a.links.length ? (
              <>
                <span className="text-gray-500">
                  {a.right} / {total} paire{total > 1 ? 's' : ''} juste{a.right > 1 ? 's' : ''}
                </span>
                <span className="ml-auto font-bold tabular-nums">+ {a.points} pts</span>
              </>
            ) : (
              <span className="text-gray-500 italic">pas de réponse</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
