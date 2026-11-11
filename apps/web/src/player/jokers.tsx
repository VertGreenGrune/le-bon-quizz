import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  JOKERS,
  JOKER_STREAK_STEP,
  type JokerResult,
  type JokerType,
  type LobbyMember,
  type QuestionType,
} from '@lbq/shared';
import { Avatar } from '../components/Avatar';
import {
  announcement,
  answeredNow,
  eligibleTargets,
  jokerBlocked,
  jokerPlayable,
  noJokersHere,
  resultLine,
} from '../lib/jokers';
import { playJoker } from './playerStore';
import {
  bluffStage,
  colorsStage,
  jokerEffects,
  missingStage,
  myTeam,
  type PlayerScreen,
  type PlayerState,
} from './playerState';

/**
 * Answer screens that need the whole height (picture to tap, list to order, slider, text field,
 * avatar grid…): the hand collapses to a « 🃏 n » button in the header (T41), so it never covers
 * « Valider ». Shape-button screens keep the bar.
 */
const FULL_HEIGHT_TYPES = new Set<QuestionType>([
  'TYPE_ANSWER',
  'POINTLESS',
  'SLIDER',
  'ORDER',
  'PIN',
  'WHO_OF_US',
  'WORD_CLOUD',
]);

export type JokerBarMode = 'hidden' | 'bar' | 'chip';

/**
 * Where the hand shows: nowhere, as a bar at the bottom, or as a button in the header. It shows on
 * the "get ready" / answer screens and on « Réponse envoyée ! » while the others answer (T42).
 */
export function jokerBarMode(s: PlayerState, screen: PlayerScreen): JokerBarMode {
  const j = s.jokers;
  const visible =
    s.jokerGame &&
    j !== null &&
    j.questionIndex === s.questionIndex &&
    (screen === 'getReady' ||
      screen === 'answer' ||
      (screen === 'answered' && s.phase === 'ANSWERING')) &&
    !s.paused &&
    !noJokersHere(j);
  if (!visible) return 'hidden';
  if (screen !== 'answer') return 'bar';
  const type = s.prompt?.index === s.questionIndex ? s.prompt.type : undefined;
  const fullHeight =
    (type !== undefined && FULL_HEIGHT_TYPES.has(type)) ||
    bluffStage(s) === 'write' ||
    colorsStage(s) === 'answer' ||
    missingStage(s) === 'answer';
  return fullHeight ? 'chip' : 'bar';
}

/**
 * Phone, games with jokers: the hand at the bottom of the "get ready" / answer screens — big
 * during the intro (time to play one, T42) — and of the « Réponse envoyée ! » screen (the jokers
 * that still make sense after answering).
 */
