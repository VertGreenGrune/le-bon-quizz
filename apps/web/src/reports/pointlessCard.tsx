import type { GameQuestionReport } from '@lbq/shared';
import { Avatar } from '../components/Avatar';

/**
 * « Pas évident ! » (T60) in the report: the right answers given (rarest first, 💎 when unique)
 * with who gave them and the points each, the wrong ones, and a few nobody thought of.
 */
export function PointlessDetails({ q }: { q: GameQuestionReport }) {
  const p = q.details.pointless;
  if (!p) return null;
  return (
    <div className="flex flex-col gap-3">
      {p.answers.length > 0 && (
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {p.answers.map((a) => (
            <li
              key={a.text}
              className="flex items-center gap-2 rounded-lg bg-answer-green/10 px-3 py-1.5"
            >
              <span className="min-w-0 flex-1 truncate font-bold">
                {a.players.length === 1 && '💎 '}
                {a.text}
                {a.accepted && ' (acceptée)'}
              </span>
              {a.players.map((m) => (
                <Avatar key={m.id} id={m.avatar} size="xs" />
              ))}
              <span className="text-sm font-bold tabular-nums">+{a.points}</span>
            </li>
          ))}
        </ul>
      )}
      {p.wrong.length > 0 && (
        <p className="text-sm text-gray-600">
          Raté :{' '}
          {p.wrong
            .map((w) => `${w.text} (${w.players.map((m) => m.nickname).join(', ')})`)
            .join(' · ')}
        </p>
      )}
      {p.missed.length > 0 && (
        <p className="text-sm text-gray-600">
          Personne n’a pensé à : {p.missed.join(', ')}
          {p.missedCount > p.missed.length && ` … (+ ${p.missedCount - p.missed.length})`}
        </p>
      )}
    </div>
  );
}
