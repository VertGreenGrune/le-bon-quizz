import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import {
  SHAPES,
  type QuestionRevealPayload,
  type QuestionShowPayload,
  type RankedPlayer,
} from '@lbq/shared';
import { ShapeIcon, shapeBg } from '../components/shapes';
import { joinOrigins, joinUrl } from './joinUrl';

// ---------- Lobby ----------

export function LobbyScreen({
  pin,
  players,
  onKick,
}: {
  pin: string;
  players: { id: string; nickname: string }[];
  onKick: (playerId: string) => void;
}) {
  const origins = useMemo(() => joinOrigins(), []);
  const [originIndex, setOriginIndex] = useState(0);
  const origin = origins[originIndex] ?? origins[0]!;

  return (
    <div className="flex flex-1 flex-col items-center gap-8 p-8">
      <div className="flex items-center gap-10 rounded-2xl bg-white px-10 py-6 text-brand shadow-xl">
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
      </div>

      <div className="flex items-center gap-3 text-3xl font-bold">
        <span className="rounded-lg bg-black/25 px-4 py-1 tabular-nums">{players.length}</span>
        {players.length > 1 ? 'joueurs' : 'joueur'}
      </div>

      {players.length === 0 ? (
        <p className="animate-pulse text-2xl opacity-80">En attente des joueurs…</p>
      ) : (
        <ul className="flex max-w-6xl flex-wrap justify-center gap-3">
          <AnimatePresence>
            {players.map((p) => (
              <motion.li
                key={p.id}
                layout
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
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
      )}
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
      <p className="rounded-full bg-black/25 px-6 py-2 text-2xl font-bold">
        Question {index + 1} / {total}
      </p>
      <motion.h2
        key={index}
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
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
  remainingSec,
  answered,
  answerTotal,
  reveal,
}: {
  question: QuestionShowPayload | null;
  remainingSec: number | null;
  answered: number;
  answerTotal: number;
  reveal: QuestionRevealPayload | null;
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
        <div className="flex size-32 shrink-0 items-center justify-center rounded-full bg-black/25 text-6xl font-black tabular-nums">
          {reveal ? '✓' : (remainingSec ?? '')}
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center self-stretch">
          {reveal ? (
            <DistributionChart
              distribution={reveal.distribution}
              correct={reveal.correctIndexes}
              count={question.choices.length}
            />
          ) : question.imageUrl ? (
            <img
              src={question.imageUrl}
              alt=""
              className="max-h-[40vh] max-w-full rounded-xl object-contain shadow-lg"
            />
          ) : null}
        </div>

        <div className="flex w-32 shrink-0 flex-col items-center rounded-2xl bg-black/25 py-3">
          <span className="text-5xl font-black tabular-nums">{answered}</span>
          <span className="text-lg font-semibold">
            réponse{answered > 1 ? 's' : ''}
            {answerTotal > 0 && <span className="opacity-70"> / {answerTotal}</span>}
          </span>
        </div>
      </div>

      <AnswerGrid choices={question.choices} correct={reveal?.correctIndexes ?? null} />
    </div>
  );
}

function AnswerGrid({ choices, correct }: { choices: string[]; correct: number[] | null }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {choices.map((text, i) => {
        const s = SHAPES[i]!;
        const isCorrect = correct?.includes(i);
        const dimmed = correct != null && !isCorrect;
        return (
          <div
            key={i}
            className={`flex items-center gap-5 rounded-xl px-6 py-5 text-3xl font-bold shadow-lg transition-opacity duration-500 ${shapeBg[s.color]} ${dimmed ? 'opacity-30' : ''}`}
          >
            <ShapeIcon shape={s.shape} className="size-12 shrink-0 fill-white" />
            <span className="flex-1">{text}</span>
            {isCorrect && <span className="text-5xl">✓</span>}
          </div>
        );
      })}
    </div>
  );
}

function DistributionChart({
  distribution,
  correct,
  count,
}: {
  distribution: number[];
  correct: number[];
  count: number;
}) {
  const max = Math.max(1, ...distribution);
  return (
    <div className="flex h-full max-h-[40vh] min-h-48 items-end gap-6">
      {Array.from({ length: count }, (_, i) => {
        const s = SHAPES[i]!;
        const n = distribution[i] ?? 0;
        return (
          <div key={i} className="flex h-full w-24 flex-col items-center justify-end gap-2">
            <span className="text-3xl font-black tabular-nums">{n}</span>
            <motion.div
              className={`w-full rounded-t-lg ${shapeBg[s.color]} ${correct.includes(i) ? '' : 'opacity-40'}`}
              initial={{ height: 0 }}
              animate={{ height: `${(n / max) * 100}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
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

export function LeaderboardScreen({ top }: { top: RankedPlayer[] }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-8 p-8">
      <h2 className="rounded-2xl bg-white px-10 py-4 text-5xl font-black text-brand">Classement</h2>
      <ol className="flex w-full max-w-4xl flex-col gap-4">
        {top.map((p, i) => (
          <motion.li
            key={p.nickname}
            initial={{ x: -60, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: i * 0.12 }}
            className={`flex items-center gap-6 rounded-xl px-8 py-4 text-4xl font-bold shadow-lg ${i === 0 ? 'bg-white text-brand' : 'bg-black/25'}`}
          >
            <span className="w-10 tabular-nums opacity-70">{i + 1}</span>
            <span className="flex-1 truncate">{p.nickname}</span>
            <span className="tabular-nums">{p.score}</span>
          </motion.li>
        ))}
        {top.length === 0 && <p className="text-center text-2xl opacity-80">Aucun joueur</p>}
      </ol>
    </div>
  );
}

// ---------- Podium ----------

const PODIUM_SLOTS = [
  { rank: 1, height: 'h-[45vh]', bg: 'bg-yellow-400', delay: 2 },
  { rank: 0, height: 'h-[60vh]', bg: 'bg-amber-300', delay: 3.2 },
  { rank: 2, height: 'h-[32vh]', bg: 'bg-orange-400', delay: 0.8 },
] as const;

export function PodiumScreen({ top }: { top: RankedPlayer[] }) {
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
              initial={{ y: 400, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay, type: 'spring', stiffness: 80, damping: 14 }}
            >
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
    </div>
  );
}