export function JokerBar({ s, screen }: { s: PlayerState; screen: PlayerScreen }) {
  const [open, setOpen] = useState<JokerType | null>(null);
  const mode = jokerBarMode(s, screen);
  const j = s.jokers;
  const answered = !!j && answeredNow(j, s.playerId);
  // A new question / the answer sent closes the sheet.
  useEffect(() => setOpen(null), [s.questionIndex, mode, answered]);
  if (mode !== 'bar' || !j) return null;
  const big = screen === 'getReady';

  if (j.played) {
    return (
      <div
        data-testid="joker-bar"
        className="flex items-center justify-center gap-2 bg-black/30 px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-sm font-bold"
      >
        <PlayedJoker s={s} />
      </div>
    );
  }

  return (
    <>
      <div
        data-testid="joker-bar"
        className={`flex flex-col gap-1 bg-black/30 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] ${
          big ? 'pt-3' : 'pt-2'
        }`}
      >
        {(big || answered) && j.hand.length > 0 && (
          <p className={`text-center font-black ${big ? 'text-xl' : 'text-xs opacity-90'}`}>
            {big ? '🃏 Joue tes jokers !' : '🃏 Encore un joker en attendant les autres ?'}
          </p>
        )}
        <div className={`flex items-center overflow-x-auto ${big ? 'gap-3' : 'gap-2'}`}>
          {!big && (
            <span className="shrink-0 text-xs font-black uppercase opacity-80">
              Jokers{j.shield && ' · 🛡️'}
            </span>
          )}
          <JokerHand s={s} answered={answered} big={big} onPick={setOpen} />
        </div>
      </div>
      <AnimatePresence>
        {open && (
          <JokerSheet
            s={s}
            joker={open}
            blocked={jokerBlocked(j, open, answered)}
            onClose={() => setOpen(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * The hand as a small « 🃏 n » button in the phone header, on the answer screens that need the
 * whole height (`jokerBarMode` = `chip`): a tap opens the hand, then the usual joker sheet.
 */
export function JokerChip({ s, screen }: { s: PlayerState; screen: PlayerScreen }) {
  const [handOpen, setHandOpen] = useState(false);
  const [open, setOpen] = useState<JokerType | null>(null);
  const mode = jokerBarMode(s, screen);
  const j = s.jokers;
  const answered = !!j && answeredNow(j, s.playerId);
  useEffect(() => {
    setHandOpen(false);
    setOpen(null);
  }, [s.questionIndex, mode, answered]);
  if (mode !== 'chip' || !j) return null;

  const playable = !j.played && j.hand.some((joker) => jokerPlayable(j, joker, answered));
  return (
    <>
      <motion.button
        type="button"
        whileTap={{ scale: 0.9 }}
        onClick={() => setHandOpen(true)}
        aria-label={j.played ? `Joker joué : ${JOKERS[j.played.joker].name}` : 'Mes jokers'}
        data-testid="joker-chip"
        className={`flex items-center gap-1 rounded-full px-2 py-0.5 font-black ${
          playable ? 'bg-white text-brand shadow' : 'bg-white/25'
        }`}
      >
        <span aria-hidden="true">{j.played ? JOKERS[j.played.joker].icon : '🃏'}</span>
        {!j.played && <span className="tabular-nums">{j.hand.length}</span>}
      </motion.button>
      <AnimatePresence>
        {handOpen && (
          <BottomSheet label="Mes jokers" onClose={() => setHandOpen(false)}>
            <h2 className="text-center text-2xl font-black">🃏 Mes jokers{j.shield && ' · 🛡️'}</h2>
            {j.played ? (
              <p className="text-center font-bold">
                <PlayedJoker s={s} />
              </p>
            ) : (
              <div className="flex flex-wrap justify-center gap-2">
                <JokerHand
                  s={s}
                  answered={answered}
                  onPick={(joker) => {
                    setHandOpen(false);
                    setOpen(joker);
                  }}
                />
              </div>
            )}
            <button
              type="button"
              onClick={() => setHandOpen(false)}
              className="py-2 font-bold text-gray-500"
            >
              Fermer
            </button>
          </BottomSheet>
        )}
        {open && (
          <JokerSheet
            s={s}
            joker={open}
            blocked={jokerBlocked(j, open, answered)}
            onClose={() => setOpen(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function PlayedJoker({ s }: { s: PlayerState }) {
  const played = s.jokers?.played;
  if (!played) return null;
  const info = JOKERS[played.joker];
  return (
    <>
      <span className="text-xl" aria-hidden="true">
        {info.icon}
      </span>{' '}
      Joker joué : {info.name}
      {played.target && <> → {played.target.nickname}</>}
    </>
  );
}

/**
 * The joker buttons of the hand. A joker this question doesn't take is greyed but still tappable:
 * the sheet tells why (e.g. « Seulement avant de répondre », T42). Bigger during the intro.
 */
function JokerHand({
  s,
  answered,
  big = false,
  onPick,
}: {
  s: PlayerState;
  answered: boolean;
  big?: boolean;
  onPick: (joker: JokerType) => void;
}) {
  const j = s.jokers!;
  if (j.hand.length === 0)
    return (
      <span className="text-xs font-semibold opacity-80">
        Plus de joker : {JOKER_STREAK_STEP} bonnes réponses d'affilée pour en gagner un
      </span>
    );
  return (
    <>
      {j.hand.map((joker, i) => {
        const blocked = jokerBlocked(j, joker, answered);
        return (
          <motion.button
            key={`${joker}-${i}`}
            type="button"
            whileTap={{ scale: 0.9 }}
            data-blocked={blocked ?? undefined}
            onClick={() => onPick(joker)}
            aria-label={`Joker ${JOKERS[joker].name}`}
            className={`flex shrink-0 touch-manipulation flex-col items-center rounded-xl bg-white/90 text-brand shadow ring-1 ring-black/10 data-blocked:opacity-35 ${
              big ? 'min-w-20 px-3 py-2' : 'px-2 py-1'
            }`}
          >
            <span className={`leading-none ${big ? 'text-4xl' : 'text-2xl'}`} aria-hidden="true">
              {JOKERS[joker].icon}
            </span>
            <span className={`font-black ${big ? 'text-xs' : 'text-[0.65rem]'}`}>
              {JOKERS[joker].name}
            </span>
          </motion.button>
        );
      })}
    </>
  );
}

/** White sheet from the bottom of the phone screen, closed by a tap outside. */
function BottomSheet({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
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
        aria-label={label}
        initial={{ y: 200 }}
        animate={{ y: 0 }}
        exit={{ y: 200 }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80dvh] w-full flex-col gap-3 overflow-y-auto rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-gray-900"
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

/** What the joker does, then « Jouer » or a target to tap — or why it can't be played now. */
function JokerSheet({
  s,
  joker,
  blocked,
  onClose,
}: {
  s: PlayerState;
  joker: JokerType;
  blocked: string | null;
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
    <BottomSheet label={`Joker ${info.name}`} onClose={onClose}>
      <p className="text-center text-5xl" aria-hidden="true">
        {info.icon}
      </p>
      <h2 className="text-center text-2xl font-black">{info.name}</h2>
      <p className="text-center font-semibold text-gray-600">{info.description}</p>
      {blocked ? (
        <p
          data-testid="joker-blocked"
          className="rounded-xl bg-gray-100 px-4 py-3 text-center font-black text-gray-700"
        >
          🚫 {blocked}
        </p>
      ) : info.target ? (
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
    </BottomSheet>
  );
}

/** Gel: over the answer controls while the player is frozen (pauses excluded). */
export function FrozenOverlay({ s }: { s: PlayerState }) {
  // « Mytho ! »: the Gel only blocks the vote, not the writing of the lie.
  // « Couleurs perdues »: nor the memorizing (the Gel blocks the start of the answers).
  const frozen =
    bluffStage(s) === 'write' || colorsStage(s) === 'memo' || missingStage(s) === 'memo'
      ? undefined
      : jokerEffects(s).frozen;
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
