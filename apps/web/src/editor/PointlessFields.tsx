import { LIST_ITEM_MAX_LENGTH, POINTLESS_MAX_ITEMS, POINTLESS_MIN_ITEMS } from '@lbq/shared';
import type { DraftQuestion } from './draft';

type FieldProps = {
  q: DraftQuestion;
  err: (path: string) => string | undefined;
  onChange: (q: DraftQuestion) => void;
};

/** « Pas évident ! »: every accepted answer, one per line, other spellings after « | ». */
export function PointlessFields({ q, err, onChange }: FieldProps) {
  const items = q.listItems.filter((i) => i.trim());
  const errors = [
    err('.listItems') &&
      (items.length < POINTLESS_MIN_ITEMS
        ? `Il faut au moins ${POINTLESS_MIN_ITEMS} bonnes réponses.`
        : items.length > POINTLESS_MAX_ITEMS
          ? `${POINTLESS_MAX_ITEMS} bonnes réponses au maximum.`
          : 'Deux réponses sont identiques.'),
    ...q.listItems.map((item, i) => {
      const e = err(`.listItems.${i}`);
      return e && `« ${item.trim() || '…'} » : ${e}`;
    }),
  ].filter(Boolean);
  const tooLong = q.listItems.find((i) => i.trim().length > LIST_ITEM_MAX_LENGTH);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-gray-500">
        Chaque joueur tape <strong>une seule</strong> réponse sur son téléphone. Une bonne réponse
        donnée par <em>n</em> joueurs rapporte {q.basePoints} pts ÷ <em>n</em> à chacun : celle que
        personne d’autre n’a trouvée rapporte tout (« 💎 Pas évident ! »). La vitesse ne compte pas.
        Listez le plus de bonnes réponses possible : celles que personne n’a données sont montrées à
        la révélation.
      </p>
      <label className="flex flex-col gap-1">
        <span className="flex justify-between text-sm font-bold text-gray-600">
          Bonnes réponses (une par ligne)
          <span className="font-normal text-gray-400">
            {items.length} / {POINTLESS_MAX_ITEMS}
          </span>
        </span>
        <textarea
          value={q.listItems.join('\n')}
          rows={8}
          onChange={(e) => onChange({ ...q, listItems: e.target.value.split('\n') })}
          placeholder={
            'Ex. :\nMaroc\nSénégal\nCôte d’Ivoire | Cote d Ivoire\nÉgypte\nMadagascar\n…'
          }
          aria-label="Bonnes réponses"
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
          Autres orthographes acceptées après « | » (ex. « RDC | Congo-Kinshasa ») : la première est
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
