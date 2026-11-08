import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ThiefWheel } from '@lbq/shared';
import { Avatar } from '../components/Avatar';
import { drawnIndex, sliceCenter, slicePath, wheelResult, wheelRotation } from '../lib/wheel';
import { playSound } from './sounds';

/** Wait after the reveal before the first wheel (the answer and the bars come first). */
const START_DELAY_MS = 3000;
const SPIN_MS = 4200;
const RESULT_MS = 3000;

const SLICE_COLORS = ['#e21b3c', '#1368ce', '#d89e00', '#26890c'];
const RADIUS = 260;

/**
 * Voleur (T51): at the REVEAL, each wheel of `question:reveal.wheels` spins in turn over the
 * screen and stops on the drawn player, then a line tells what was stolen. Afterwards (and right
 * away after a host reload) only the result lines stay, in a small banner.
 */
export function ThiefWheels({ wheels, instant }: { wheels: ThiefWheel[]; instant: boolean }) {
  // -1: waiting; i: wheel i spinning / showing its result; wheels.length: done.
  const [step, setStep] = useState(instant ? wheels.length : -1);
  const [landed, setLanded] = useState(false);

  useEffect(() => {
    if (step >= wheels.length) return;
    if (step === -1) {
      const t = setTimeout(() => setStep(0), START_DELAY_MS);
      return () => clearTimeout(t);
    }
    setLanded(false);
    const land = setTimeout(() => {
      setLanded(true);
      playSound('joker');
    }, SPIN_MS);
    const next = setTimeout(() => setStep(step + 1), SPIN_MS + RESULT_MS);
    return () => {
      clearTimeout(land);
      clearTimeout(next);
    };
  }, [step, wheels.length]);

  const current = step >= 0 && step < wheels.length ? wheels[step]! : null;
  return (
    <>
      <AnimatePresence>
        {current && (
          <motion.div
            key={step}
            data-testid="thief-wheel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-6 bg-black/70 backdrop-blur-sm"
          >
            <p className="text-5xl font-black drop-shadow">
              🦹 La roue de {current.thief.nickname} tourne…
            </p>
            <Wheel wheel={current} />
            <p
              className={`min-h-16 rounded-2xl px-8 py-3 text-center text-4xl font-black transition-opacity ${
                landed ? 'bg-panel opacity-100' : 'opacity-0'
              }`}
              data-testid="thief-wheel-result"
            >
              {landed && wheelResult(current)}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
      {step >= wheels.length && (
        <motion.ul
          initial={instant ? false : { y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          data-testid="thief-wheel-summary"
          className="fixed bottom-28 left-1/2 z-30 flex -translate-x-1/2 flex-col gap-2"
        >
          {wheels.map((w, i) => (
            <li key={i} className="rounded-xl bg-panel px-5 py-2 text-2xl font-bold shadow-lg">
              {wheelResult(w)}
            </li>
          ))}
        </motion.ul>
      )}
    </>
  );
}

/** The wheel itself: one slice per player with their avatar, spun to the drawn one. */
function Wheel({ wheel }: { wheel: ThiefWheel }) {
  const count = wheel.candidates.length;
  const size = RADIUS * 2;
  const avatarSize = count > 10 ? 'sm' : 'md';
  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Pointer at the top. */}
      <div className="absolute -top-6 left-1/2 z-10 size-0 -translate-x-1/2 border-x-[22px] border-t-[40px] border-x-transparent border-t-white drop-shadow-lg" />
      <motion.div
        className="size-full"
        initial={{ rotate: 0 }}
        animate={{ rotate: wheelRotation(drawnIndex(wheel), count) }}
        transition={{ duration: SPIN_MS / 1000, ease: [0.12, 0.6, 0.2, 1] }}
      >
        <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 size-full drop-shadow-2xl">
          {wheel.candidates.map((c, i) => (
            <path
              key={c.id}
              d={slicePath(i, count, RADIUS)}
              fill={SLICE_COLORS[i % SLICE_COLORS.length]}
              stroke="white"
              strokeWidth={4}
            />
          ))}
        </svg>
        {wheel.candidates.map((c, i) => (
          <div
            key={c.id}
            className="absolute top-1/2 left-1/2 flex flex-col items-center"
            style={{
              transform: `translate(-50%, -50%) rotate(${sliceCenter(i, count)}deg) translateY(-${RADIUS * 0.62}px)`,
            }}
          >
            <Avatar id={c.avatar} size={avatarSize} className="ring-4 ring-white" />
            {count <= 8 && (
              <span className="mt-1 max-w-28 truncate text-xl font-black drop-shadow">
                {c.nickname}
              </span>
            )}
          </div>
        ))}
      </motion.div>
      <span
        className="absolute top-1/2 left-1/2 flex size-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-5xl shadow-xl"
        aria-hidden
      >
        🦹
      </span>
    </div>
  );
}
