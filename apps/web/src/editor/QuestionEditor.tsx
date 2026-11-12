import {
  EXPLANATION_MAX_LENGTH,
  SHAPES,
  TYPE_ANSWER_MAX_LENGTH,
  AUCTION_TOPIC_MAX_LENGTH,
  auctionAllowed,
  buzzerAllowed,
  hasRightAnswer,
  type Question,
  type QuestionType,
} from '@lbq/shared';
import type { FieldErrors } from '../api/validation';
import { ShapeIcon, shapeBg } from '../components/shapes';
import { btn } from './EditorShell';
import { ImageField } from './ImageField';
import { AudioField, ImageEffectField } from './MediaFields';
import { OrderItemsField, PinZoneField, WhoOfUsField, WordCloudHint } from './MoreTypeFields';
import { BluffFields } from './BluffFields';
import { WagerFields } from './WagerFields';
import { WavelengthFields } from './WavelengthFields';
import { PotatoFields } from './PotatoFields';
import { DrawFields } from './DrawFields';
import { ListFields } from './ListFields';
import { PointlessFields } from './PointlessFields';
import { ColorsFields } from './ColorsFields';
import { MissingFields } from './MissingFields';
import {
  MAX_ACCEPTED_ANSWERS,
  MAX_CHOICES,
  MIN_CHOICES,
  POINTS_OPTIONS,
  QUESTION_TYPES,
  TIME_LIMITS,
  addAcceptedAnswer,
  addChoice,
  duplicateQuestion,
  isMultipleAnswerDraft,
  moveQuestion,
  removeAcceptedAnswer,
  removeChoice,
  removeQuestion,
  setQuestionType,
  toggleCorrect,
  updateAcceptedAnswer,
  updateChoice,
  updateSlider,
  type DraftQuestion,
  type QuizDraft,
} from './draft';

const selectClass =
  'rounded-lg border-2 border-gray-300 bg-white px-3 py-2 font-semibold outline-none focus:border-brand';
const inputClass = (invalid: boolean) =>
  `rounded-lg border-2 px-3 py-2 font-bold outline-none focus:border-brand ${invalid ? 'border-answer-red' : 'border-gray-300'}`;

type Err = (path: string) => string | undefined;

