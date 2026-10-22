import { PIN_MAX_RADIUS, PIN_MIN_RADIUS, WHO_OF_US_MAJORITY_BONUS } from '@lbq/shared';
import { PinMarker, PinPicture, PinZoneMark } from '../components/PinPicture';
import { btn } from './EditorShell';
import {
  ORDER_MAX_ITEMS,
  ORDER_MIN_ITEMS,
  addItem,
  moveItem,
  removeItem,
  updateItem,
  type DraftQuestion,
} from './draft';

/** Fields of the ORDER / PIN / WHO_OF_US / WORD_CLOUD questions (see `QuestionEditor`). */
type FieldProps = {
  q: DraftQuestion;
  err: (path: string) => string | undefined;
  onChange: (q: DraftQuestion) => void;
};

const inputClass = (invalid: boolean) =>
  `rounded-lg border-2 px-3 py-2 font-bold outline-none focus:border-brand ${invalid ? 'border-answer-red' : 'border-gray-300'}`;

function FieldError({ message }: { message?: string }) {
  return message ? <span className="text-sm font-semibold text-answer-red">{message}</span> : null;
}

/** Remettre dans l'ordre: 3–6 items, typed in the right order (shuffled for the players). */
export function OrderItemsField({ q, err, onChange }: FieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-bold text-gray-600">
        Éléments dans le bon ordre{' '}
        <span className="font-normal text-gray-400">
          — ils seront mélangés sur les téléphones (ex. : du plus ancien au plus récent)
        </span>
      </span>
      <ol className="flex flex-col gap-2">
        {q.items.map((item, i) => {
          const itemErr = err(`.items.${i}`);
          return (
            <li key={i} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand font-black text-white">
                  {i + 1}
                </span>
                <input
                  value={item}
                  maxLength={75}
                  placeholder={`Élément ${i + 1}${i >= ORDER_MIN_ITEMS ? ' (facultatif)' : ''}`}
                  onChange={(e) => onChange(updateItem(q, i, e.target.value))}
                  aria-label={`Élément ${i + 1}`}
                  aria-invalid={!!itemErr}
                  className={`min-w-0 flex-1 ${inputClass(!!itemErr)}`}
                />
                <button
                  type="button"
                  className={btn.ghost}
                  disabled={i === 0}
                  aria-label={`Monter l’élément ${i + 1}`}
                  onClick={() => onChange(moveItem(q, i, i - 1))}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={btn.ghost}
                  disabled={i === q.items.length - 1}
                  aria-label={`Descendre l’élément ${i + 1}`}
                  onClick={() => onChange(moveItem(q, i, i + 1))}
                >
                  ↓
                </button>
                {q.items.length > ORDER_MIN_ITEMS && (
                  <button
                    type="button"
                    aria-label={`Retirer l’élément ${i + 1}`}
                    onClick={() => onChange(removeItem(q, i))}
                    className="shrink-0 rounded px-2 text-lg font-bold text-gray-500 hover:text-answer-red"
                  >
                    ✕
                  </button>
                )}
              </div>
              <FieldError message={itemErr} />
            </li>
          );
        })}
      </ol>
      {q.items.length < ORDER_MAX_ITEMS && (
        <button
          type="button"
          className={`${btn.ghost} self-start`}
          onClick={() => onChange(addItem(q))}
        >
          + Ajouter un élément
        </button>
      )}
      <FieldError message={err('.items')} />
      <p className="text-sm text-gray-500">
        Tout juste = tous les points ; sinon une part des points par élément bien placé.
      </p>
    </div>
  );
}

const RADIUS_STEP = 0.01;

/** Point sur l'image: click the picture to place the zone, then size it. */
export function PinZoneField({ q, err, onChange }: FieldProps) {
  const { zone } = q;
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-bold text-gray-600">
        Zone correcte{' '}
        <span className="font-normal text-gray-400">
          — les joueurs touchent l’image sur leur téléphone : dans la zone = tous les points, juste
          à côté = une partie
        </span>
      </span>
      {q.imageUrl ? (
        <>
          <p className="text-sm font-semibold">
            Clique sur l’image pour placer le centre de la zone.
          </p>
          <div className="self-start overflow-hidden rounded-lg border-2 border-gray-200 bg-gray-50">
            <PinPicture
              src={q.imageUrl}
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
          Ajoute une image ci-dessus (carte, affiche, photo…) pour placer la zone.
        </p>
      )}
      <FieldError message={err('.imageUrl') ?? err('.zone') ?? err('.zone.x') ?? err('.zone.y')} />
    </div>
  );
}

/** « Qui de nous ? »: the players vote for one of them; optional majority bonus. */
export function WhoOfUsField({ q, onChange }: FieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-gray-500">
        Les joueurs votent pour un joueur de la partie (ex. : « Qui est le plus susceptible de rater
        son train ? »). Pas de bonne réponse : la personne la plus votée reçoit un titre à l’écran.
      </p>
      <label className="flex items-center gap-2 self-start font-semibold">
        <input
          type="checkbox"
          checked={q.majorityBonus}
          onChange={(e) => onChange({ ...q, majorityBonus: e.target.checked })}
          className="size-5 accent-brand"
        />
        + {WHO_OF_US_MAJORITY_BONUS} points pour ceux qui votent comme la majorité
      </label>
    </div>
  );
}

/** Nuage de mots: nothing to set. */
export function WordCloudHint() {
  return (
    <p className="text-sm text-gray-500">
      Les joueurs écrivent un mot ou deux (20 caractères maximum) ; les réponses s’affichent en
      nuage de mots animé sur l’écran. Pas de bonne réponse, aucun point.
    </p>
  );
}
