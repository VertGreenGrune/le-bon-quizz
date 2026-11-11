import type { GameQuestionReport } from '@lbq/shared';
import { Avatar } from '../components/Avatar';
import { WavelengthScale } from '../components/WavelengthScale';
import { closestNeedles } from '../lib/wavelength';

/**
 * « Sur la même longueur d'onde » (T62) in the report: the scale, the target, the psychic and
 * their clue, every needle (closest first) with its points.
 */
export function WavelengthDetails({ q }: { q: GameQuestionReport }) {
  const w = q.details.wavelength;
  if (!w) return <p className="text-sm text-gray-500 italic">Détail indisponible</p>;
  const best = new Set(closestNeedles(w));
  return (
    <div className="flex flex-col gap-2 text-sm" data-testid="wavelength-report">
      <p className="font-bold">
        {w.psychic && <Avatar id={w.psychic.avatar} size="xs" className="mr-1 align-middle" />}
        {w.psychic?.nickname ?? 'Le médium'}{' '}
        {w.clue === null ? (
          <span className="font-normal text-gray-500 italic">n’a pas donné d’indice</span>
        ) : (
          <>
            : « {w.clue} »{' '}
            <span className="font-normal text-gray-500">· + {w.psychicPoints} pts (moyenne)</span>
          </>
        )}
      </p>
      <div className="rounded-xl bg-brand px-4 py-3 text-white">
        <WavelengthScale
          spectrum={w.spectrum}
          target={w.target}
          needles={w.needles.map((n) => ({ ...n, best: best.has(n.id) }))}
          size="small"
        />
      </div>
      <ul className="flex flex-col gap-1">
        {w.needles.map((n) => (
          <li key={n.id} className="flex items-center gap-2">
            <Avatar id={n.avatar} size="xs" />
            <span className="font-semibold">{n.nickname}</span>
            <span className="text-gray-500 tabular-nums">
              {n.value} (écart {Math.abs(n.value - w.target)})
            </span>
            <span className="ml-auto font-bold tabular-nums">+ {n.points} pts</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
