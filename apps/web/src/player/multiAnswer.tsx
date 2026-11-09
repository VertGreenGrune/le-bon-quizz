import { motion } from 'framer-motion';
import { SHAPES } from '@lbq/shared';
import { ShapeIcon, shapeBg } from '../components/shapes';
import { toggleChoice, validateChoices } from './playerStore';
import { selectedChoices, type PlayerState } from './playerState';

/**
 * « Select all » question (`prompt.multiple`): the shapes are toggles, « Valider » sends them all.
 * (With a Brouilleur, `MovingButtons` is used instead.)
 */
export function MultiAnswerButtons({
  s,
  choiceCount,
  hidden,
}: {
  s: PlayerState;
  choiceCount: number;
  hidden: number[];
}) {
  const selected = selectedChoices(s);
  const shapes = SHAPES.slice(0, choiceCount);
  return (
    <div className="flex flex-1 flex-col gap-3 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <p className="text-center text-sm font-black" data-testid="multiple-hint">
        Plusieurs réponses possibles — coche toutes les bonnes
      </p>
      <div
        className={`grid flex-1 gap-3 ${
          choiceCount === 2 ? 'grid-cols-1 grid-rows-2' : 'grid-cols-2'
        }`}
      >
        {shapes.map((shape, i) => {
          // 50/50: the hidden wrong choices leave an empty slot (the layout doesn't move).
          if (hidden.includes(shape.index))
            return <div key={shape.index} className="rounded-2xl bg-black/20" aria-hidden="true" />;
          const on = selected.includes(shape.index);
          return (
            <motion.button
              key={shape.index}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: on ? 0.94 : 1, opacity: 1 }}
              whileTap={{ scale: 0.88 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20, delay: i * 0.03 }}
              type="button"
              aria-pressed={on}
              aria-label={`Réponse ${shape.symbol}`}
              onClick={() => toggleChoice(shape.index)}
              className={`relative flex touch-manipulation items-center justify-center rounded-2xl px-4 shadow-[inset_0_-6px_0_rgba(0,0,0,0.25)] ${
                shapeBg[shape.color]
              } ${on ? 'ring-[6px] ring-white' : 'opacity-80'}`}
            >
              <ShapeIcon
                shape={shape.shape}
                className="size-1/2 max-h-28 max-w-28 fill-white drop-shadow"
              />
              {on && (
                <span
                  className="absolute top-2 right-2 flex size-9 items-center justify-center rounded-full bg-white text-xl font-black text-brand"
                  aria-hidden="true"
                >
                  ✓
                </span>
              )}
            </motion.button>
          );
        })}
      </div>
      <motion.button
        type="button"
        whileTap={{ scale: 0.95 }}
        disabled={selected.length === 0}
        onClick={validateChoices}
        className="touch-manipulation rounded-2xl bg-white py-4 text-2xl font-black text-brand shadow-[inset_0_-6px_0_rgba(0,0,0,0.25)] disabled:opacity-50"
      >
        Valider{selected.length > 0 && ` (${selected.length})`}
      </motion.button>
    </div>
  );
}

/** Small shape tiles: what was ticked (« Réponse envoyée ! ») or what had to be (result). */
export function ShapeList({ indexes, size = 'md' }: { indexes: number[]; size?: 'sm' | 'md' }) {
  return (
    <span className="inline-flex flex-wrap justify-center gap-2">
      {indexes.map((i) => {
        const shape = SHAPES[i];
        if (!shape) return null;
        return (
          <span
            key={i}
            className={`inline-flex items-center justify-center rounded-xl ${shapeBg[shape.color]} ${
              size === 'sm' ? 'p-1.5 ring-2 ring-white' : 'p-4'
            }`}
            aria-label={shape.symbol}
          >
            <ShapeIcon
              shape={shape.shape}
              className={`${size === 'sm' ? 'size-6' : 'size-14'} fill-white`}
            />
          </span>
        );
      })}
    </span>
  );
}

/** Result of a « select all » question when wrong: the shapes one had to tick. */
export function MultipleResultLine({ correctIndexes }: { correctIndexes: number[] }) {
  return (
    <p
      className="flex flex-wrap items-center justify-center gap-2 font-bold"
      data-testid="multiple-result"
    >
      Il fallait cocher : <ShapeList indexes={correctIndexes} size="sm" />
    </p>
  );
}

/** « 💡 Le saviez-vous ? » on the result screen. */
export function ExplanationNote({ text }: { text: string }) {
  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.7 }}
      className="w-full max-w-sm rounded-2xl bg-black/25 px-4 py-3 text-left"
      data-testid="explanation"
    >
      <p className="text-sm font-black">💡 Le saviez-vous ?</p>
      <p className="text-sm font-semibold whitespace-pre-line">{text}</p>
    </motion.div>
  );
}
