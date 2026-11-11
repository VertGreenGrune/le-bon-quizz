import { LIST_ITEM_MAX_LENGTH, LIST_MAX_ITEMS, LIST_MIN_ITEMS } from '@lbq/shared';
import type { DraftQuestion } from './draft';

type FieldProps = {
  q: DraftQuestion;
  err: (path: string) => string | undefined;
  onChange: (q: DraftQuestion) => void;
};

/** « Liste chrono »: the items to find, one per line, other spellings after « | ». */
export function ListFields({ q, err, onChange }: FieldProps) {
  const items = q.listItems.filter((i) => i.trim());
  const errors = [
    err('.listItems') &&
      (items.length < LIST_MIN_ITEMS
        ? `Il faut au moins ${LIST_MIN_ITEMS} éléments.`
        : 'Deux éléments sont identiques.'),
    ...q.listItems.map((item, i) => {
      const e = err(`.listItems.${i}`);
      return e && `« ${item.trim() || '…'} » : ${e}`;
    }),
  ].filter(Boolean);
  const tooLong = q.listItems.find((i) => i.trim().length > LIST_ITEM_MAX_LENGTH);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-gray-500">
        Les joueurs tapent sur leur téléphone autant d’éléments qu’ils peuvent avant la fin du
        temps. Chaque élément trouvé rapporte {q.basePoints} pts ÷ le nombre d’éléments ; en trouver
        au moins la moitié compte comme une bonne réponse (série, cœur en « Survie »). L’écran
        montre en direct combien chacun en a trouvé, sans dévoiler lesquels.
      </p>
      <label className="flex flex-col gap-1">
        <span className="flex justify-between text-sm font-bold text-gray-600">
          Éléments à trouver (un par ligne)
          <span className="font-normal text-gray-400">
            {items.length} / {LIST_MAX_ITEMS}
          </span>
        </span>
        <textarea
          value={q.listItems.join('\n')}
          rows={7}
          onChange={(e) => onChange({ ...q, listItems: e.target.value.split('\n') })}
          placeholder={
            'Ex. :\nProf | Professeur\nGrincheux\nJoyeux\nTimide\nAtchoum\nDormeur\nSimplet'
          }
          aria-label="Éléments à trouver"
          aria-invalid={errors.length > 0}
          className={`resize-y rounded-lg border-2 px-3 py-2 font-bold outline-none focus:border-brand ${errors.length > 0 || tooLong ? 'border-answer-red' : 'border-gray-300'}`}
        />
        {tooLong && (
          <span className="text-sm font-semibold text-answer-red">
            « {tooLong.trim()} » : {LIST_ITEM_MAX_LENGTH} caractères au maximum.
          </span>
        )}
        {errors.map((e) => (
          <span key={e} className="text-sm font-semibold text-answer-red">
            {e}
          </span>
        ))}
        <span className="text-xs text-gray-500">
          Autres orthographes acceptées après « | » (ex. « Prof | Professeur ») : la première est
          affichée à la révélation.
        </span>
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={q.typoTolerance}
          onChange={(e) => onChange({ ...q, typoTolerance: e.target.checked })}
          className="size-5 accent-brand"
        />
        <span className="text-sm font-bold">Tolérer les petites fautes</span>
      </label>
    </div>
  );
}
