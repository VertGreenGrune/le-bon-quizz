import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import type {
  LobbyMember,
  QuestionShowPayload,
  WagerReveal,
  WagerSlot,
  WagerStatus,
} from '@lbq/shared';
import { Avatar } from '../components/Avatar';
import { formatValue } from '../lib/numbers';
import { isOuterSlot, linePositions, slotLabel } from '../lib/wager';

/**
 * « Paris sur les réponses » (T61) on the TV. Guess stage: who has guessed (never the numbers).
 * Bet stage: every slot, smallest first, with its authors. Reveal: the right answer on a number
 * line, the winning slot lit, who bet on what and the points.
 */
export function WagerStage({
  question,
  status,
  reveal,
  instant,
  media,
}: {
  question: QuestionShowPayload;
  status: WagerStatus | null;
  reveal: WagerReveal | undefined;
  instant: boolean;
  /** Picture / sound badge of the question, shown while guessing. */
  media?: ReactNode;
}) {
  if (reveal) return <WagerRevealView reveal={reveal} instant={instant} />;
  const wager = question.wager;
  if (wager?.stage === 'bet')
    return <WagerSlots slots={wager.slots} unit={wager.unit} instant={instant} />;
  const guessed = status?.guessed ?? [];
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-4">
      {media}
      <motion.p
        initial={instant ? false : { scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="rounded-2xl bg-panel px-8 py-4 text-center text-4xl font-black"
        data-testid="wager-stage"
      >
        🎲 Estimez le nombre sur vos téléphones{wager?.unit ? ` (en ${wager.unit})` : ''} !
      </motion.p>
      <p className="text-2xl font-semibold opacity-80">
        Ensuite, pariez sur l’estimation la plus proche sans dépasser.
      </p>
      <ul className="flex flex-wrap justify-center gap-3" data-testid="wager-guessed">
        {guessed.map((p) => (
          <motion.li
            key={p.id}
            initial={instant ? false : { scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex flex-col items-center gap-1"
          >
            <Avatar id={p.avatar} size="lg" />
            <span className="max-w-24 truncate text-lg font-bold">{p.nickname}</span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

/** Bet stage: the slots in a row, smallest first, the outer ones marked ×1,5. */
function WagerSlots({
  slots,
  unit,
  instant,
}: {
  slots: WagerSlot[];
  unit?: string;
  instant: boolean;
}) {
  return (
    <div className="flex w-full flex-col items-center gap-4" data-testid="wager-slots">
      <p className="text-center text-3xl font-black">
        💰 Pariez sur l’estimation la plus proche <u>sans dépasser</u> !
      </p>
      <SlotRow count={slots.length}>
        {slots.map((slot, i) => (
          <motion.li
            key={i}
            initial={instant ? false : { y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: instant ? 0 : i * 0.1 }}
            className="relative flex min-w-0 flex-col items-center gap-2 rounded-2xl bg-white px-3 py-3 text-brand shadow-lg"
          >
            <OuterTag show={isOuterSlot(i, slots.length)} />
            <SlotValue value={slot.value} unit={unit} count={slots.length} />
            <People people={slot.authors} />
          </motion.li>
        ))}
      </SlotRow>
    </div>
  );
}

function WagerRevealView({ reveal, instant }: { reveal: WagerReveal; instant: boolean }) {
  const { slots, winning, unit } = reveal;
  const values = slots.flatMap((s) => (s.value === null ? [] : [s.value]));
  const pos = linePositions([...values, reveal.correct]);
  const winner = slots[winning];
  return (
    <div className="flex w-full flex-col items-center gap-5" data-testid="wager-reveal">
      {/* Number line: every guess, and the right answer. */}
      {/* The right answer above the line, the guesses below it (two rows, so close ones fit). */}
      <div className="relative h-36 w-full max-w-6xl">
        <div className="absolute inset-x-0 top-[55%] h-2 -translate-y-1/2 rounded-full bg-white/40" />
        {slots.map((s, i) =>
          s.value === null ? null : (
            <div
              key={i}
              className="absolute top-[55%] flex -translate-x-1/2 -translate-y-2 flex-col items-center"
              style={{ left: `${pos(s.value) * 100}%` }}
            >
              <span
                className={`size-4 rounded-full ${i === winning ? 'bg-answer-green ring-4 ring-white' : 'bg-white'}`}
              />
              <span className={`w-px bg-white/60 ${i % 2 ? 'h-7' : 'h-1'}`} />
              <span className="text-lg font-bold tabular-nums whitespace-nowrap">
                {formatValue(s.value, unit)}
              </span>
            </div>
          ),
        )}
        <motion.div
          initial={instant ? false : { y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: instant ? 0 : 0.4, type: 'spring', stiffness: 260, damping: 16 }}
          className="absolute bottom-[45%] flex -translate-x-1/2 flex-col items-center"
          style={{ left: `${pos(reveal.correct) * 100}%` }}
          data-testid="wager-correct"
        >
          <span className="rounded-xl bg-answer-green px-4 py-1 text-3xl font-black whitespace-nowrap tabular-nums shadow-lg">
            ✅ {formatValue(reveal.correct, unit)}
          </span>
          <span className="h-4 w-1 bg-answer-green" />
        </motion.div>
      </div>

      <SlotRow count={slots.length}>
        {slots.map((slot, i) => {
          const win = i === winning;
          return (
            <motion.li
              key={i}
              initial={instant ? false : { y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: win ? 1 : 0.55, scale: win ? 1.05 : 1 }}
              transition={{ delay: instant ? 0 : 0.8 + i * 0.08 }}
              data-testid={win ? 'wager-winning' : undefined}
              className={`relative flex min-w-0 flex-col items-center gap-2 rounded-2xl px-3 py-3 shadow-lg ${
                win ? 'bg-answer-green text-white ring-4 ring-white' : 'bg-white text-brand'
              }`}
            >
              <OuterTag show={isOuterSlot(i, slots.length)} />
              <SlotValue value={slot.value} unit={unit} count={slots.length} />
              <People people={slot.authors} />
              <div className="flex w-full flex-col items-center gap-1 border-t-2 border-current/20 pt-2">
                <span className="text-sm font-bold opacity-80">
                  {slot.bettors.length === 0
                    ? 'Aucun pari'
                    : `${slot.bettors.length} pari${slot.bettors.length > 1 ? 's' : ''}`}
                </span>
                <People people={slot.bettors} />
              </div>
            </motion.li>
          );
        })}
      </SlotRow>

      <motion.p
        initial={instant ? false : { y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: instant ? 0 : 1.6 }}
        className="rounded-2xl bg-panel px-6 py-3 text-center text-2xl font-black"
        data-testid="wager-points"
      >
        {winner && winner.bettors.length > 0
          ? `💰 Pari gagnant : + ${reveal.betPoints} pts`
          : '💰 Personne n’a parié sur la bonne estimation'}
        {reveal.authorPoints > 0 &&
          winner &&
          winner.authors.length > 0 &&
          ` · 🎯 ${winner.authors.map((p) => p.nickname).join(', ')} : + ${reveal.authorPoints} pts`}
      </motion.p>
    </div>
  );
}

function SlotRow({ count, children }: { count: number; children: ReactNode }) {
  // Up to 8 slots on one line, two lines beyond.
  const cols = Math.min(count, count > 8 ? Math.ceil(count / 2) : count);
  return (
    <ul
      className="grid w-full max-w-7xl gap-3"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {children}
    </ul>
  );
}

function SlotValue({ value, unit, count }: { value: number | null; unit?: string; count: number }) {
  const size = value === null ? 'text-xl' : count > 6 ? 'text-2xl' : 'text-4xl';
  return (
    <span className={`text-center leading-tight font-black tabular-nums break-words ${size}`}>
      {slotLabel(value, unit)}
    </span>
  );
}

function OuterTag({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="absolute -top-3 right-2 rounded-full bg-answer-yellow px-2 text-sm font-black text-black">
      ×1,5
    </span>
  );
}

function People({ people }: { people: LobbyMember[] }) {
  if (people.length === 0) return null;
  return (
    <span className="flex flex-wrap justify-center gap-1">
      {people.map((p) => (
        <span key={p.id} className="flex flex-col items-center" title={p.nickname}>
          <Avatar id={p.avatar} size="sm" />
          <span className="max-w-16 truncate text-xs font-bold">{p.nickname}</span>
        </span>
      ))}
    </span>
  );
}
