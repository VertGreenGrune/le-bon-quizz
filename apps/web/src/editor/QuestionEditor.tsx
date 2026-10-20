import { SHAPES, type Question } from '@lbq/shared';
import type { FieldErrors } from '../api/validation';
import { ShapeIcon, shapeBg } from '../components/shapes';
import { btn } from './EditorShell';
import { ImageField } from './ImageField';
import {
  MAX_CHOICES,
  MIN_CHOICES,
  POINTS_OPTIONS,
  TIME_LIMITS,
  addChoice,
  duplicateQuestion,
  moveQuestion,
  removeChoice,
  removeQuestion,
  setQuestionType,
  toggleCorrect,
  updateChoice,
  type QuizDraft,
} from './draft';

const selectClass =
  'rounded-lg border-2 border-gray-300 bg-white px-3 py-2 font-semibold outline-none focus:border-brand';

export function QuestionEditor({
  index,
  total,
  question: q,
  errors,
  onChange,
  onDraftChange,
}: {
  index: number;
  total: number;
  question: Question;
  errors: FieldErrors;
  onChange: (q: Question) => void;
  /** Structural changes (move / duplicate / delete), then select question `nextIndex`. */
  onDraftChange: (fn: (d: QuizDraft) => QuizDraft, nextIndex: number) => void;
}) {
  const err = (path: string) => errors[`questions.${index}${path}`];
  const isTF = q.type === 'TRUE_FALSE';

  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-black">
          Question {index + 1} <span className="font-semibold text-gray-400">/ {total}</span>
        </h2>
        <button
          type="button"
          className={btn.ghost}
          disabled={index === 0}
          title="Monter"
          onClick={() => onDraftChange((d) => moveQuestion(d, index, index - 1), index - 1)}
        >
          ↑
        </button>
        <button
          type="button"
          className={btn.ghost}
          disabled={index === total - 1}
          title="Descendre"
          onClick={() => onDraftChange((d) => moveQuestion(d, index, index + 1), index + 1)}
        >
          ↓
        </button>
        <button
          type="button"
          className={btn.ghost}
          disabled={total >= 100}
          onClick={() => onDraftChange((d) => duplicateQuestion(d, index), index + 1)}
        >
          Dupliquer
        </button>
        <button
          type="button"
          className={btn.danger}
          onClick={() => {
            if (confirm('Supprimer cette question ?')) {
              onDraftChange((d) => removeQuestion(d, index), Math.max(0, index - 1));
            }
          }}
        >
          Supprimer
        </button>
      </div>

      <div
        className="flex gap-1 self-start rounded-lg bg-gray-100 p-1"
        role="radiogroup"
        aria-label="Type"
      >
        {(
          [
            ['MCQ', 'Choix multiple'],
            ['TRUE_FALSE', 'Vrai ou faux'],
          ] as const
        ).map(([type, label]) => (
          <button
            key={type}
            type="button"
            role="radio"
            aria-checked={q.type === type}
            onClick={() => onChange(setQuestionType(q, type))}
            className={`rounded-md px-3 py-1 text-sm font-bold ${q.type === type ? 'bg-white text-brand shadow-sm' : 'text-gray-500'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <label className="flex flex-col gap-1">
        <span className="flex justify-between text-sm font-bold text-gray-600">
          Question <span className="font-normal text-gray-400">{q.text.length} / 120</span>
        </span>
        <textarea
          value={q.text}
          maxLength={120}
          rows={2}
          autoFocus={!q.text}
          placeholder="Écris ta question…"
          onChange={(e) => onChange({ ...q, text: e.target.value })}
          aria-invalid={!!err('.text')}
          className={`resize-none rounded-lg border-2 px-3 py-2 text-center text-xl font-bold outline-none focus:border-brand ${err('.text') ? 'border-answer-red' : 'border-gray-300'}`}
        />
        {err('.text') && (
          <span className="text-sm font-semibold text-answer-red">{err('.text')}</span>
        )}
      </label>

      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <ImageField
          label="Image (facultative)"
          value={q.imageUrl}
          onChange={(imageUrl) => onChange({ ...q, imageUrl })}
        />
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-bold text-gray-600">Temps</span>
            <select
              value={q.timeLimitSec}
              onChange={(e) => onChange({ ...q, timeLimitSec: Number(e.target.value) })}
              className={selectClass}
            >
              {/* Keep a non-standard value (e.g. from the API) selectable. */}
              {[...new Set([...TIME_LIMITS, q.timeLimitSec])]
                .sort((a, b) => a - b)
                .map((s) => (
                  <option key={s} value={s}>
                    {s} secondes
                  </option>
                ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-bold text-gray-600">Points</span>
            <select
              value={q.basePoints}
              onChange={(e) =>
                onChange({ ...q, basePoints: Number(e.target.value) as Question['basePoints'] })
              }
              className={selectClass}
            >
              {POINTS_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-bold text-gray-600">
          Réponses{' '}
          <span className="font-normal text-gray-400">
            — coche {isTF ? 'la bonne réponse' : 'la ou les bonnes réponses'}
          </span>
        </span>
        <div className="grid gap-2 sm:grid-cols-2">
          {q.choices.map((c, i) => {
            const shape = SHAPES[i]!;
            const textErr = err(`.choices.${i}.text`);
            return (
              <div key={i} className="flex flex-col gap-1">
                <div
                  className={`flex items-center gap-2 rounded-xl p-2 text-white ${shapeBg[shape.color]}`}
                >
                  <ShapeIcon shape={shape.shape} className="size-7 shrink-0 fill-white" />
                  <input
                    value={c.text}
                    maxLength={75}
                    readOnly={isTF}
                    placeholder={`Réponse ${i + 1}${i >= MIN_CHOICES ? ' (facultative)' : ''}`}
                    onChange={(e) => onChange(updateChoice(q, i, { text: e.target.value }))}
                    aria-label={`Réponse ${i + 1}`}
                    aria-invalid={!!textErr}
                    className={`min-w-0 flex-1 rounded-lg bg-white/15 px-2 py-2 font-bold text-white placeholder:text-white/70 outline-none focus:bg-white/25 ${textErr ? 'ring-2 ring-white' : ''}`}
                  />
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={c.isCorrect}
                    aria-label={`Réponse ${i + 1} correcte`}
                    title={c.isCorrect ? 'Bonne réponse' : 'Marquer comme bonne réponse'}
                    onClick={() => onChange(toggleCorrect(q, i))}
                    className={`flex size-9 shrink-0 items-center justify-center rounded-full border-4 border-white text-xl font-black ${c.isCorrect ? 'bg-white text-answer-green' : 'bg-transparent text-transparent hover:bg-white/20'}`}
                  >
                    ✓
                  </button>
                  {!isTF && q.choices.length > MIN_CHOICES && (
                    <button
                      type="button"
                      aria-label={`Retirer la réponse ${i + 1}`}
                      onClick={() => onChange(removeChoice(q, i))}
                      className="shrink-0 rounded px-1 text-lg font-bold opacity-80 hover:opacity-100"
                    >
                      ✕
                    </button>
                  )}
                </div>
                {textErr && (
                  <span className="text-sm font-semibold text-answer-red">{textErr}</span>
                )}
              </div>
            );
          })}
        </div>
        {!isTF && q.choices.length < MAX_CHOICES && (
          <button
            type="button"
            className={`${btn.ghost} self-start`}
            onClick={() => onChange(addChoice(q))}
          >
            + Ajouter une réponse
          </button>
        )}
        {err('.choices') && (
          <span className="text-sm font-semibold text-answer-red">{err('.choices')}</span>
        )}
      </div>
    </section>
  );
}
