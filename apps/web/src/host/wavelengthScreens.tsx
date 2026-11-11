import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { WAVELENGTH_BANDS, type QuestionShowPayload, type WavelengthReveal } from '@lbq/shared';
import { Avatar } from '../components/Avatar';
import { WavelengthScale } from '../components/WavelengthScale';
import { closestNeedles } from '../lib/wavelength';

/** QUESTION_INTRO: « 🔮 X va donner l’indice ». */
export function WavelengthIntroLine({ question }: { question: QuestionShowPayload | null }) {
  const psychic = question?.wavelength?.psychic;
  if (!psychic) return null;
  return (
    <motion.p
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.3 }}
      className="flex items-center gap-4 rounded-2xl bg-panel px-8 py-4 text-4xl font-black"
    >
      <span aria-hidden="true">🔮</span>
      <Avatar id={psychic.avatar} size="md" />
      {psychic.nickname} va voir la cible et donner un indice !
    </motion.p>
  );
}

/**
 * « Sur la même longueur d'onde » (T62) on the TV. Clue stage: the scale and who is looking for a
 * clue (never the target). Guess stage: the clue, big, above the scale. Reveal: the target with
 * its bands, every needle with its avatar, « 🎯 Pile dessus ! ».
 */
export function WavelengthStage({
  question,
  reveal,
  instant,
  media,
}: {
  question: QuestionShowPayload;
  reveal: WavelengthReveal | undefined;
  instant: boolean;
  /** Picture / sound badge of the question, shown before the reveal. */
  media?: ReactNode;
}) {
  if (reveal) return <WavelengthRevealView reveal={reveal} instant={instant} />;
  const w = question.wavelength;
  if (!w) return null;
  return (
    <div
      className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-6"
      data-testid="wavelength-stage"
    >
      {media}
      {w.stage === 'clue' ? (
        <motion.p
          initial={instant ? false : { scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="flex items-center gap-4 rounded-2xl bg-panel px-8 py-4 text-center text-4xl font-black"
        >
          {w.psychic && <Avatar id={w.psychic.avatar} size="md" />}
          🔮 {w.psychic?.nickname ?? 'Le médium'} cherche un indice…
        </motion.p>
      ) : (
        <motion.div
          initial={instant ? false : { scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 16 }}
          className="flex max-w-full flex-col items-center gap-2"
        >
          <span className="flex items-center gap-3 text-2xl font-bold opacity-90">
            {w.psychic && <Avatar id={w.psychic.avatar} size="sm" />}
            L’indice de {w.psychic?.nickname ?? 'du médium'} :
          </span>
          <span
            className="max-w-full rounded-2xl bg-white px-10 py-4 text-center text-5xl font-black break-words text-brand shadow-lg"
            data-testid="wavelength-clue"
          >
            « {w.clue} »
          </span>
          <span className="text-2xl font-semibold opacity-85">
            Placez l’aiguille sur vos téléphones !
          </span>
        </motion.div>
      )}
      <div className="w-full max-w-6xl px-6">
        <WavelengthScale spectrum={w.spectrum} instant={instant} />
      </div>
    </div>
  );
}

function WavelengthRevealView({ reveal, instant }: { reveal: WavelengthReveal; instant: boolean }) {
  const best = new Set(closestNeedles(reveal));
  const bestNames = reveal.needles.filter((n) => best.has(n.id)).map((n) => n.nickname);
  // Needles are sorted closest first.
  const first = reveal.needles[0];
  const onTarget = !!first && Math.abs(first.value - reveal.target) <= WAVELENGTH_BANDS[0].distance;
  return (
    <div
      className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-4"
      data-testid="wavelength-reveal"
    >
      <p className="max-w-full text-center text-3xl font-black break-words">
        {reveal.clue === null ? (
          <>🔮 {reveal.psychic?.nickname ?? 'Le médium'} n’a pas donné d’indice</>
        ) : (
          <>
            {reveal.psychic && (
              <Avatar id={reveal.psychic.avatar} size="sm" className="mr-2 align-middle" />
            )}
            « {reveal.clue} »
          </>
        )}
      </p>
      <div className="w-full max-w-6xl px-6">
        <WavelengthScale
          spectrum={reveal.spectrum}
          target={reveal.target}
          needles={reveal.needles.map((n) => ({ ...n, best: best.has(n.id) }))}
          instant={instant}
        />
      </div>
      <motion.p
        initial={instant ? false : { y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: instant ? 0 : 1.2 }}
        className="rounded-2xl bg-panel px-6 py-2 text-center text-2xl font-black"
        data-testid="wavelength-summary"
      >
        {reveal.clue === null
          ? 'Personne ne marque sur cette question'
          : bestNames.length === 0
            ? 'Personne n’a placé d’aiguille'
            : `${onTarget ? '🎯 Pile dessus' : '👏 Le plus proche'} : ${bestNames.join(', ')}`}
        {reveal.psychic &&
          reveal.clue !== null &&
          ` · 🔮 ${reveal.psychic.nickname} : + ${reveal.psychicPoints} pts`}
      </motion.p>
    </div>
  );
}
