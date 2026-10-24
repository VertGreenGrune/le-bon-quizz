import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { HAUNTS, type HauntType, type PlayerResultPayload, type SurvivalPlayer } from '@lbq/shared';
import { Avatar } from '../components/Avatar';
import { heartsText, survivors } from '../lib/survival';
import { mySurvival, type PlayerScreen, type PlayerState } from './playerState';
import { hauntPlayer } from './playerStore';

/** Header: own hearts (« ❤️❤️🖤 ») or 👻. */
export function HeartsBadge({ s }: { s: PlayerState }) {
  const me = mySurvival(s);
  if (!me || !s.survival) return null;
  return (
    <motion.span
      key={me.hearts}
      initial={{ scale: 1.6 }}
      animate={{ scale: 1 }}
      className="shrink-0 text-xs"
      data-testid="my-hearts"
      aria-label={me.hearts > 0 ? `${me.hearts} cœur${me.hearts > 1 ? 's' : ''}` : 'Fantôme'}
    >
      {me.hearts > 0 ? heartsText(me.hearts, s.survival.hearts) : '👻 Fantôme'}
    </motion.span>
  );
}

/** Result screen: what the question did to the hearts. */
export function SurvivalResultLine({
  survival,
  max,
}: {
  survival: NonNullable<PlayerResultPayload['survival']>;
  max: number;
}) {
  const text = survival.eliminated
    ? '💀 Dernier cœur perdu : tu deviens un fantôme !'
    : survival.ghost
      ? survival.hauntEarned
        ? '👻 Bonne réponse : tu peux hanter un vivant !'
        : '👻 Fantôme : réponds juste pour hanter les vivants'
      : survival.lostHeart
        ? `💔 Un cœur en moins : ${heartsText(survival.hearts, max)}`
        : `Toujours en vie : ${heartsText(survival.hearts, max)}`;
  return (
    <motion.p
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 0.35, type: 'spring', stiffness: 300, damping: 14 }}
      className="rounded-full bg-black/25 px-4 py-1 font-black"
      data-testid="survival-result"
    >
      {text}
    </motion.p>
  );
}

/** How long the « éliminé » screen covers the result. */
const ELIMINATED_MS = 4500;

/** The player just lost their last heart: a dramatic full screen (tap or wait to close). */
export function EliminatedOverlay({ s }: { s: PlayerState }) {
  const eliminated = s.phase === 'REVEAL' && !!s.result?.survival?.eliminated;
  const [closedFor, setClosedFor] = useState<number | null>(null);
  useEffect(() => {
    if (!eliminated) return;
    const index = s.questionIndex;
    const id = setTimeout(() => setClosedFor(index), ELIMINATED_MS);
    return () => clearTimeout(id);
  }, [eliminated, s.questionIndex]);
  const open = eliminated && closedFor !== s.questionIndex;
  return (
    <AnimatePresence>
      {open && (
        <motion.button
          type="button"
          data-testid="eliminated-overlay"
          onClick={() => setClosedFor(s.questionIndex)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-gray-950 p-6 text-center"
        >
          <motion.p
            initial={{ scale: 3, opacity: 0, rotate: -15 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 220, damping: 12 }}
            className="text-5xl font-black text-answer-red"
          >
            💀 Éliminé !
          </motion.p>
          {s.avatar && (
            <motion.div
              initial={{ filter: 'grayscale(0)' }}
              animate={{ filter: 'grayscale(1)', opacity: 0.6 }}
              transition={{ delay: 0.6, duration: 0.8 }}
            >
              <Avatar id={s.avatar} size="xl" className="ring-4 ring-white" />
            </motion.div>
          )}
          <motion.p
            className="text-7xl"
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: [30, -10, 0], opacity: 1 }}
            transition={{ delay: 1, duration: 1 }}
            aria-hidden="true"
          >
            👻
          </motion.p>
          <h2 className="text-3xl font-black">Tu deviens un fantôme</h2>
          <p className="text-lg font-semibold opacity-85">
            Continue à répondre : chaque bonne réponse te permet de hanter un vivant (Gel ou
            Brouilleur).
          </p>
          <p className="text-sm opacity-60">Touche l’écran pour continuer</p>
        </motion.button>
      )}
    </AnimatePresence>
  );
}

