import type { GameQuestionReport } from '@lbq/shared';
import { Avatar } from '../components/Avatar';
import { formatValue } from '../lib/numbers';
import { slotLabel } from '../lib/wager';

/**
 * « Paris sur les réponses » (T61) in the report: the right answer, then every slot (smallest
 * first) with who wrote it and who bet on it, the winning one in green.
 */
export function WagerDetails({ q }: { q: GameQuestionReport }) {
  const w = q.details.wager;
  if (!w) return <p className="text-sm text-gray-500 italic">Détail indisponible</p>;
  return (
    <div className="flex flex-col gap-2 text-sm" data-testid="wager-report">
      <p className="font-bold">
        Bonne réponse : <span className="text-answer-green">{formatValue(w.correct, w.unit)}</span>
        {w.slots.length > 1 && (
          <span className="font-normal text-gray-500">
            {' '}
            · pari gagnant + {w.betPoints} pts
            {w.authorPoints > 0 && `, estimation gagnante + ${w.authorPoints} pts`}
          </span>
        )}
      </p>
      {w.slots.length <= 1 && (
        <p className="text-gray-500 italic">Personne n’a donné d’estimation.</p>
      )}
      <ul className="flex flex-col gap-1.5">
        {w.slots.length > 1 &&
          w.slots.map((s, i) => (
            <li
              key={i}
              className={`flex flex-wrap items-center gap-2 rounded-lg px-3 py-1.5 ${
                i === w.winning ? 'bg-answer-green/15 font-bold' : 'bg-gray-50'
              }`}
            >
              <span
                className={`w-40 shrink-0 tabular-nums ${i === w.winning ? 'text-answer-green' : ''}`}
              >
                {i === w.winning ? '✓ ' : ''}
                {slotLabel(s.value, w.unit)}
              </span>
              {s.authors.length > 0 && (
                <span className="flex items-center gap-1 text-gray-500">
                  de
                  {s.authors.map((a) => (
                    <span key={a.id} className="flex items-center gap-1">
                      <Avatar id={a.avatar} size="xs" />
                      {a.nickname}
                    </span>
                  ))}
                </span>
              )}
              <span className="ml-auto flex items-center gap-1">
                {s.bettors.length === 0 ? (
                  <span className="text-gray-400">aucun pari</span>
                ) : (
                  <>
                    <span className="text-gray-500">
                      {s.bettors.length} pari{s.bettors.length > 1 ? 's' : ''}
                    </span>
                    {s.bettors.map((b) => (
                      <Avatar key={b.id} id={b.avatar} size="xs" />
                    ))}
                  </>
                )}
              </span>
            </li>
          ))}
      </ul>
    </div>
  );
}