function FieldError({ message }: { message?: string }) {
  return message ? <span className="text-sm font-semibold text-answer-red">{message}</span> : null;
}

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
  question: DraftQuestion;
  errors: FieldErrors;
  onChange: (q: DraftQuestion) => void;
  /** Structural changes (move / duplicate / delete), then select question `nextIndex`. */
  onDraftChange: (fn: (d: QuizDraft) => QuizDraft, nextIndex: number) => void;
}) {
  const err: Err = (path) => errors[`questions.${index}${path}`];
  const noRightAnswer = !hasRightAnswer(q.type);

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

      {/* Phone: a compact list (18 types would take half the screen as buttons). */}
      <label className="flex flex-col gap-1 sm:hidden">
        <span className="text-sm font-bold text-gray-600">Type de question</span>
        <select
          value={q.type}
          onChange={(e) => onChange(setQuestionType(q, e.target.value as QuestionType))}
          className={selectClass}
          data-testid="type-select"
        >
          {QUESTION_TYPES.map(({ type, label }) => (
            <option key={type} value={type}>
              {label}
            </option>
          ))}
        </select>
        <span className="text-xs text-gray-500">
          {QUESTION_TYPES.find((t) => t.type === q.type)?.description}
        </span>
      </label>
      <div
        className="hidden flex-wrap gap-1 self-start rounded-lg bg-gray-100 p-1 sm:flex"
        role="radiogroup"
        aria-label="Type"
      >
        {QUESTION_TYPES.map(({ type, label, description }) => (
          <span key={type} className="group relative">
            <button
              type="button"
              role="radio"
              aria-checked={q.type === type}
              aria-describedby={`type-help-${type}`}
              onClick={() => onChange(setQuestionType(q, type))}
              className={`rounded-md px-3 py-1 text-sm font-bold ${q.type === type ? 'bg-white text-brand shadow-sm' : 'text-gray-500'}`}
            >
              {label}
            </button>
            {/* Shown on hover (after a short delay) and on keyboard focus. */}
            <span
              id={`type-help-${type}`}
              role="tooltip"
              className="pointer-events-none invisible absolute top-full left-1/2 z-20 mt-2 w-64 -translate-x-1/2 rounded-lg bg-gray-900 px-3 py-2 text-xs leading-snug font-normal text-white opacity-0 shadow-lg transition-opacity delay-0 group-hover:visible group-hover:opacity-100 group-hover:delay-300 group-has-[:focus-visible]:visible group-has-[:focus-visible]:opacity-100"
            >
              {description}
            </span>
          </span>
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
        <FieldError message={err('.text')} />
      </label>

      <label className="flex flex-col gap-1">
        <span className="flex justify-between text-sm font-bold text-gray-600">
          💡 Explication (affichée après la réponse)
          <span className="font-normal text-gray-400">
            {q.explanation.length} / {EXPLANATION_MAX_LENGTH}
          </span>
        </span>
        <textarea
          value={q.explanation}
          maxLength={EXPLANATION_MAX_LENGTH}
          rows={2}
          placeholder="Facultatif : une anecdote, le pourquoi de la réponse… (« Le saviez-vous ? » sur l'écran et les téléphones)"
          onChange={(e) => onChange({ ...q, explanation: e.target.value })}
          aria-label="Explication"
          aria-invalid={!!err('.explanation')}
          className={`resize-none rounded-lg border-2 px-3 py-2 text-sm outline-none focus:border-brand ${err('.explanation') ? 'border-answer-red' : 'border-gray-300'}`}
        />
        <FieldError message={err('.explanation')} />
      </label>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        {q.type === 'DRAW' ? (
          <p className="self-center rounded-lg bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-600">
            🎨 Pas d’image : l’écran affiche le dessin en direct.
          </p>
        ) : q.type === 'HOT_POTATO' ? (
          <p className="self-center rounded-lg bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-600">
            💣 Pas d’image : l’écran affiche la bombe et la question du joueur qui l’a.
          </p>
        ) : (
          <ImageField
            label={
              q.type === 'PIN'
                ? 'Image (obligatoire : les joueurs la touchent)'
                : q.type === 'COLORS'
                  ? 'Image (pour un tableau « Zones sur une image »)'
                  : q.type === 'MISSING'
                    ? 'Image « avant » (obligatoire : complète)'
                    : 'Image (facultative)'
            }
            value={q.imageUrl}
            onChange={(imageUrl) => onChange({ ...q, imageUrl })}
          />
        )}
        <div className="flex flex-col gap-3">
          <label className={`flex flex-col gap-1 ${q.type === 'HOT_POTATO' ? 'hidden' : ''}`}>
            <span className="text-sm font-bold text-gray-600">
              {q.type === 'BLUFF'
                ? 'Temps pour écrire'
                : q.type === 'WAGER'
                  ? 'Temps pour estimer'
                  : q.type === 'WAVELENGTH'
                    ? 'Temps pour deviner'
                    : q.type === 'DRAW'
                      ? 'Temps pour dessiner'
                      : q.type === 'COLORS' || q.type === 'MISSING'
                        ? 'Temps pour répondre'
                        : 'Temps'}
            </span>
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
          {noRightAnswer ? (
            <p className="max-w-48 text-sm font-semibold text-gray-500">
              {q.type === 'POLL' ? 'Sondage' : q.type === 'WORD_CLOUD' ? 'Nuage de mots' : 'Vote'} :
              pas de bonne réponse, aucun point, la série des joueurs continue.
            </p>
          ) : (
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
          )}
          {buzzerAllowed(q.type) && (
            <label className="flex max-w-60 items-start gap-2">
              <input
                type="checkbox"
                checked={q.buzzer}
                onChange={(e) => onChange({ ...q, buzzer: e.target.checked })}
                className="mt-0.5 size-5 shrink-0 accent-brand"
              />
              <span className="text-sm">
                <span className="font-bold">🔔 Buzzer</span>
                <span className="block text-gray-500">
                  Un seul gros bouton BUZZ sur les téléphones : le plus rapide répond à voix haute,
                  vous validez ✅ / ❌ sur l'écran.
                </span>
              </span>
            </label>
          )}
          {auctionAllowed(q.type, q.buzzer && buzzerAllowed(q.type)) && (
            <div className="flex max-w-72 flex-col gap-2">
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={q.auction}
                  onChange={(e) => onChange({ ...q, auction: e.target.checked })}
                  className="mt-0.5 size-5 shrink-0 accent-brand"
                />
                <span className="text-sm">
                  <span className="font-bold">💰 Enchères</span>
                  <span className="block text-gray-500">
                    Avant de voir la question, chacun mise des points en secret : gagnés si la
                    réponse est bonne, perdus sinon.
                  </span>
                </span>
              </label>
              {q.auction && (
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-semibold">Thème annoncé (facultatif)</span>
                  <input
                    type="text"
                    value={q.auctionTopic}
                    maxLength={AUCTION_TOPIC_MAX_LENGTH}
                    placeholder="ex. Cinéma des années 80"
                    onChange={(e) => onChange({ ...q, auctionTopic: e.target.value })}
                    className="rounded-lg border-2 border-gray-200 px-3 py-1.5 focus:border-brand focus:outline-none"
                  />
                  {err('.auctionTopic') && (
                    <span className="text-xs text-answer-red">{err('.auctionTopic')}</span>
                  )}
                </label>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
        <AudioField
          value={q.audio}
          onReveal={q.audioOnReveal}
          errors={{
            url: err('.audio.url'),
            startSec: err('.audio.startSec'),
            durationSec: err('.audio.durationSec'),
          }}
          onChange={(audio) => onChange({ ...q, audio })}
          onRevealChange={(audioOnReveal) => onChange({ ...q, audioOnReveal })}
        />
        {q.imageUrl &&
          q.type !== 'PIN' &&
          q.type !== 'DRAW' &&
          q.type !== 'HOT_POTATO' &&
          q.type !== 'COLORS' &&
          q.type !== 'MISSING' && (
            <ImageEffectField
              imageUrl={q.imageUrl}
              value={q.imageEffect}
              onChange={(imageEffect) => onChange({ ...q, imageEffect })}
            />
          )}
      </div>

      {q.type === 'TYPE_ANSWER' ? (
        <AcceptedAnswersField q={q} err={err} onChange={onChange} />
      ) : q.type === 'SLIDER' ? (
        <SliderField q={q} err={err} onChange={onChange} />
      ) : q.type === 'ORDER' ? (
        <OrderItemsField q={q} err={err} onChange={onChange} />
      ) : q.type === 'PIN' ? (
        <PinZoneField q={q} err={err} onChange={onChange} />
      ) : q.type === 'WHO_OF_US' ? (
        <WhoOfUsField q={q} err={err} onChange={onChange} />
      ) : q.type === 'WORD_CLOUD' ? (
        <WordCloudHint />
      ) : q.type === 'BLUFF' ? (
        <BluffFields q={q} err={err} onChange={onChange} />
      ) : q.type === 'DRAW' ? (
        <DrawFields q={q} err={err} onChange={onChange} />
      ) : q.type === 'LIST' ? (
        <ListFields q={q} err={err} onChange={onChange} />
      ) : q.type === 'COLORS' ? (
        <ColorsFields q={q} err={err} onChange={onChange} />
      ) : q.type === 'MISSING' ? (
        <MissingFields q={q} err={err} onChange={onChange} />
      ) : q.type === 'POINTLESS' ? (
        <PointlessFields q={q} err={err} onChange={onChange} />
      ) : q.type === 'WAGER' ? (
        <WagerFields q={q} err={err} onChange={onChange} />
      ) : q.type === 'WAVELENGTH' ? (
        <WavelengthFields q={q} err={err} onChange={onChange} />
      ) : q.type === 'HOT_POTATO' ? (
        <PotatoFields q={q} err={err} onChange={onChange} />
      ) : (
        <ChoicesField q={q} err={err} onChange={onChange} />
      )}
    </section>
  );
}

type FieldProps = { q: DraftQuestion; err: Err; onChange: (q: DraftQuestion) => void };

/** MCQ, true/false and poll: one colored field per shape. */
function ChoicesField({ q, err, onChange }: FieldProps) {
  const isTF = q.type === 'TRUE_FALSE';
  const isPoll = q.type === 'POLL';
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-bold text-gray-600">
        Réponses{' '}
        <span className="font-normal text-gray-400">
          —{' '}
          {isPoll
            ? 'les joueurs votent, pas de bonne réponse'
            : `coche ${isTF ? 'la bonne réponse' : 'la ou les bonnes réponses'}`}
        </span>
      </span>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
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
                {!isPoll && (
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
                )}
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
              <FieldError message={textErr} />
            </div>
          );
        })}
      </div>
      {isMultipleAnswerDraft(q) && (
        <p
          className="rounded-lg bg-brand/10 px-3 py-2 text-sm font-semibold text-brand"
          data-testid="multiple-hint"
        >
          ☑️ Plusieurs bonnes réponses : les joueurs devront toutes les cocher pour marquer
        </p>
      )}
      {!isTF && q.choices.length < MAX_CHOICES && (
        <button
          type="button"
          className={`${btn.ghost} self-start`}
          onClick={() => onChange(addChoice(q))}
        >
          + Ajouter une réponse
        </button>
      )}
      <FieldError message={err('.choices')} />
    </div>
  );
}

/** Réponse libre: 1 to `MAX_ACCEPTED_ANSWERS` accepted answers + typo tolerance. */
function AcceptedAnswersField({ q, err, onChange }: FieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-bold text-gray-600">
        Réponses acceptées{' '}
        <span className="font-normal text-gray-400">
          ({q.acceptedAnswers.length} / {MAX_ACCEPTED_ANSWERS})
        </span>{' '}
        <span className="font-normal text-gray-400">
          — majuscules, accents, ponctuation et article (le, la, l’…) ne comptent pas
        </span>
      </span>
      {q.acceptedAnswers.map((answer, i) => {
        const answerErr = err(`.acceptedAnswers.${i}`);
        return (
          <div key={i} className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <input
                value={answer}
                maxLength={TYPE_ANSWER_MAX_LENGTH}
                placeholder={i === 0 ? 'Ex. : Léonard de Vinci' : 'Autre réponse acceptée'}
                onChange={(e) => onChange(updateAcceptedAnswer(q, i, e.target.value))}
                aria-label={`Réponse acceptée ${i + 1}`}
                aria-invalid={!!answerErr}
                className={`min-w-0 flex-1 ${inputClass(!!answerErr)}`}
              />
              {q.acceptedAnswers.length > 1 && (
                <button
                  type="button"
                  aria-label={`Retirer la réponse acceptée ${i + 1}`}
                  onClick={() => onChange(removeAcceptedAnswer(q, i))}
                  className="shrink-0 rounded px-2 text-lg font-bold text-gray-500 hover:text-answer-red"
                >
                  ✕
                </button>
              )}
            </div>
            <FieldError message={answerErr} />
          </div>
        );
      })}
      {q.acceptedAnswers.length < MAX_ACCEPTED_ANSWERS ? (
        <button
          type="button"
          className={`${btn.ghost} self-start`}
          onClick={() => onChange(addAcceptedAnswer(q))}
        >
          + Ajouter une variante
        </button>
      ) : (
        <p className="text-sm text-gray-500">
          Maximum atteint : {MAX_ACCEPTED_ANSWERS} réponses acceptées.
        </p>
      )}
      <FieldError message={err('.acceptedAnswers')} />
      <label className="flex items-center gap-2 self-start font-semibold">
        <input
          type="checkbox"
          checked={q.typoTolerance}
          onChange={(e) => onChange({ ...q, typoTolerance: e.target.checked })}
          className="size-5 accent-brand"
        />
        Tolérer les petites fautes
        <span className="text-sm font-normal text-gray-400">(les nombres restent exacts)</span>
      </label>
    </div>
  );
}

