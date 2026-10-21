import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import {
  SHAPES,
  type QuestionRevealPayload,
  type QuestionShowPayload,
  type RankedPlayer,
  type RankedTeam,
} from '@lbq/shared';
import { Confetti, CountUp } from '../components/motion';
import { ShapeIcon, shapeBg } from '../components/shapes';
import { joinOrigins, joinUrl } from './joinUrl';
import { TICK_FROM_SEC } from './sounds';
import { TeamRanking } from './teamScreens';

// ---------- Lobby ----------

export function LobbyScreen({
  pin,
  players,
  onKick,
  teamLobby,
}: {
  pin: string;
  players: { id: string; nickname: string }[];
  onKick: (playerId: string) => void;
  /** Team mode: team columns, shown instead of the player list. */
  teamLobby?: ReactNode;
}) {
  const origins = useMemo(() => joinOrigins(), []);
  const [originIndex, setOriginIndex] = useState(0);
  const origin = origins[originIndex] ?? origins[0]!;

  return (
    <div className="flex flex-1 flex-col items-center gap-8 p-8">
      <motion.div
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 160, damping: 18 }}
        className="flex items-center gap-10 rounded-2xl bg-white px-10 py-6 text-brand shadow-xl"
      >
        <div className="flex flex-col items-center gap-2">
          <p className="text-2xl font-semibold">
            Rejoignez sur{' '}
            <span className="font-black">{origin.replace(/^https?:\/\//, '')}/join</span>
          </p>
          <p className="text-xl font-semibold">Code PIN du jeu :</p>
          <p className="text-8xl font-black tracking-[0.15em] tabular-nums">{pin}</p>
          {origins.length > 1 && (
            // Several network cards on the PC: let the host pick the one the phones are on.
            <button
              type="button"
              onClick={() => setOriginIndex((i) => (i + 1) % origins.length)}
              className="text-sm font-semibold text-gray-500 underline underline-offset-4 hover:text-brand"
            >
              QR code injoignable ? Essayer une autre adresse ({originIndex + 1}/{origins.length})
            </button>
          )}
        </div>
        <QRCodeSVG
          value={joinUrl(origin, pin)}
          size={224}
          marginSize={2}
          title="Scanner pour rejoindre la partie"
        />
      </motion.div>

      <div className="flex items-center gap-3 text-3xl font-bold">
        <motion.span
          key={players.length}
          initial={players.length > 0 ? { scale: 1.4 } : false}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 14 }}
          className="rounded-lg bg-black/25 px-4 py-1 tabular-nums"
        >
          {players.length}
        </motion.span>
        {players.length > 1 ? 'joueurs' : 'joueur'}
      </div>

      {players.length === 0 && (
        <p className="animate-pulse text-2xl opacity-80">En attente des joueurs…</p>
      )}
      {teamLobby ??
        (players.length > 0 && (
          <ul className="flex max-w-6xl flex-wrap justify-center gap-3">
            <AnimatePresence>
              {players.map((p) => (
                <motion.li
                  key={p.id}
                  layout
                  initial={{ scale: 0, opacity: 0, rotate: -8 }}
                  animate={{ scale: 1, opacity: 1, rotate: 0 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                >
                  <button
                    type="button"
                    onClick={() => onKick(p.id)}
                    title="Cliquer pour exclure"
                    className="group rounded-lg bg-black/25 px-5 py-2 text-2xl font-bold hover:bg-answer-red hover:line-through"
                  >
                    {p.nickname}
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        ))}
    </div>
  );
}

// ---------- Question intro ----------

export function QuestionIntroScreen({
  index,
  total,
  question,
  progress,
}: {
  index: number;
  total: number;
  question: QuestionShowPayload | null;
  /** 0 → 1 over the intro duration, null if unknown. */
  progress: number | null;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-10 p-8">
      <motion.p
        initial={{ y: -30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="rounded-full bg-black/25 px-6 py-2 text-2xl font-bold"
      >
        Question {index + 1} / {total}
      </motion.p>
      <motion.h2
        key={index}
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 16, delay: 0.1 }}
        className="max-w-5xl rounded-2xl bg-white px-10 py-8 text-center text-5xl font-black text-black shadow-xl"
      >
        {question?.text ?? '…'}
      </motion.h2>
      {progress != null && (
        <div className="h-3 w-full max-w-3xl overflow-hidden rounded-full bg-black/25">
          <div
            className="h-full bg-white transition-[width] duration-100 ease-linear"
            style={{ width: `${Math.min(100, progress * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

// ---------- Answering + reveal (same layout) ----------

export function QuestionScreen({
  question,
  remainingMs,
  answered,
  answerTotal,
  reveal,
  instant,
}: {
  question: QuestionShowPayload | null;
  remainingMs: number | null;
  answered: number;
  answerTotal: number;
  reveal: QuestionRevealPayload | null;
  /** Screen restored by a reload (host:rejoin): don't replay entrance animations. */
  instant: boolean;
}) {
  if (!question) {
    return <p className="m-auto animate-pulse text-3xl">Chargement de la question…</p>;
  }
  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <h2 className="rounded-2xl bg-white px-8 py-5 text-center text-4xl font-black text-black shadow-lg">
        {question.text}
      </h2>

      <div className="flex min-h-0 flex-1 items-center justify-between gap-6">
        <Countdown
          remainingMs={remainingMs}
          totalMs={question.timeLimitSec * 1000}
          done={reveal != null}
        />

        <div className="flex min-h-0 flex-1 items-center justify-center self-stretch">
          {reveal ? (
            <DistributionChart
              distribution={reveal.distribution}
              correct={reveal.correctIndexes}
              count={question.choices.length}
              instant={instant}
            />
          ) : question.imageUrl ? (
            <motion.img
              src={question.imageUrl}
              alt=""
              initial={instant ? false : { scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="max-h-[40vh] max-w-full rounded-xl object-contain shadow-lg"
            />
          ) : null}
        </div>

        <div className="flex w-32 shrink-0 flex-col items-center rounded-2xl bg-black/25 py-3">
          <motion.span
            key={answered}
            initial={answered > 0 ? { scale: 1.5 } : false}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 15 }}
            className="text-5xl font-black tabular-nums"
          >
            {answered}
          </motion.span>
          <span className="text-lg font-semibold">
            réponse{answered > 1 ? 's' : ''}
            {answerTotal > 0 && <span className="opacity-70"> / {answerTotal}</span>}
          </span>
        </div>
      </div>

      <AnswerGrid
        choices={question.choices}
        correct={reveal?.correctIndexes ?? null}
        instant={instant}
      />
    </div>
  );
}

const RING_R = 56;
const RING_C = 2 * Math.PI * RING_R;

/** Circular countdown: the ring empties with the time left, the number pops every second. */
function Countdown({
  remainingMs,
  totalMs,
  done,
}: {
  remainingMs: number | null;
  totalMs: number;
  done: boolean;
}) {
  const sec = remainingMs != null ? Math.ceil(remainingMs / 1000) : null;
  const fraction = done ? 0 : remainingMs != null && totalMs > 0 ? remainingMs / totalMs : 1;
  const urgent = !done && sec != null && sec <= TICK_FROM_SEC;
  return (
    <motion.div
      className="relative size-32 shrink-0 rounded-full bg-black/25"
      animate={urgent ? { scale: [1, 1.08, 1] } : { scale: 1 }}
      transition={urgent ? { duration: 1, repeat: Infinity } : undefined}
    >
      <svg viewBox="0 0 128 128" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle
          cx="64"
          cy="64"
          r={RING_R}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          className={`transition-[stroke-dashoffset,stroke] duration-100 ease-linear ${urgent ? 'stroke-answer-red' : 'stroke-white'}`}
          strokeDasharray={RING_C}
          strokeDashoffset={RING_C * (1 - Math.min(1, fraction))}
        />
      </svg>
      <motion.span
        key={done ? 'done' : sec}
        initial={{ scale: 1.6, opacity: 0.4 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 18 }}
        className="absolute inset-0 flex items-center justify-center text-6xl font-black tabular-nums"
      >
        {done ? '✓' : (sec ?? '')}
      </motion.span>
    </motion.div>
  );
}

function AnswerGrid({
  choices,
  correct,
  instant,
}: {
  choices: string[];
  correct: number[] | null;
  instant: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {choices.map((text, i) => {
        const s = SHAPES[i]!;
        const isCorrect = correct?.includes(i) ?? false;
        const dimmed = correct != null && !isCorrect;
        return (
          // Answers fly in one by one; at the reveal the wrong ones fade, the right ones pulse.
          <motion.div
            key={i}
            initial={instant ? false : { opacity: 0, y: 40, scale: 0.9 }}
            animate={{
              opacity: dimmed ? 0.3 : 1,
              y: 0,
              scale: isCorrect ? [1, 1.06, 1.02] : dimmed ? 0.97 : 1,
            }}
            transition={
              correct
                ? { duration: 0.5 }
                : {
                    delay: instant ? 0 : 0.1 + i * 0.15,
                    type: 'spring',
                    stiffness: 260,
                    damping: 20,
                  }
            }
            className={`flex items-center gap-5 rounded-xl px-6 py-5 text-3xl font-bold shadow-lg ${shapeBg[s.color]} ${isCorrect ? 'ring-4 ring-white' : ''}`}
          >
            <ShapeIcon shape={s.shape} className="size-12 shrink-0 fill-white" />
            <span className="flex-1">{text}</span>
            {isCorrect && (
              <motion.span
                initial={instant ? false : { scale: 0, rotate: -45 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 12, delay: 0.2 }}
                className="text-5xl"
              >
                ✓
              </motion.span>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

function DistributionChart({
  distribution,
  correct,
  count,
  instant,
}: {
  distribution: number[];
  correct: number[];
  count: number;
  instant: boolean;
}) {
  const max = Math.max(1, ...distribution);
  return (
    <div className="flex h-full max-h-[40vh] min-h-48 items-end gap-6">
      {Array.from({ length: count }, (_, i) => {
        const s = SHAPES[i]!;
        const n = distribution[i] ?? 0;
        const delay = instant ? 0 : i * 0.12;
        return (
          <div key={i} className="flex h-full w-24 flex-col items-center justify-end gap-2">
            <span className="text-3xl font-black tabular-nums">
              {instant ? n : <CountUp value={n} from={0} duration={800} delay={delay * 1000} />}
            </span>
            <motion.div
              className={`w-full rounded-t-lg ${shapeBg[s.color]} ${correct.includes(i) ? '' : 'opacity-40'}`}
              initial={instant ? false : { height: 0 }}
              animate={{ height: `${(n / max) * 100}%` }}
              transition={{ duration: 0.8, ease: 'easeOut', delay }}
              style={{ minHeight: 6 }}
            />
            <div className={`flex w-full justify-center rounded-b-lg py-2 ${shapeBg[s.color]}`}>
              <ShapeIcon shape={s.shape} className="size-7 fill-white" />
              {correct.includes(i) && <span className="ml-1 text-xl font-black">✓</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Leaderboard ----------

/** How long the previous standings stay on screen before re-ordering. */
const REORDER_DELAY_MS = 1200;

/** Row size of the individual leaderboard: everyone is listed (up to 15), so it shrinks. */
function leaderboardRow(count: number, besideTeams: boolean): string {
  if (besideTeams || count > 10) return 'gap-4 px-5 py-1 text-2xl';
  if (count > 6) return 'gap-5 px-6 py-2 text-3xl';
  return 'gap-6 px-8 py-4 text-4xl';
}

export function LeaderboardScreen({
  top,
  previous,
  instant,
  teams = [],
}: {
  top: RankedPlayer[];
  /** Standings after the previous question ([] for the first one or after a reload). */
  previous: RankedPlayer[];
  instant: boolean;
  /** Team mode: team ranking, shown first; the individual ranking goes beside it. */
  teams?: RankedTeam[];
}) {
  const reorder = !instant && previous.length > 0;
  const [showNew, setShowNew] = useState(!reorder);
  useEffect(() => {
    if (!reorder) return;
    const id = setTimeout(() => setShowNew(true), REORDER_DELAY_MS);
    return () => clearTimeout(id);
  }, [reorder]);

  const prevScore = new Map(previous.map((p) => [p.nickname, p.score]));
  // Phase 1: last question's top 5 with their old scores; phase 2: the new order, scores count up.
  const rows = showNew ? top : previous;
  const withTeams = teams.length > 0;
  const rowSize = leaderboardRow(Math.max(rows.length, top.length), withTeams);

  return (
    <div className="flex flex-1 flex-col items-center gap-8 p-8">
      <motion.h2
        initial={instant ? false : { y: -30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="rounded-2xl bg-white px-10 py-4 text-5xl font-black text-brand"
      >
        Classement
      </motion.h2>
      <div
        className={`flex w-full items-start gap-8 ${withTeams ? 'max-w-7xl' : 'max-w-4xl justify-center'}`}
      >
        {withTeams && (
          <div className="flex-[3]">
            <TeamRanking teams={teams} instant={instant} />
          </div>
        )}
        <ol className={`flex w-full flex-col ${withTeams ? 'flex-[2] gap-1.5' : 'gap-3'}`}>
          <AnimatePresence initial={!instant}>
            {rows.map((p, i) => (
              <motion.li
                key={p.nickname}
                layout
                initial={{ x: -60, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 60, opacity: 0 }}
                transition={{
                  layout: { type: 'spring', stiffness: 200, damping: 24 },
                  delay: showNew && reorder ? 0 : i * 0.12,
                }}
                className={`flex items-center rounded-xl font-bold shadow-lg transition-colors duration-500 ${rowSize} ${i === 0 ? 'bg-white text-brand' : 'bg-black/25'}`}
              >
                <span className="w-10 tabular-nums opacity-70">{i + 1}</span>
                <span className="flex-1 truncate">{p.nickname}</span>
                <span className="tabular-nums">
                  {showNew && reorder ? (
                    <CountUp value={p.score} from={prevScore.get(p.nickname) ?? 0} />
                  ) : (
                    p.score
                  )}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
          {top.length === 0 && <p className="text-center text-2xl opacity-80">Aucun joueur</p>}
        </ol>
      </div>
    </div>
  );
}

// ---------- Podium ----------

/** 3rd, then 2nd, then 1st (in seconds); `podium.wav` is timed on these. */
const PODIUM_SLOTS = [
  { rank: 1, height: 'h-[45vh]', bg: 'bg-yellow-400', delay: 2 },
  { rank: 0, height: 'h-[60vh]', bg: 'bg-amber-300', delay: 3.2 },
  { rank: 2, height: 'h-[32vh]', bg: 'bg-orange-400', delay: 0.8 },
] as const;
const WINNER_DELAY = 3.2;

export function PodiumScreen({ top, instant }: { top: RankedPlayer[]; instant: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-6 p-8">
      <h2 className="text-6xl font-black">Podium</h2>
      <div className="flex flex-1 items-end gap-6">
        {PODIUM_SLOTS.map(({ rank, height, bg, delay }) => {
          const p = top[rank];
          if (!p) return <div key={rank} className="w-64" />;
          return (
            <motion.div
              key={rank}
              className="flex w-64 flex-col items-center gap-3"
              initial={instant ? false : { y: 400, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay, type: 'spring', stiffness: 80, damping: 14 }}
            >
              {rank === 0 && (
                <motion.span
                  className="text-7xl"
                  aria-hidden="true"
                  initial={instant ? false : { scale: 0, rotate: -30 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ delay: instant ? 0 : WINNER_DELAY + 0.5, type: 'spring' }}
                >
                  👑
                </motion.span>
              )}
              <span className="w-full truncate text-center text-4xl font-black">{p.nickname}</span>
              <span className="text-2xl font-bold tabular-nums">{p.score} pts</span>
              <div
                className={`flex w-full items-start justify-center rounded-t-2xl pt-6 text-8xl font-black text-brand shadow-2xl ${height} ${bg}`}
              >
                {rank + 1}
              </div>
            </motion.div>
          );
        })}
      </div>
      {!instant && top.length > 0 && <Confetti delay={WINNER_DELAY + 0.2} />}
    </div>
  );
}
