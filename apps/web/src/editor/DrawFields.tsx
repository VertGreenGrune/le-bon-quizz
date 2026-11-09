import { DRAW_MAX_WORDS, DRAW_WORDS, DRAW_WORD_MAX_LENGTH } from '@lbq/shared';
import type { DraftQuestion } from './draft';

type FieldProps = {
  q: DraftQuestion;
  err: (path: string) => string | undefined;
  onChange: (q: DraftQuestion) => void;
};

/** « Dessine-moi »: the words to draw (one per line), or the built-in list when empty. */
export function DrawFields({ q, err, onChange }: FieldProps) {
  const words = q.words.filter((w) => w.trim());
  const errors = [
    err('.words'),
    ...q.words.map((w, i) => {
      const e = err(`.words.${i}`);
      return e && `« ${w.trim() || '…'} » : ${e}`;
    }),
  ].filter(Boolean);
  const tooLong = q.words.find((w) => w.trim().length > DRAW_WORD_MAX_LENGTH);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-gray-500">
        Un joueur (chacun son tour) reçoit un mot secret sur son téléphone et le dessine avec le
        doigt : le dessin s’affiche en direct sur l’écran. Les autres tapent leurs propositions ;
        plus ils trouvent vite, plus ils marquent. Le dessinateur gagne une part de {q.basePoints}{' '}
        pts égale à la part des joueurs qui trouvent (tout le monde trouve : {q.basePoints} pts).
      </p>
      <label className="flex flex-col gap-1">
        <span className="flex justify-between text-sm font-bold text-gray-600">
          Mots à dessiner (un par ligne, un est tiré au hasard)
          <span className="font-normal text-gray-400">
            {words.length} / {DRAW_MAX_WORDS}
          </span>
        </span>
        <textarea
          value={q.words.join('\n')}
          rows={4}
          onChange={(e) => onChange({ ...q, words: e.target.value.split('\n') })}
          placeholder={'Ex. :\nlicorne\ntour Eiffel\nbonhomme de neige'}
          aria-invalid={errors.length > 0}
          className={`resize-y rounded-lg border-2 px-3 py-2 font-bold outline-none focus:border-brand ${errors.length > 0 || tooLong ? 'border-answer-red' : 'border-gray-300'}`}
        />
        {tooLong && (
          <span className="text-sm font-semibold text-answer-red">
            « {tooLong.trim()} » : {DRAW_WORD_MAX_LENGTH} caractères au maximum.
          </span>
        )}
        {errors.map((e) => (
          <span key={e} className="text-sm font-semibold text-answer-red">
            {e}
          </span>
        ))}
        <span className="text-xs text-gray-500">
          {words.length === 0
            ? `Aucun mot : un mot sera tiré de la liste intégrée (${DRAW_WORDS.length} mots faciles à dessiner, sans répétition dans une partie).`
            : 'Les petites fautes de frappe sont acceptées ; une proposition proche affiche « Presque ! ».'}
        </span>
      </label>
    </div>
  );
}