const SLIDER_FIELDS = [
  { key: 'min', label: 'Minimum' },
  { key: 'max', label: 'Maximum' },
  { key: 'step', label: 'Cran' },
  { key: 'correct', label: 'Bonne réponse' },
  { key: 'margin', label: 'Tolérance ±' },
] as const;

/** Curseur: range, step, correct value, margin, unit. */
function SliderField({ q, err, onChange }: FieldProps) {
  const s = q.slider;
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-bold text-gray-600">
        Curseur{' '}
        <span className="font-normal text-gray-400">
          — juste si l’écart avec la bonne réponse ne dépasse pas la tolérance (0 = valeur exacte)
        </span>
      </span>
      <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-3 sm:grid-cols-6">
        {SLIDER_FIELDS.map(({ key, label }) => {
          const fieldErr = err(`.slider.${key}`);
          return (
            <label key={key} className="flex flex-col gap-1">
              <span className="text-sm font-bold text-gray-600">{label}</span>
              <input
                type="number"
                step="any"
                value={Number.isNaN(s[key]) ? '' : s[key]}
                onChange={(e) => onChange(updateSlider(q, { [key]: e.target.valueAsNumber }))}
                aria-invalid={!!fieldErr}
                className={`w-full ${inputClass(!!fieldErr)}`}
              />
              <FieldError message={fieldErr} />
            </label>
          );
        })}
        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold text-gray-600">Unité</span>
          <input
            value={s.unit}
            maxLength={10}
            placeholder="km, ans…"
            onChange={(e) => onChange(updateSlider(q, { unit: e.target.value }))}
            className={`w-full ${inputClass(!!err('.slider.unit'))}`}
          />
          <FieldError message={err('.slider.unit')} />
        </label>
      </div>
    </div>
  );
}
