import { BLUFF_FOOL_MAX_SHARE, BLUFF_FOOL_SHARE, BLUFF_MAX_LENGTH } from '@lbq/shared';
import { VOTE_TIMES, type DraftQuestion } from './draft';

type FieldProps = {
  q: DraftQuestion;
  err: (path: string) => string | undefined;
  onChange: (q: DraftQuestion) => void;
};

const inputClass = (invalid: boolean) =>
  `rounded-lg border-2 px-3 py-2 font-bold outline-none focus:border-brand ${invalid ? 'border-answer-red' : 'border-gray-300'}`;

/** « Mytho ! »: the real answer (surprising, ideally) and the voting time. */
export function BluffFields({ q, err, onChange }: FieldProps) {
  const truthErr = err('.truth');
  const fool = Math.round(q.basePoints * BLUFF_FOOL_SHARE);
  const foolMax = Math.round(q.basePoints * BLUFF_FOOL_MAX_SHARE);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-gray-500">
        Chaque joueur invente d’abord une fausse réponse crédible, puis tout le monde vote pour
        celle qu’il croit vraie parmi les mythos et la vraie réponse. Trouver la vérité :{' '}
        {q.basePoints} pts ; chaque joueur piégé par ton mytho : {fool} pts (maximum {foolMax} pts).
      </p>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-bold text-gray-600">La vraie réponse</span>
        <input
          value={q.truth}
          maxLength={BLUFF_MAX_LENGTH}
          onChange={(e) => onChange({ ...q, truth: e.target.value })}
          placeholder="Ex. : Vincent"
          className={inputClass(!!truthErr)}
        />
        {truthErr && <span className="text-sm font-semibold text-answer-red">{truthErr}</span>}
        <span className="text-xs text-gray-500">
          Les mythos trop proches de cette réponse (fautes de frappe comprises) sont refusés.
        </span>
      </label>
      <label className="flex flex-col gap-1 self-start">
        <span className="text-sm font-bold text-gray-600">Temps pour voter</span>
        <select
          value={q.voteTimeSec}
          onChange={(e) => onChange({ ...q, voteTimeSec: Number(e.target.value) })}
          className="rounded-lg border-2 border-gray-300 bg-white px-3 py-2 font-semibold outline-none focus:border-brand"
        >
          {[...new Set([...VOTE_TIMES, q.voteTimeSec])]
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
