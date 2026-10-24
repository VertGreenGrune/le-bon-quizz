import type { GameQuestionReport } from '@lbq/shared';
import { Avatar } from '../components/Avatar';

/** Report of a « Mytho ! »: every lie with its authors and the players it fooled, then the truth. */
export function BluffDetails({ q, noAnswer }: { q: GameQuestionReport; noAnswer: number }) {
  const bluff = q.details.bluff;
  if (!bluff) return <p className="text-sm text-gray-500 italic">Détail indisponible</p>;
  const max = Math.max(1, ...bluff.options.map((o) => o.voters.length));
  return (
    <>
      <ul className="flex flex-col gap-1.5 text-sm" data-testid="bluff-report">
        {bluff.options.map((o) => (
          <li key={o.text} className="flex items-center gap-2">
            <span
              className={`w-40 shrink-0 truncate font-bold sm:w-56 ${o.truth ? 'text-answer-green' : ''}`}
              title={o.text}
            >
              {o.truth ? '✓ ' : '🤥 '}
              {o.text}
            </span>
            <span
              className="h-5 rounded bg-brand/70"
              style={{ width: `${(o.voters.length / max) * 30}%` }}
            />
            <span className="shrink-0 tabular-nums">{o.voters.length}</span>
            <span className="flex min-w-0 items-center gap-1 truncate text-gray-500">
              {o.truth ? (
                'la vérité'
              ) : (
                <>
                  de
                  {o.authors.map((a) => (
                    <span key={a.id} className="flex items-center gap-1">
                      <Avatar id={a.avatar} size="xs" />
                      {a.nickname}
                    </span>
                  ))}
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
      {noAnswer > 0 && <p className="mt-2 text-sm text-gray-500 italic">{noAnswer} sans vote</p>}
    </>
  );
}
