import {
  WAGER_MAX_BET_SEC,
  WAGER_MIN_BET_SEC,
  wagerAuthorPoints,
  wagerBetPoints,
} from '@lbq/shared';
import type { DraftQuestion } from './draft';

type FieldProps = {
  q: DraftQuestion;
  err: (path: string) => string | undefined;
  onChange: (q: DraftQuestion) => void;
};

const inputClass = (invalid: boolean) =>
  `rounded-lg border-2 px-3 py-2 font-bold outline-none focus:border-brand ${invalid ? 'border-answer-red' : 'border-gray-300'}`;

const BET_TIMES = [10, 15, 20, 30, 45, 60] as const;

/** « Paris sur les réponses » (T61): the right number, its unit and the betting time. */
export function WagerFields({ q, err, onChange }: FieldProps) {
  const correctErr = err('.wager.correct') ?? err('.wager');
  const unitErr = err('.wager.unit');
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-gray-500">
        Chaque joueur estime d’abord un nombre, puis tout le monde parie sur l’estimation la plus
        proche de la bonne réponse <strong>sans la dépasser</strong> (ou sur « Plus petit que tout
        »). Pari gagnant : {q.basePoints} pts ({wagerBetPoints(q.basePoints, true)} pts sur la plus
        petite ou la plus grande case) ; auteur de l’estimation gagnante :{' '}
        {wagerAuthorPoints(q.basePoints)} pts.
      </p>
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold text-gray-600">La bonne réponse</span>
          <input
            type="number"
            step="any"
            value={Number.isNaN(q.wagerCorrect) ? '' : q.wagerCorrect}
            onChange={(e) =>
              onChange({
                ...q,
                wagerCorrect: e.target.value === '' ? Number.NaN : Number(e.target.value),
              })
            }
            placeholder="Ex. : 1789"
            aria-label="La bonne réponse"
            className={`w-44 ${inputClass(!!correctErr)}`}
          />
          {correctErr && (
            <span className="text-sm font-semibold text-answer-red">
              {Number.isNaN(q.wagerCorrect) ? 'Indique la bonne réponse' : correctErr}
            </span>
          )}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold text-gray-600">Unité (facultative)</span>
          <input
            value={q.wagerUnit}
            maxLength={10}
            onChange={(e) => onChange({ ...q, wagerUnit: e.target.value })}
            placeholder="Ex. : km"
            className={`w-32 ${inputClass(!!unitErr)}`}
          />
          {unitErr && <span className="text-sm font-semibold text-answer-red">{unitErr}</span>}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold text-gray-600">Temps pour parier</span>
          <select
            value={q.betTimeSec}
            onChange={(e) => onChange({ ...q, betTimeSec: Number(e.target.value) })}
            className="rounded-lg border-2 border-gray-300 bg-white px-3 py-2 font-semibold outline-none focus:border-brand"
          >
            {[...new Set([...BET_TIMES, q.betTimeSec])]
              .filter((s) => s >= WAGER_MIN_BET_SEC && s <= WAGER_MAX_BET_SEC)
              .sort((a, b) => a - b)
              .map((s) => (
                <option key={s} value={s}>
                  {s} secondes
                </option>
              ))}
          </select>
        </label>
      </div>
    </div>
  );
}
