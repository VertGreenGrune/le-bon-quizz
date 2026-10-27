import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { BuzzerReveal, BuzzerStatus, LobbyMember } from '@lbq/shared';
import { Avatar } from '../components/Avatar';

/**
 * « Buzzer » question on the TV, while answering: « Buzzez ! », then who has the hand (avatar,
 * big) with the host's ✅ / ❌ — the answer stays hidden unless the host asks for it.
 */
export function BuzzerPanel({
  status,
  answer,
  instant,
  onJudge,
}: {
  status: BuzzerStatus | null;
  /** The right answer in words (`question:show.buzzer.answer`). */
  answer: string[];
  instant: boolean;
  onJudge: (correct: boolean) => void;
}) {
  const holder = status?.holder ?? null;
  const wrong = status?.wrong ?? [];
  return (
    <div className="flex w-full flex-col items-center gap-5" data-testid="buzzer-panel">
      <AnimatePresence mode="wait">
        {holder ? (
          <motion.div
            key={holder.id}
            initial={instant ? false : { scale: 0.4, opacity: 0, rotate: -6 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 16 }}
            className="flex flex-col items-center gap-4 rounded-3xl bg-answer-yellow px-12 py-6 text-center text-black shadow-2xl"
            data-testid="buzzer-holder"
          >
            <motion.span
              animate={{ rotate: [-12, 12, -12] }}
              transition={{ duration: 0.4, repeat: 3 }}
              className="text-6xl"
              aria-hidden="true"
            >
              🔔
            </motion.span>
            <Avatar id={holder.avatar} size="xl" className="ring-4 ring-white" />
            <p className="text-5xl font-black">{holder.nickname} a buzzé !</p>
            <p className="text-2xl font-bold">Réponds à voix haute…</p>
            <JudgeButtons key={holder.id} answer={answer} onJudge={onJudge} />
          </motion.div>
        ) : (
          <motion.div
            key="buzz"
            initial={instant ? false : { y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-2 rounded-2xl bg-panel px-10 py-6 text-center"
          >
            <motion.span
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ duration: 0.9, repeat: Infinity }}
              className="text-7xl"
              aria-hidden="true"
            >
              🔔
            </motion.span>
            <p className="text-4xl font-black">Buzzez sur vos téléphones !</p>
            <p className="text-xl font-semibold opacity-80">Le plus rapide répond à voix haute</p>
          </motion.div>
        )}
      </AnimatePresence>
      {wrong.length > 0 && <WrongList players={wrong} label="Éliminés pour cette question" />}
    </div>
  );
}

/** ✅ / ❌ for the host, and « 👁 Voir la réponse » (hidden by default: the players see the TV). */
function JudgeButtons({
  answer,
  onJudge,
}: {
  answer: string[];
  onJudge: (correct: boolean) => void;
}) {
  const [peek, setPeek] = useState(false);
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex gap-4">
        <button
          type="button"
          onClick={() => onJudge(true)}
          className="rounded-2xl bg-answer-green px-8 py-4 text-3xl font-black text-white shadow-[inset_0_-6px_0_rgba(0,0,0,0.25)] hover:brightness-110"
        >
          ✅ Bonne réponse
        </button>
        <button
          type="button"
          onClick={() => onJudge(false)}
          className="rounded-2xl bg-answer-red px-8 py-4 text-3xl font-black text-white shadow-[inset_0_-6px_0_rgba(0,0,0,0.25)] hover:brightness-110"
        >
          ❌ Mauvaise réponse
        </button>
      </div>
      {answer.length > 0 &&
        (peek ? (
          <button
            type="button"
            onClick={() => setPeek(false)}
            className="rounded-lg bg-black/15 px-4 py-1 text-lg font-bold"
            data-testid="buzzer-answer"
          >
            {answer.join(' · ')} <span className="opacity-60">(masquer)</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setPeek(true)}
            className="rounded-lg border-2 border-black/30 px-4 py-1 text-lg font-bold hover:bg-black/10"
          >
            👁 Voir la réponse (animateur)
          </button>
        ))}
    </div>
  );
}

function WrongList({ players, label }: { players: LobbyMember[]; label: string }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3" data-testid="buzzer-wrong">
      <span className="text-xl font-bold opacity-80">❌ {label} :</span>
      {players.map((p) => (
        <span
          key={p.id}
          className="flex items-center gap-2 rounded-full bg-panel py-1 pr-4 pl-1 text-xl font-bold line-through decoration-2"
        >
          <Avatar id={p.avatar} size="sm" className="grayscale" />
          {p.nickname}
        </span>
      ))}
    </div>
  );
}

/** « Buzzer » reveal: the answer, who found it (or nobody), who got it wrong. */
export function BuzzerRevealView({ reveal, instant }: { reveal: BuzzerReveal; instant: boolean }) {
  const { winner } = reveal;
  return (
    <div className="flex w-full flex-col items-center gap-5" data-testid="buzzer-reveal">
      <motion.div
        initial={instant ? false : { scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="flex flex-col items-center gap-1 rounded-2xl bg-answer-green px-10 py-5 text-center shadow-lg"
      >
        <span className="text-xl font-bold opacity-90">La réponse</span>
        {reveal.answer.map((line) => (
          <span key={line} className="text-4xl font-black">
            {line}
          </span>
        ))}
      </motion.div>
      {winner ? (
        <motion.p
          initial={instant ? false : { y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: instant ? 0 : 0.3 }}
          className="flex items-center gap-4 text-4xl font-black"
        >
          <Avatar id={winner.avatar} size="lg" className="ring-4 ring-answer-yellow" />
          🏆 {winner.nickname} a trouvé !
        </motion.p>
      ) : (
        <p className="text-3xl font-black opacity-90">Personne n’a trouvé…</p>
      )}
      {reveal.wrong.length > 0 && <WrongList players={reveal.wrong} label="Raté" />}
    </div>
  );
}
