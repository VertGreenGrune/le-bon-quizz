import {
  WAVELENGTH_BANDS,
  WAVELENGTH_END_MAX_LENGTH,
  WAVELENGTH_MAX_CLUE_SEC,
  WAVELENGTH_MAX_SPECTRA,
  WAVELENGTH_MIN_CLUE_SEC,
  WAVELENGTH_SPECTRA,
  wavelengthPoints,
} from '@lbq/shared';
import { parseSpectrumLine } from '../lib/wavelength';
import type { DraftQuestion } from './draft';

type FieldProps = {
  q: DraftQuestion;
  err: (path: string) => string | undefined;
  onChange: (q: DraftQuestion) => void;
};

const CLUE_TIMES = [15, 20, 30, 45, 60, 90] as const;

/** « Sur la même longueur d'onde » (T62): the scales (one per line) and the time for the clue. */
export function WavelengthFields({ q, err, onChange }: FieldProps) {
  const lines = q.spectraLines.filter((l) => l.trim());
  const badLine = q.spectraLines.find((l) => {
    if (!l.trim()) return false;
    const s = parseSpectrumLine(l);
    return (
      !s.left ||
      !s.right ||
      s.left.length > WAVELENGTH_END_MAX_LENGTH ||
      s.right.length > WAVELENGTH_END_MAX_LENGTH
    );
  });
  const errors = [
    err('.spectraLines'),
    ...q.spectraLines.flatMap((l, i) =>
      [err(`.spectraLines.${i}.left`), err(`.spectraLines.${i}.right`), err(`.spectraLines.${i}`)]
        .filter(Boolean)
        .map((e) => `« ${l.trim() || '…'} » : ${e}`),
    ),
  ].filter(Boolean);
  const [b0, b1, b2] = WAVELENGTH_BANDS;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-gray-500">
        Un joueur (chacun son tour) voit une position secrète sur une échelle entre deux mots et
        tape un indice ; les autres placent une aiguille sur l’échelle. À ± {b0.distance} :{' '}
        {wavelengthPoints(q.basePoints, 0)} pts, ± {b1.distance} :{' '}
        {wavelengthPoints(q.basePoints, b1.distance)} pts, ± {b2.distance} :{' '}
        {wavelengthPoints(q.basePoints, b2.distance)} pts. Le médium gagne la moyenne des points des
        autres. L’indice ne doit pas reprendre les mots de l’échelle.
      </p>
      <label className="flex flex-col gap-1">
        <span className="flex justify-between text-sm font-bold text-gray-600">
          Échelles (une par ligne, « Gauche / Droite », une est tirée au hasard)
          <span className="font-normal text-gray-400">
            {lines.length} / {WAVELENGTH_MAX_SPECTRA}
          </span>
        </span>
        <textarea
          value={q.spectraLines.join('\n')}
          rows={4}
          onChange={(e) => onChange({ ...q, spectraLines: e.target.value.split('\n') })}
          placeholder={
            'Ex. :\nFroid / Chaud\nFilm nul / Chef-d’œuvre\nPour les enfants / Pour les adultes'
          }
          aria-label="Échelles"
          aria-invalid={errors.length > 0}
          className={`resize-y rounded-lg border-2 px-3 py-2 font-bold outline-none focus:border-brand ${errors.length > 0 || badLine ? 'border-answer-red' : 'border-gray-300'}`}
        />
        {badLine && (
          <span className="text-sm font-semibold text-answer-red">
            « {badLine.trim()} » : écris deux mots séparés par « / » ({WAVELENGTH_END_MAX_LENGTH}{' '}
            caractères au maximum chacun).
          </span>
        )}
        {errors.map((e) => (
          <span key={e} className="text-sm font-semibold text-answer-red">
            {e}
          </span>
        ))}
        <span className="text-xs text-gray-500">
          {lines.length === 0
            ? `Aucune échelle : une échelle sera tirée de la liste intégrée (${WAVELENGTH_SPECTRA.length} échelles, sans répétition dans une partie).`
            : 'La cible est tirée au hasard entre 10 et 90.'}
        </span>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-bold text-gray-600">Temps pour l’indice</span>
        <select
          value={q.clueTimeSec}
          onChange={(e) => onChange({ ...q, clueTimeSec: Number(e.target.value) })}
          className="w-44 rounded-lg border-2 border-gray-300 bg-white px-3 py-2 font-semibold outline-none focus:border-brand"
        >
          {[...new Set([...CLUE_TIMES, q.clueTimeSec])]
            .filter((s) => s >= WAVELENGTH_MIN_CLUE_SEC && s <= WAVELENGTH_MAX_CLUE_SEC)
            .sort((a, b) => a - b)
            .map((s) => (
              <option key={s} value={s}>
                {s} secondes
              </option>
            ))}
        </select>
      </label>
    </div>
  );
}
