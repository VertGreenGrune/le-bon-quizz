import {
  POTATO_CHOICE_MAX_LENGTH,
  POTATO_MAX_CHOICES,
  POTATO_MAX_FUSE_SEC,
  POTATO_MAX_QUESTIONS,
  POTATO_MIN_CHOICES,
  POTATO_MIN_FUSE_SEC,
  POTATO_MIN_QUESTIONS,
  POTATO_TEXT_MAX_LENGTH,
  SHAPES,
  potatoPassPoints,
  potatoSurvivorPoints,
} from '@lbq/shared';
import { ShapeIcon, shapeBg } from '../components/shapes';
import type { DraftQuestion } from './draft';
import {
  addSub,
  addSubChoice,
  removeSub,
  removeSubChoice,
  setFuse,
  setSubChoice,
  updateSub,
} from './potatoDraft';

type FieldProps = {
  q: DraftQuestion;
  err: (path: string) => string | undefined;
  onChange: (q: DraftQuestion) => void;
};

const FUSES = [10, 15, 20, 30, 45, 60, 75, 90, 120, 180] as const;

const selectClass =
  'rounded-lg border-2 border-gray-300 bg-white px-3 py-2 font-semibold outline-none focus:border-brand';

function FuseSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (sec: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-bold text-gray-600">{label}</span>
      <select
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className={selectClass}
      >
        {[...new Set([...FUSES, value])]
          .filter((s) => s >= POTATO_MIN_FUSE_SEC && s <= POTATO_MAX_FUSE_SEC)
          .sort((a, b) => a - b)
          .map((s) => (
            <option key={s} value={s}>
              {s} secondes
            </option>
          ))}
      </select>
    </label>
  );
}

/**
 * « Patate chaude » (T63): the quick sub-questions (2–4 choices, one right) and the fuse range.
 */
