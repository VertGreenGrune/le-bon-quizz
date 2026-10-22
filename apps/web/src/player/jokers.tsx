import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  JOKERS,
  JOKER_STREAK_STEP,
  type JokerResult,
  type JokerType,
  type LobbyMember,
} from '@lbq/shared';
import { Avatar } from '../components/Avatar';
import {
  announcement,
  eligibleTargets,
  jokerPlayable,
  noJokersHere,
  resultLine,
} from '../lib/jokers';
import { sendAnswer, playJoker } from './playerStore';
import { jokerEffects, myTeam, type PlayerScreen, type PlayerState } from './playerState';

/** Phone, games with jokers: the hand at the bottom of the "get ready" / answer screens. */
export function JokerBar({ s, screen }: { s: PlayerState; screen: PlayerScreen }) {
  const [open, setOpen] = useState<JokerType | null>(null);
  const j = s.jokers;
  const visible =
    s.jokerGame &&
    j !== null &&
    j.questionIndex === s.questionIndex &&
    (screen === 'getReady' || screen === 'answer') &&
    !s.paused &&
    !noJokersHere(j);
  // A new question / the answer sent closes the sheet.
  useEffect(() => setOpen(null), [s.questionIndex, visible]);
  if (!visible || !j) return null;

  if (j.played) {
    const info = JOKERS[j.played.joker];
    return (
      <div
        data-testid="joker-bar"
        className="flex items-center justify-center gap-2 bg-black/30 px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-sm font-bold"
      >
        <span className="text-xl" aria-hidden="true">
          {info.icon}
        </span>
        Joker joué : {info.name}
        {j.played.target && <> → {j.played.target.nickname}</>}
      </div>
    );
  }

  return (
    <>
      <div
        data-testid="joker-bar"
        className="flex items-center gap-2 overflow-x-auto bg-black/30 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      >
        <span className="shrink-0 text-xs font-black uppercase opacity-80">
          Jokers{j.shield && ' · 🛡️'}
        </span>
        {j.hand.length === 0 && (
          <span className="text-xs font-semibold opacity-80">
            Plus de joker : {JOKER_STREAK_STEP} bonnes réponses d'affilée pour en gagner un
          </span>
        )}
        {j.hand.map((joker, i) => {
          const playable = jokerPlayable(j, joker);
          return (
            <motion.button
              key={`${joker}-${i}`}
              type="button"
              whileTap={{ scale: 0.9 }}
              disabled={!playable}
              onClick={() => setOpen(joker)}
              aria-label={`Joker ${JOKERS[joker].name}`}
              className="flex shrink-0 touch-manipulation flex-col items-center rounded-xl bg-white/90 px-2 py-1 text-brand shadow disabled:opacity-35"
            >
              <span className="text-2xl leading-none" aria-hidden="true">
                {JOKERS[joker].icon}
              </span>
              <span className="text-[0.65rem] font-black">{JOKERS[joker].name}</span>
            </motion.button>
          );
        })}
      </div>
      <AnimatePresence>
        {open && <JokerSheet s={s} joker={open} onClose={() => setOpen(null)} />}
      </AnimatePresence>
    </>
  );
}

