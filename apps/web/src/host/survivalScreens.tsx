import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { SurvivalStatePayload } from '@lbq/shared';
import { Avatar } from '../components/Avatar';
import { eliminatedAt, heartsText, survivors } from '../lib/survival';
import { playSound } from './sounds';

/** How long the « éliminé » moment stays over the leaderboard. */
export const ELIMINATION_MS = 4200;

/** Header: « 💀 Survie · 3 en vie ». */
export function SurvivalBadge({ survival }: { survival: SurvivalStatePayload }) {
  const alive = survivors(survival).length;
  return (
    <span className="rounded bg-white/15 px-2" title={`Survie : ${survival.hearts} ❤️ au départ`}>
      💀 Survie · {alive} en vie
    </span>
  );
}

/** Hearts of one player: ❤️❤️🖤, 👻 for a ghost; `lostNow` = a heart was lost on this question. */
export function Hearts({
  hearts,
  max,
  lostNow = false,
  className = '',
}: {
  hearts: number;
  max: number;
  lostNow?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`flex shrink-0 items-center gap-1 ${className}`}
      aria-label={hearts > 0 ? `${hearts} cœur${hearts > 1 ? 's' : ''}` : 'Fantôme'}
      data-testid="hearts"
    >
      {hearts > 0 ? heartsText(hearts, max) : '👻'}
      {lostNow && hearts > 0 && (
        <motion.span
          initial={{ scale: 2, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.8, type: 'spring', stiffness: 300, damping: 12 }}
          aria-hidden="true"
        >
          💔
        </motion.span>
      )}
    </span>
  );
}

/**
 * Over the leaderboard, right after a question: the players who just lost their last heart
 * (« 💀 Éliminé ! », they turn grey and a ghost flies off), then the last survivor if the game is
 * over. Not shown after a reload (`instant`).
 */
export function EliminationMoment({
  survival,
  questionIndex,
}: {
  survival: SurvivalStatePayload;
  questionIndex: number;
}) {
  const out = eliminatedAt(survival, questionIndex);
  const alive = survivors(survival);
  const winner = survival.finished && alive.length === 1 ? alive[0] : undefined;
  const nobodyLeft = !!survival.finished && alive.length === 0;
  const show = out.length > 0 || !!winner || nobodyLeft;
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (!show) return;
    playSound('eliminated');
    const id = setTimeout(() => setVisible(false), ELIMINATION_MS);
    return () => clearTimeout(id);
    // Once per leaderboard (the component is mounted per question).
  }, []);

  return (
    <AnimatePresence>
      {show && visible && (
        <motion.div
          role="status"
          data-testid="elimination-moment"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="pointer-events-none fixed inset-0 z-40 flex flex-col items-center justify-center gap-10 bg-gray-950/85 p-8 text-center"
        >
          {out.length > 0 && (
            <>
              <motion.h2
                initial={{ scale: 3, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 12 }}
                className="text-8xl font-black text-answer-red drop-shadow-lg"
              >
                💀 Éliminé{out.length > 1 ? 's' : ''} !
              </motion.h2>
              <div className="flex flex-wrap justify-center gap-12">
                {out.map((p, i) => (
                  <div key={p.id} className="relative flex flex-col items-center gap-4">
                    <motion.div
                      initial={{ filter: 'grayscale(0)', scale: 1.1 }}
                      animate={{ filter: 'grayscale(1)', scale: 1, opacity: 0.6 }}
                      transition={{ delay: 0.6 + i * 0.3, duration: 0.8 }}
                    >
                      <Avatar id={p.avatar} size="xl" className="ring-4 ring-white" />
                    </motion.div>
                    <motion.span
                      className="absolute -top-6 text-7xl"
                      initial={{ y: 40, opacity: 0 }}
                      animate={{ y: [-10, -80], opacity: [0, 1, 0.8] }}
                      transition={{ delay: 1 + i * 0.3, duration: 1.8, ease: 'easeOut' }}
                      aria-hidden="true"
                    >
                      👻
                    </motion.span>
                    <span className="text-4xl font-black">{p.nickname}</span>
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 1.2 + i * 0.3 }}
                      className="text-2xl font-semibold opacity-80"
                    >
                      devient un fantôme 👻
                    </motion.span>
                  </div>
                ))}
              </div>
            </>
          )}
          {(winner || nobodyLeft) && (
            <motion.p
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: out.length > 0 ? 2 : 0.2, type: 'spring' }}
              className="flex items-center gap-4 rounded-3xl bg-white px-10 py-5 text-5xl font-black text-brand shadow-2xl"
            >
              {winner ? (
                <>
                  🏆 <Avatar id={winner.avatar} size="lg" /> {winner.nickname} est le dernier
                  survivant !
                </>
              ) : (
                'Plus aucun survivant !'
              )}
            </motion.p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