export function PotatoFields({ q, err, onChange }: FieldProps) {
  const listErr = err('.potato.questions') ?? err('.potato');
  const fuseErr = err('.potato.fuseMaxSec') ?? err('.potato.fuseMinSec');
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-gray-500">
        Une bombe passe de joueur en joueur. Celui qui l’a voit une petite question sur son
        téléphone (et sur l’écran) : bonne réponse = la bombe part chez un autre (+
        {potatoPassPoints(q.basePoints)} pts), mauvaise = une autre question après 2 s. Quand la
        mèche arrive au bout (durée tirée au hasard, secrète), celui qui tient la bombe perd la
        manche ; les autres gagnent {potatoSurvivorPoints(q.basePoints)} pts. Des questions courtes
        et rapides, posées dans l’ordre puis mélangées.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <FuseSelect
          label="Mèche : au moins"
          value={q.fuseMinSec}
          onChange={(sec) => onChange(setFuse(q, 'min', sec))}
        />
        <FuseSelect
          label="Mèche : au plus"
          value={q.fuseMaxSec}
          onChange={(sec) => onChange(setFuse(q, 'max', sec))}
        />
        {fuseErr && <span className="text-sm font-semibold text-answer-red">{fuseErr}</span>}
      </div>
      <span className="flex justify-between text-sm font-bold text-gray-600">
        Petites questions — coche la bonne réponse
        <span className="font-normal text-gray-400">
          {q.potatoQuestions.length} / {POTATO_MAX_QUESTIONS}
        </span>
      </span>
      <ol className="flex flex-col gap-3" data-testid="potato-subs">
        {q.potatoQuestions.map((sub, i) => {
          const textErr = err(`.potato.questions.${i}.text`);
          const choiceErr =
            err(`.potato.questions.${i}.choices`) ??
            sub.choices.map((_, k) => err(`.potato.questions.${i}.choices.${k}`)).find(Boolean) ??
            err(`.potato.questions.${i}.correct`) ??
            err(`.potato.questions.${i}`);
          return (
            <li key={i} className="flex flex-col gap-2 rounded-xl border-2 border-gray-200 p-3">
              <div className="flex items-center gap-2">
                <span className="w-7 shrink-0 text-center font-black text-gray-400">{i + 1}</span>
                <input
                  value={sub.text}
                  maxLength={POTATO_TEXT_MAX_LENGTH}
                  onChange={(e) => onChange(updateSub(q, i, { text: e.target.value }))}
                  placeholder="Ex. : Combien de pattes a une araignée ?"
                  aria-label={`Petite question ${i + 1}`}
                  aria-invalid={!!textErr}
                  className={`min-w-0 flex-1 rounded-lg border-2 px-3 py-2 font-bold outline-none focus:border-brand ${textErr ? 'border-answer-red' : 'border-gray-300'}`}
                />
                {q.potatoQuestions.length > POTATO_MIN_QUESTIONS && (
                  <button
                    type="button"
                    aria-label={`Retirer la petite question ${i + 1}`}
                    onClick={() => onChange(removeSub(q, i))}
                    className="shrink-0 rounded px-2 text-lg font-bold text-gray-400 hover:text-answer-red"
                  >
                    ✕
                  </button>
                )}
              </div>
              <div className="grid gap-2 pl-9 sm:grid-cols-2">
                {sub.choices.map((choice, k) => {
                  const shape = SHAPES[k]!;
                  const right = sub.correct === k;
                  return (
                    <div
                      key={k}
                      className={`flex items-center gap-2 rounded-lg p-1.5 text-white ${shapeBg[shape.color]}`}
                    >
                      <ShapeIcon shape={shape.shape} className="size-5 shrink-0 fill-white" />
                      <input
                        value={choice}
                        maxLength={POTATO_CHOICE_MAX_LENGTH}
                        onChange={(e) => onChange(setSubChoice(q, i, k, e.target.value))}
                        placeholder={`Réponse ${k + 1}`}
                        aria-label={`Petite question ${i + 1}, réponse ${k + 1}`}
                        className="min-w-0 flex-1 rounded bg-white/15 px-2 py-1 text-sm font-bold text-white outline-none placeholder:text-white/70 focus:bg-white/25"
                      />
                      <button
                        type="button"
                        role="radio"
                        aria-checked={right}
                        aria-label={`Petite question ${i + 1}, réponse ${k + 1} correcte`}
                        title={right ? 'Bonne réponse' : 'Marquer comme bonne réponse'}
                        onClick={() => onChange(updateSub(q, i, { correct: k }))}
                        className={`flex size-7 shrink-0 items-center justify-center rounded-full border-[3px] border-white text-sm font-black ${right ? 'bg-white text-answer-green' : 'text-transparent hover:bg-white/20'}`}
                      >
                        ✓
                      </button>
                      {sub.choices.length > POTATO_MIN_CHOICES && (
                        <button
                          type="button"
                          aria-label={`Retirer la réponse ${k + 1} de la petite question ${i + 1}`}
                          onClick={() => onChange(removeSubChoice(q, i, k))}
                          className="shrink-0 px-1 font-bold opacity-80 hover:opacity-100"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  );
                })}
                {sub.choices.length < POTATO_MAX_CHOICES && (
                  <button
                    type="button"
                    onClick={() => onChange(addSubChoice(q, i))}
                    className="justify-self-start rounded-lg px-2 py-1 text-sm font-bold text-brand hover:bg-brand/10"
                  >
                    + Réponse
                  </button>
                )}
              </div>
              {(textErr || choiceErr) && (
                <span className="pl-9 text-sm font-semibold text-answer-red">
                  {textErr ? 'Écris la question' : 'Remplis toutes les réponses'}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {listErr && (
        <span className="text-sm font-semibold text-answer-red">
          Il faut entre {POTATO_MIN_QUESTIONS} et {POTATO_MAX_QUESTIONS} petites questions
        </span>
      )}
      {q.potatoQuestions.length < POTATO_MAX_QUESTIONS && (
        <button
          type="button"
          onClick={() => onChange(addSub(q))}
          className="self-start rounded-lg border-2 border-dashed border-gray-300 px-3 py-2 font-bold text-gray-600 hover:border-brand hover:text-brand"
        >
          + Ajouter une petite question
        </button>
      )}
    </div>
  );
}