/** Screens where a ghost may use a haunt (not while answering). */
const HAUNT_SCREENS: PlayerScreen[] = [
  'getReady',
  'answered',
  'waitingResult',
  'result',
  'standings',
];

/** A ghost with haunts in stock: « 👻 Hanter un vivant » at the bottom, opens the sheet. */
export function HauntBar({ s, screen }: { s: PlayerState; screen: PlayerScreen }) {
  const [open, setOpen] = useState(false);
  const me = mySurvival(s);
  const haunts = me && me.hearts === 0 ? (me.haunts ?? 0) : 0;
  const visible = haunts > 0 && HAUNT_SCREENS.includes(screen) && !s.paused;
  useEffect(() => {
    if (!visible) setOpen(false);
  }, [visible]);
  if (!visible) return null;
  return (
    <>
      <motion.button
        type="button"
        data-testid="haunt-button"
        initial={{ y: 60 }}
        animate={{ y: 0 }}
        onClick={() => setOpen(true)}
        className="touch-manipulation bg-purple-900 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-lg font-black"
      >
        👻 Hanter un vivant{haunts > 1 && ` (${haunts})`}
      </motion.button>
      <AnimatePresence>
        {open && (
          <HauntSheet
            targets={survivors(s.survival).filter((p) => p.id !== s.playerId)}
            onClose={() => setOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/** Pick Gel or Brouilleur, then a living player. */
function HauntSheet({ targets, onClose }: { targets: SurvivalPlayer[]; onClose: () => void }) {
  const [haunt, setHaunt] = useState<HauntType>('freeze');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async (target: SurvivalPlayer) => {
    setBusy(true);
    const err = await hauntPlayer(haunt, target.id);
    setBusy(false);
    if (err) setError(err);
    else onClose();
  };
  return (
    <motion.div
      className="fixed inset-0 z-40 flex items-end bg-black/60"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Hanter un vivant"
        initial={{ y: 200 }}
        animate={{ y: 0 }}
        exit={{ y: 200 }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80dvh] w-full flex-col gap-3 overflow-y-auto rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-gray-900"
      >
        <p className="text-center text-5xl" aria-hidden="true">
          👻
        </p>
        <h2 className="text-center text-2xl font-black">Hanter un vivant</h2>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(HAUNTS) as HauntType[]).map((h) => (
            <button
              key={h}
              type="button"
              aria-pressed={haunt === h}
              onClick={() => setHaunt(h)}
              className={`flex flex-col items-center rounded-xl border-2 p-2 font-black ${
                haunt === h ? 'border-purple-700 bg-purple-100' : 'border-gray-200'
              }`}
            >
              <span className="text-3xl" aria-hidden="true">
                {HAUNTS[h].icon}
              </span>
              {HAUNTS[h].name}
            </button>
          ))}
        </div>
        <p className="text-center text-sm font-semibold text-gray-600">
          {HAUNTS[haunt].description}
        </p>
        <p className="font-black">Qui hanter ?</p>
        {targets.length === 0 && <p className="text-sm text-gray-500">Plus personne en vie.</p>}
        <div className="grid grid-cols-3 gap-2">
          {targets.map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={busy}
              onClick={() => void go(t)}
              className="flex touch-manipulation flex-col items-center gap-1 rounded-xl border-2 border-gray-200 p-2 font-bold active:border-purple-700"
            >
              <Avatar id={t.avatar} size="md" />
              <span className="max-w-full truncate text-sm">{t.nickname}</span>
            </button>
          ))}
        </div>
        {error && <p className="text-center font-bold text-answer-red">{error}</p>}
        <button type="button" onClick={onClose} className="py-2 font-bold text-gray-500">
          Annuler
        </button>
      </motion.div>
    </motion.div>
  );
}
