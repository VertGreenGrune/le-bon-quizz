import {
  COLOR_SHAPES,
  COLORS_MAX_CELLS,
  COLORS_MAX_MEMO_SEC,
  COLORS_MIN_CELLS,
  COLORS_MIN_MEMO_SEC,
  generatedBoard,
} from '@lbq/shared';
import { ColorBoardView } from '../components/ColorBoard';
import type { DraftQuestion } from './draft';
import { PaintBucketZones } from './PaintBucketZones';

type FieldProps = {
  q: DraftQuestion;
  err: (path: string) => string | undefined;
  onChange: (q: DraftQuestion) => void;
};

const MEMO_TIMES = [5, 10, 15, 20, 30, 45, 60] as const;

function FieldError({ message }: { message?: string }) {
  return message ? <span className="text-sm font-semibold text-answer-red">{message}</span> : null;
}

/** Preview colors of the generated board (the real ones are drawn at random in each game). */
const SAMPLE = [0, 4, 2, 3, 5, 1, 6, 7, 4, 0, 3, 2];

/**
 * « Couleurs perdues » (T58): a generated board (n shapes, random colors in each game) or zones
 * placed on the picture, each with the color it has there; the time to memorize.
 */
export function ColorsFields({ q, err, onChange }: FieldProps) {
  const picture = q.colorSource === 'picture';
  const sample = generatedBoard(
    Array.from({ length: q.colorCells }, (_, i) => COLOR_SHAPES[i % COLOR_SHAPES.length]!),
  );
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-gray-500">
        L’écran montre le tableau en couleurs pendant le temps de mémorisation, puis sans ses
        couleurs : les joueurs les remettent sur leur téléphone, avec seulement les couleurs du
        tableau. Chaque zone juste rapporte une partie des points (plus c’est rapide, plus ça
        rapporte) ; tout juste = bonne réponse. Les téléphones ne voient jamais les couleurs avant
        la réponse.
      </p>
      <div className="flex flex-wrap items-end gap-4">
        <fieldset className="flex gap-2">
          <legend className="mb-1 text-sm font-bold text-gray-600">Tableau</legend>
          {(
            [
              ['generated', '🔷 Formes au hasard'],
              ['picture', '🎨 Zones sur une image'],
            ] as const
          ).map(([source, label]) => (
            <button
              key={source}
              type="button"
              aria-pressed={q.colorSource === source}
              onClick={() => onChange({ ...q, colorSource: source })}
              className={`rounded-lg border-2 px-3 py-2 font-bold ${
                q.colorSource === source
                  ? 'border-brand bg-brand text-white'
                  : 'border-gray-300 bg-white'
              }`}
            >
              {label}
            </button>
          ))}
        </fieldset>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold text-gray-600">Temps pour mémoriser</span>
          <select
            value={q.memoSec}
            onChange={(e) => onChange({ ...q, memoSec: Number(e.target.value) })}
            className="rounded-lg border-2 border-gray-300 px-3 py-2 font-bold"
            aria-label="Temps pour mémoriser"
          >
            {[...new Set([...MEMO_TIMES, q.memoSec])]
              .filter((s) => s >= COLORS_MIN_MEMO_SEC && s <= COLORS_MAX_MEMO_SEC)
              .sort((a, b) => a - b)
              .map((s) => (
                <option key={s} value={s}>
                  {s} secondes
                </option>
              ))}
          </select>
        </label>
      </div>
      <FieldError message={err('.memoSec')} />

      {picture ? (
        <PaintBucketZones q={q} err={err} onChange={onChange} />
      ) : (
        <div className="flex flex-col gap-2">
          <label className="flex max-w-md items-center gap-3 font-semibold">
            Nombre de formes
            <input
              type="range"
              min={COLORS_MIN_CELLS}
              max={COLORS_MAX_CELLS}
              value={q.colorCells}
              onChange={(e) => onChange({ ...q, colorCells: Number(e.target.value) })}
              aria-label="Nombre de formes"
              className="min-w-0 flex-1 accent-brand"
            />
            <span className="w-8 text-right tabular-nums">{q.colorCells}</span>
          </label>
          <p className="text-sm text-gray-500">
            Exemple (formes et couleurs tirées au hasard à chaque partie) :
          </p>
          <div className="w-64">
            <ColorBoardView board={sample} colors={SAMPLE} colored numbers={false} />
          </div>
          <FieldError message={err('.cells')} />
        </div>
      )}
    </div>
  );
}