/** What the joker does, then « Jouer » or a target to tap. */
function JokerSheet({
  s,
  joker,
  onClose,
}: {
  s: PlayerState;
  joker: JokerType;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const info = JOKERS[joker];
  const targets = eligibleTargets(s.jokers!, joker, myTeam(s)?.id ?? null);
  const play = async (target?: LobbyMember) => {
    setBusy(true);
    const err = await playJoker(joker, target?.id);
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
        aria-label={`Joker ${info.name}`}
        initial={{ y: 200 }}
        animate={{ y: 0 }}
        exit={{ y: 200 }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80dvh] w-full flex-col gap-3 overflow-y-auto rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-gray-900"
      >
        <p className="text-center text-5xl" aria-hidden="true">
          {info.icon}
        </p>
        <h2 className="text-center text-2xl font-black">{info.name}</h2>
        <p className="text-center font-semibold text-gray-600">{info.description}</p>
        {info.target ? (
          <>
            <p className="font-black">{joker === 'copy' ? 'Qui copier ?' : 'Sur qui ?'}</p>
            {targets.length === 0 && (
              <p className="text-sm text-gray-500">Personne à viser sur cette question.</p>
            )}
            <div className="grid grid-cols-3 gap-2">
              {targets.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  disabled={busy}
                  onClick={() => void play(t)}
                  className="flex touch-manipulation flex-col items-center gap-1 rounded-xl border-2 border-gray-200 p-2 font-bold active:border-brand"
                >
                  <Avatar id={t.avatar} size="md" />
                  <span className="max-w-full truncate text-sm">{t.nickname}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void play()}
            className="touch-manipulation rounded-2xl bg-answer-green py-4 text-2xl font-black text-white shadow-[inset_0_-6px_0_rgba(0,0,0,0.25)]"
          >
            Jouer
          </button>
        )}
        {error && <p className="text-center font-bold text-answer-red">{error}</p>}
        <button type="button" onClick={onClose} className="py-2 font-bold text-gray-500">
          Annuler
        </button>
      </motion.div>
    </motion.div>
  );
}

/** Gel: over the answer controls while the player is frozen (pauses excluded). */
export function FrozenOverlay({ s }: { s: PlayerState }) {
  const frozen = jokerEffects(s).frozen;
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!frozen) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [frozen]);
  if (!frozen || s.phase !== 'ANSWERING' || !s.prompt) return null;
  const limitMs = s.prompt.timeLimitSec * 1000;
  const left =
    s.paused && s.frozenMs !== null
      ? s.frozenMs
      : s.answeringEndsAt !== null
        ? s.answeringEndsAt - now
        : limitMs;
  const frozenLeft = frozen.ms - (limitMs - left);
  if (frozenLeft <= 0) return null;
  return (
    <div
      role="status"
      data-testid="frozen-overlay"
      className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-sky-300/85 p-6 text-center text-sky-950"
    >
      <motion.p
        className="text-8xl"
        animate={{ rotate: [0, -6, 6, 0] }}
        transition={{ duration: 0.6, repeat: Infinity }}
        aria-hidden="true"
      >
        🥶
      </motion.p>
      <h2 className="text-3xl font-black">Gelé par {frozen.by.nickname} !</h2>
      <p className="text-7xl font-black tabular-nums">{Math.ceil(frozenLeft / 1000)}</p>
    </div>
  );
}

/** Copieur played: no buttons, the answer comes from the target. */
export function CopyWaiting({ target }: { target: LobbyMember }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
      <p className="text-7xl" aria-hidden="true">
        🦜
      </p>
      <h2 className="text-3xl font-black">Tu copies {target.nickname}</h2>
      <Avatar id={target.avatar} size="xl" className="ring-4 ring-white" />
      <p className="text-lg font-semibold opacity-85">Sa réponse sera la tienne, 1 s plus tard…</p>
    </div>
  );
}

/** Brouilleur: grey buttons in a shuffled order, with the choice texts (read the TV!). */
export function ScrambledButtons({
  choices,
  by,
  hidden = [],
}: {
  choices: { index: number; text: string }[];
  by: LobbyMember;
  hidden?: number[];
}) {
  return (
    <div className="flex flex-1 flex-col gap-3 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <p className="text-center text-sm font-black">
        🌀 Brouillé par {by.nickname} : lis l'écran !
      </p>
      {choices.map((c) => (
        <motion.button
          key={c.index}
          type="button"
          whileTap={{ scale: 0.95 }}
          disabled={hidden.includes(c.index)}
          onClick={() => sendAnswer({ choiceIndex: c.index })}
          className="flex flex-1 touch-manipulation items-center justify-center rounded-2xl bg-gray-500 px-4 text-2xl font-black shadow-[inset_0_-6px_0_rgba(0,0,0,0.25)] disabled:opacity-20"
        >
          {c.text}
        </motion.button>
      ))}
    </div>
  );
}

/** Result screen: what the jokers did on this question. */
export function JokerResultLines({ results }: { results: JokerResult[] }) {
  return (
    <ul className="flex flex-col gap-1 text-center font-bold" data-testid="joker-results">
      {results.map((r, i) => (
        <motion.li
          key={i}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.4 + i * 0.15 }}
          className="rounded-full bg-black/25 px-4 py-1"
        >
          {resultLine(r)}
        </motion.li>
      ))}
    </ul>
  );
}

const TOAST_MS = 3500;

/** Someone played a joker: a toast at the top (bigger when it targets this phone). */
export function JokerToast({ s }: { s: PlayerState }) {
  const news = s.jokerNews;
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!news) return;
    const left = news.at + TOAST_MS - Date.now();
    const id = setTimeout(() => setTick((t) => t + 1), Math.max(0, left));
    return () => clearTimeout(id);
  }, [news]);
  const show = news !== null && Date.now() - news.at < TOAST_MS;
  const mine = news?.target?.id === s.playerId;
  return (
    <AnimatePresence>
      {show && news && (
        <motion.div
          key={news.at}
          role="status"
          data-testid="joker-toast"
          initial={{ y: -80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -80, opacity: 0 }}
          className={`fixed inset-x-3 top-14 z-30 rounded-2xl px-4 py-3 text-center font-black shadow-xl ${
            mine && !news.blocked ? 'bg-answer-red text-white' : 'bg-white text-brand'
          }`}
        >
          {announcement(news).title}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
