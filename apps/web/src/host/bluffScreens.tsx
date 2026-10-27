import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { BluffOption, LobbyMember, QuestionShowPayload } from '@lbq/shared';
import { Avatar } from '../components/Avatar';

/** Option letters, the same as on the phones. */
const letter = (i: number) => String.fromCharCode(65 + i);

/** Time each answer stays alone in the spotlight at the reveal. */
export const BLUFF_STEP_MS = 2600;

/** « Mytho ! » while answering: write your lie, then the options to vote for. */
export function BluffHint({
  question,
  instant,
}: {
  question: QuestionShowPayload;
  instant: boolean;
}) {
  const bluff = question.bluff;
  if (!bluff) return null;
  if (bluff.stage === 'write')
    return (
      <motion.div
        initial={instant ? false : { scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="flex flex-col items-center gap-3 text-center"
      >
        <motion.p
          className="text-8xl"
          animate={{ rotate: [0, -8, 8, 0] }}
          transition={{ duration: 1.6, repeat: Infinity }}
          aria-hidden="true"
        >
          🤥
        </motion.p>
        <p className="rounded-2xl bg-panel px-8 py-4 text-4xl font-black">
          Inventez un mytho crédible sur votre téléphone !
        </p>
        <p className="text-2xl font-semibold opacity-80">
          Des points pour chaque joueur qui tombera dans le piège.
        </p>
      </motion.div>
    );
  return (
    <div className="flex w-full max-w-5xl flex-col gap-3">
      <p className="text-center text-3xl font-black">Laquelle est la vraie réponse ?</p>
      <div className="grid grid-cols-2 gap-3">
        {bluff.options.map((text, i) => (
          <motion.div
            key={i}
            initial={instant ? false : { y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: i * 0.12 }}
            className="flex items-center gap-4 rounded-2xl bg-white px-5 py-3 text-3xl font-black text-brand shadow-lg"
          >
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand text-white">
              {letter(i)}
            </span>
            <span className="min-w-0 break-words">{text}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/**
 * « Mytho ! » reveal: one answer at a time — the lies that fooled the fewest first, then the
 * truth — with who wrote it and who fell for it. A reload shows everything at once.
 */
export function BluffReveal({
  bluff,
  instant,
}: {
  bluff: { truth: string; options: BluffOption[] };
  instant: boolean;
}) {
  const total = bluff.options.length;
  const [shown, setShown] = useState(instant ? total : 1);
  useEffect(() => {
    if (shown >= total) return;
    const id = setTimeout(() => setShown((n) => n + 1), BLUFF_STEP_MS);
    return () => clearTimeout(id);
  }, [shown, total]);
  const current = bluff.options[shown - 1];
  const past = bluff.options.slice(0, shown - 1);

  return (
    <div className="flex w-full max-w-6xl flex-col items-center gap-4" data-testid="bluff-reveal">
      <AnimatePresence mode="wait">
        {current && (
          <motion.div
            key={shown}
            initial={instant ? false : { scale: 0.5, rotate: -4, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18 }}
            data-testid="bluff-spotlight"
            className={`flex w-full flex-col items-center gap-3 rounded-3xl px-8 py-5 text-center shadow-2xl ${
              current.truth ? 'bg-answer-green text-white' : 'bg-white text-brand'
            }`}
          >
            <p className="text-2xl font-black uppercase opacity-80">
              {current.truth ? '✅ La vérité' : '🤥 Mytho !'}
            </p>
            <p className="text-5xl font-black">{current.text}</p>
            {!current.truth && <People label="Écrit par" people={current.authors} />}
            <People
              label={current.truth ? 'Trouvé par' : 'Se sont fait avoir'}
              people={current.voters}
              none={current.truth ? 'Personne n’a trouvé !' : 'Personne ne s’est fait avoir'}
            />
          </motion.div>
        )}
      </AnimatePresence>
      {past.length > 0 && (
        <ul className="flex flex-wrap justify-center gap-2">
          {past.map((o) => (
            <li
              key={o.text}
              className="flex items-center gap-2 rounded-full bg-panel px-4 py-1 text-xl font-bold"
            >
              <span className="line-through decoration-answer-red decoration-4">{o.text}</span>
              <span className="opacity-80">
                · {o.authors.map((a) => a.nickname).join(', ')} · {o.voters.length} piégé
                {o.voters.length > 1 ? 's' : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function People({ label, people, none }: { label: string; people: LobbyMember[]; none?: string }) {
  if (people.length === 0) return none ? <p className="text-2xl font-bold">{none}</p> : null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 text-2xl font-bold">
      <span className="opacity-80">{label} :</span>
      {people.map((p, i) => (
        <motion.span
          key={p.id}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.4 + i * 0.12, type: 'spring', stiffness: 400, damping: 14 }}
          className="flex items-center gap-2"
        >
          <Avatar id={p.avatar} size="md" />
          {p.nickname}
        </motion.span>
      ))}
    </div>
  );
}
