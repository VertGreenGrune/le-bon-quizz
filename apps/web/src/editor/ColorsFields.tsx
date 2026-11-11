import {
  COLOR_PALETTE,
  COLOR_SHAPES,
  COLORS_MAX_CELLS,
  COLORS_MAX_MEMO_SEC,
  COLORS_MAX_RADIUS,
  COLORS_MAX_ZONES,
  COLORS_MIN_CELLS,
  COLORS_MIN_MEMO_SEC,
  COLORS_MIN_RADIUS,
  COLORS_MIN_ZONES,
  generatedBoard,
} from '@lbq/shared';
import { ColorBoardView } from '../components/ColorBoard';
import { PinPicture } from '../components/PinPicture';
import { colorHex } from '../lib/colors';
import { btn } from './EditorShell';
import { addColorZone, removeColorZone, updateColorZone, type DraftQuestion } from './draft';

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
        L’écran montre le tableau en couleurs pendant le temps de mémorisation, puis en gris : les
        joueurs remettent les couleurs sur leur téléphone (palette de 8 couleurs). Chaque zone juste
        rapporte une partie des points (plus c’est rapide, plus ça rapporte) ; tout juste = bonne
        réponse. Les téléphones ne voient jamais les couleurs avant la réponse.
      </p>
      <div className="flex flex-wrap items-end gap-4">
        <fieldset className="flex gap-2">
          <legend className="mb-1 text-sm font-bold text-gray-600">Tableau</legend>
          {(
            [
              ['generated', '🔷 Formes au hasard'],
              ['picture', '🖼️ Zones sur une image'],
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
        <PictureZones q={q} err={err} onChange={onChange} />
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

function PictureZones({ q, err, onChange }: FieldProps) {
  const zones = q.colorZones;
  const full = zones.length >= COLORS_MAX_ZONES;
  if (!q.imageUrl)
    return (
      <div className="flex flex-col gap-1">
        <p className="rounded-lg bg-answer-yellow/20 px-3 py-2 font-semibold">
          Ajoute une image ci-dessus (un tableau, une affiche, une photo colorée…) pour placer les
          zones.
        </p>
        <FieldError message={err('.imageUrl')} />
      </div>
    );
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold">
        Clique sur l’image pour ajouter une zone ({zones.length} / {COLORS_MAX_ZONES}, au moins{' '}
        {COLORS_MIN_ZONES}), puis choisis la couleur qu’elle a sur l’image.
      </p>
      <div className="self-start overflow-hidden rounded-lg border-2 border-gray-200 bg-gray-50">
        <PinPicture
          src={q.imageUrl}
          imgClassName="max-h-96 max-w-full"
          onPick={full ? undefined : (p) => onChange(addColorZone(q, p.x, p.y))}
        >
          {zones.map((z, i) => (
            <span
              key={i}
              aria-hidden="true"
              className="pointer-events-none absolute flex aspect-square -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[3px] border-white font-black text-white shadow-[0_0_0_2px_rgba(0,0,0,0.6)] [text-shadow:0_0_3px_#000]"
              style={{
                left: `${z.x * 100}%`,
                top: `${z.y * 100}%`,
                width: `${z.radius * 200}%`,
                backgroundColor: `${colorHex(z.color)}aa`,
              }}
            >
              {i + 1}
            </span>
          ))}
        </PinPicture>
      </div>
      <ol className="flex flex-col gap-2">
        {zones.map((z, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 p-2">
            <span className="w-6 text-center font-black">{i + 1}</span>
            <span
              className="flex gap-1"
              role="radiogroup"
              aria-label={`Couleur de la zone ${i + 1}`}
            >
              {COLOR_PALETTE.map((c, ci) => (
                <button
                  key={c.name}
                  type="button"
                  role="radio"
                  aria-checked={z.color === ci}
                  title={c.name}
                  aria-label={c.name}
                  onClick={() => onChange(updateColorZone(q, i, { color: ci }))}
                  className={`size-7 rounded-full border-2 ${z.color === ci ? 'border-black ring-2 ring-brand' : 'border-white'}`}
                  style={{ backgroundColor: c.hex }}
                />
              ))}
            </span>
            <label className="flex items-center gap-2 text-sm font-semibold">
              Taille
              <input
                type="range"
                min={COLORS_MIN_RADIUS}
                max={COLORS_MAX_RADIUS}
                step={0.01}
                value={z.radius}
                onChange={(e) =>
                  onChange(updateColorZone(q, i, { radius: Number(e.target.value) }))
                }
                aria-label={`Taille de la zone ${i + 1}`}
                className="w-28 accent-brand"
              />
            </label>
            <button
              type="button"
              className={`${btn.ghost} ml-auto`}
              onClick={() => onChange(removeColorZone(q, i))}
              aria-label={`Supprimer la zone ${i + 1}`}
            >
              ✕
            </button>
          </li>
        ))}
      </ol>
      <FieldError message={err('.zones') ?? err('.imageUrl')} />
    </div>
  );
}
