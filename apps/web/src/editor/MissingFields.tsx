import { useState } from 'react';
import {
  MISSING_MAX_MEMO_SEC,
  MISSING_MIN_MEMO_SEC,
  PIN_MAX_RADIUS,
  PIN_MIN_RADIUS,
} from '@lbq/shared';
import { PinMarker, PinPicture, PinZoneMark } from '../components/PinPicture';
import { ImageField } from './ImageField';
import type { DraftQuestion } from './draft';

/**
 * « Qu'est-ce qui a disparu ? » (T59): the picture « après » (the picture « avant » is the usual
 * picture field), the time to memorize, and the zone where the element was — placed on « avant »,
 * checked with an avant / après toggle.
 */
type FieldProps = {
  q: DraftQuestion;
  err: (path: string) => string | undefined;
  onChange: (q: DraftQuestion) => void;
};

const MEMO_TIMES = [5, 10, 15, 20, 30, 45, 60] as const;
const RADIUS_STEP = 0.01;

function FieldError({ message }: { message?: string }) {
  return message ? <span className="text-sm font-semibold text-answer-red">{message}</span> : null;
}

export function MissingFields({ q, err, onChange }: FieldProps) {
  const [shown, setShown] = useState<'avant' | 'apres'>('avant');
  const { zone } = q;
  const src = shown === 'apres' && q.missingImageUrl ? q.missingImageUrl : q.imageUrl;
  return (
    <div className="flex flex-col gap-3" data-testid="missing-fields">
      <p className="text-sm text-gray-500">
        Mets ci-dessus l’image <b>« avant »</b> (complète) et ici la même image <b>« après »</b>,
        avec un élément effacé (dans n’importe quel logiciel de retouche). L’écran montre « avant »
        pendant le temps pour mémoriser, puis « après » : les joueurs touchent l’endroit où se
        trouvait l’élément.
      </p>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex flex-col gap-1">
          <ImageField
            label="Image « après » (sans l’élément, même taille)"
            value={q.missingImageUrl}
            onChange={(missingImageUrl) => onChange({ ...q, missingImageUrl })}
          />
          <FieldError message={err('.missingImageUrl')} />
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold text-gray-600">Temps pour mémoriser</span>
          <select
            value={q.memoSec}
            onChange={(e) => onChange({ ...q, memoSec: Number(e.target.value) })}
            className="rounded-lg border-2 border-gray-300 px-3 py-2 font-bold"
            aria-label="Temps pour mémoriser"
          >
            {[...new Set([...MEMO_TIMES, q.memoSec])]
              .filter((s) => s >= MISSING_MIN_MEMO_SEC && s <= MISSING_MAX_MEMO_SEC)
              .sort((a, b) => a - b)
              .map((s) => (
                <option key={s} value={s}>
                  {s} secondes
                </option>
              ))}
          </select>
          <FieldError message={err('.memoSec')} />
        </label>
      </div>

      <span className="text-sm font-bold text-gray-600">
        Zone de l’élément disparu{' '}
        <span className="font-normal text-gray-400">
          — dans la zone = tous les points, juste à côté = une partie
        </span>
      </span>
      {q.imageUrl ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">Clique sur l’image pour placer la zone.</p>
            <div className="ml-auto flex overflow-hidden rounded-lg border-2 border-gray-300 text-sm font-bold">
              {(['avant', 'apres'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  disabled={v === 'apres' && !q.missingImageUrl}
                  onClick={() => setShown(v)}
                  aria-pressed={shown === v}
                  className={`px-3 py-1 disabled:opacity-40 ${shown === v ? 'bg-brand text-white' : 'bg-white'}`}
                >
                  {v === 'avant' ? 'Avant' : 'Après'}
                </button>
              ))}
            </div>
          </div>
          <div className="self-start overflow-hidden rounded-lg border-2 border-gray-200 bg-gray-50">
            <PinPicture
              src={src!}
              imgClassName="max-h-96 max-w-full"
              onPick={(point) => onChange({ ...q, zone: { ...zone, ...point } })}
            >
              <PinZoneMark zone={zone} />
              <PinMarker point={zone} className="size-3 rounded-full bg-white shadow" />
            </PinPicture>
          </div>
          <label className="flex max-w-md items-center gap-3 font-semibold">
            Taille de la zone
            <input
              type="range"
              min={PIN_MIN_RADIUS}
              max={PIN_MAX_RADIUS}
              step={RADIUS_STEP}
              value={zone.radius}
              onChange={(e) =>
                onChange({ ...q, zone: { ...zone, radius: Number(e.target.value) } })
              }
              aria-label="Taille de la zone"
              className="min-w-0 flex-1 accent-brand"
            />
            <span className="w-12 text-right tabular-nums">{Math.round(zone.radius * 100)} %</span>
          </label>
        </>
      ) : (
        <p className="rounded-lg bg-answer-yellow/20 px-3 py-2 font-semibold">
          Ajoute l’image « avant » ci-dessus pour placer la zone.
        </p>
      )}
      <FieldError message={err('.imageUrl') ?? err('.zone') ?? err('.zone.x') ?? err('.zone.y')} />
    </div>
  );
}
