import { AnimatePresence, motion } from 'framer-motion';
import type {
  DrawStatus,
  DrawStroke,
  QuestionRevealPayload,
  QuestionShowPayload,
} from '@lbq/shared';
import { Avatar } from '../components/Avatar';
import { Drawing } from '../components/Drawing';

/** Intro of a « Dessine-moi »: who is going to draw. */
export function DrawIntroLine({ question }: { question: QuestionShowPayload | null }) {
  const drawer = question?.draw?.drawer;
  if (!drawer) return null;
  return (
    <motion.p
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.3 }}
      className="flex items-center gap-4 rounded-2xl bg-black/25 px-8 py-4 text-4xl font-black"
    >
      <span aria-hidden="true">🎨</span>
      <Avatar id={drawer.avatar} size="md" />
      {drawer.nickname} va dessiner — les autres devinent sur leur téléphone !
    </motion.p>
  );
}

/**
 * « Dessine-moi », answering and reveal: the live drawing, who draws, the word as blanks (then
 * the word at the reveal) and who already found it (never what was typed).
 */
export function DrawStage({
  question,
  status,
  strokes,
  reveal,
  instant,
}: {
  question: QuestionShowPayload;
  status: DrawStatus | null;
  strokes: readonly DrawStroke[];
  reveal: QuestionRevealPayload | null;
  instant: boolean;
}) {
  const done = reveal?.draw;
  const drawer = done?.drawer ?? status?.drawer ?? question.draw?.drawer;
  const found = done?.found ?? status?.found ?? [];
  return (
    <div className="flex min-h-0 w-full flex-1 items-stretch gap-6">
      <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center">
        <Drawing
          strokes={done?.strokes ?? strokes}
          label={drawer ? `Dessin de ${drawer.nickname}` : 'Dessin'}
          className="h-full max-h-[60vh] w-auto max-w-full rounded-2xl shadow-xl"
        />
      </div>
      <aside className="flex w-80 shrink-0 flex-col gap-4">
        {drawer && (
          <div className="flex items-center gap-3 rounded-2xl bg-black/25 px-4 py-3 text-2xl font-black">
            <Avatar id={drawer.avatar} size="md" />
            <span className="min-w-0 break-words">
              🎨 {drawer.nickname} {done ? 'a dessiné' : 'dessine…'}
            </span>
          </div>
        )}
        {done ? (
          <motion.div
            initial={instant ? false : { scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 14 }}
            className="rounded-2xl bg-answer-green px-4 py-4 text-center shadow-lg"
          >
            <p className="text-lg font-bold opacity-90">Il fallait trouver</p>
            <p className="break-words text-4xl font-black" data-testid="draw-word">
              {done.word}
            </p>
          </motion.div>
        ) : (
          question.draw && (
            <p
              className="rounded-2xl bg-white px-4 py-3 text-center font-mono text-4xl font-black tracking-[0.25em] text-brand"
              aria-label={`Mot de ${question.draw.hint.replace(/[^_]/g, '').length} lettres`}
            >
              {question.draw.hint}
            </p>
          )
        )}
        <p className="text-xl font-bold">
          {found.length === 0
            ? done
              ? 'Personne n’a trouvé…'
              : 'Devinez sur vos téléphones !'
            : `${found.length} ${found.length > 1 ? 'ont' : 'a'} trouvé !`}
        </p>
        <ul className="flex min-h-0 flex-col gap-2 overflow-y-auto" data-testid="draw-found">
          <AnimatePresence initial={!instant}>
            {found.map((p, i) => (
              <motion.li
                key={p.id}
                initial={{ x: 40, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                className="flex items-center gap-3 rounded-xl bg-answer-green/90 px-3 py-2 text-xl font-black"
              >
                <span aria-hidden="true">{i === 0 ? '🥇' : '✅'}</span>
                <Avatar id={p.avatar} size="sm" />
                <span className="min-w-0 flex-1 truncate">{p.nickname}</span>
                {'ms' in p && (
                  <span className="text-base font-bold tabular-nums opacity-85">
                    {Math.round((p as { ms: number }).ms / 1000)} s
                  </span>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </aside>
    </div>
  );
}
