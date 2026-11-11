import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { SHAPES, type PlayerResultPayload, type PotatoPrompt } from '@lbq/shared';
import { Avatar } from '../components/Avatar';
import { ShapeIcon, shapeBg } from '../components/shapes';
import { passesLabel } from '../lib/potato';
import { sendPotatoAnswer } from './playerStore';

const screen =
  'flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]';

function vibrate(ms: number | number[]) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // Not supported: nothing.
  }
}

/**
 * « Patate chaude » (T63) on a phone: the holder answers their sub-question (text + choices, this
 * type's exception to « no text on phones »); the others see who holds the bomb.
 */
export function PotatoPad({ prompt, playerId }: { prompt: PotatoPrompt; playerId: string }) {
  if (prompt.sub) return <HolderPad key={prompt.sub.number} prompt={prompt} />;
  return <Watching prompt={prompt} playerId={playerId} />;
}

/** The holder: the sub-question and its choices; a wrong answer locks them for a moment. */
function HolderPad({ prompt }: { prompt: PotatoPrompt }) {
  const sub = prompt.sub!;
  const [lockedUntil, setLockedUntil] = useState(() =>
    prompt.lockMs ? Date.now() + prompt.lockMs : 0,
  );
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = lockedUntil > now;
  useEffect(() => {
    // The bomb lands here (a new holder, or a new sub-question after a wrong answer).
    vibrate(prompt.lockMs ? [80, 60, 80] : 200);
  }, [prompt.lockMs]);
  useEffect(() => {
    if (!locked) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [locked]);
  const tap = async (i: number) => {
    if (busy || locked) return;
    setBusy(true);
    setError(null);
    const res = await sendPotatoAnswer(i);
    setBusy(false);
    if ('error' in res) {
      setError(res.error);
      setLockedUntil(Date.now() + 500);
      setNow(Date.now());
    }
    // `pass` / `wrong`: the next prompt replaces this screen.
  };
  return (
    <div className={screen} data-testid="potato-holder-pad">
      <motion.p
        initial={{ scale: 0.6 }}
        animate={{ scale: [0.6, 1.15, 1] }}
        className="text-center text-2xl font-black"
      >
        💣 Tu as la patate ! Vite !
      </motion.p>
      <p
        className="rounded-2xl bg-white px-4 py-3 text-center text-xl font-black text-black"
        data-testid="potato-sub-text"
      >
        {sub.text}
      </p>
      <div className="relative grid min-h-0 flex-1 grid-cols-1 gap-3">
        {sub.choices.map((text, i) => {
          const s = SHAPES[i]!;
          return (
            <button
              key={i}
              type="button"
              disabled={busy || locked}
              onPointerDown={() => tap(i)}
              aria-label={text}
              className={`flex min-h-16 items-center gap-3 rounded-2xl px-4 text-left text-xl font-black text-white shadow-lg active:scale-95 ${shapeBg[s.color]}`}
            >
              <ShapeIcon shape={s.shape} className="size-8 shrink-0 fill-white" />
              <span className="min-w-0 flex-1 break-words">{text}</span>
            </button>
          );
        })}
        {locked && prompt.lockMs && !error && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-black/75 text-center"
            data-testid="potato-locked"
          >
            <span className="text-4xl font-black">❌ Raté !</span>
            <span className="text-lg font-bold opacity-90">Lis la suivante…</span>
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-answer-red px-3 py-2 text-center font-black">
          {error}
        </p>
      )}
    </div>
  );
}

/** The others: who holds the bomb (and « Passée ! » right after passing it). */
function Watching({ prompt, playerId }: { prompt: PotatoPrompt; playerId: string }) {
  const holder = prompt.holder;
  const passedIt = prompt.from?.id === playerId;
  return (
    <div className={`${screen} items-center justify-center text-center`} data-testid="potato-wait">
      {passedIt && (
        <motion.p
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="rounded-full bg-answer-green px-5 py-2 text-xl font-black"
        >
          ✅ Passée !
        </motion.p>
      )}
      <motion.span
        className="text-8xl"
        aria-hidden="true"
        animate={{ rotate: [-8, 8, -8] }}
        transition={{ duration: 0.5, repeat: Infinity }}
      >
        💣
      </motion.span>
      {holder ? (
        <p className="flex items-center gap-3 text-2xl font-black">
          <Avatar id={holder.avatar} size="md" />
          {holder.nickname} a la patate !
        </p>
      ) : (
        <p className="text-2xl font-black">Personne n’a la patate…</p>
      )}
      <p className="font-semibold opacity-85">Regarde l’écran : elle peut arriver chez toi !</p>
      <p className="rounded-full bg-white/15 px-4 py-1 font-bold" data-testid="potato-my-passes">
        Tes passes : {prompt.passes}
      </p>
    </div>
  );
}

/** Result lines: who exploded, the passes and what they earned. */
export function PotatoResultLines({
  potato,
}: {
  potato: NonNullable<PlayerResultPayload['potato']>;
}) {
  return (
    <div
      className="flex flex-col items-center gap-1 text-center font-bold"
      data-testid="potato-result"
    >
      {potato.loser && !potato.exploded && (
        <p className="flex items-center gap-2">
          💥 <Avatar id={potato.loser.avatar} size="xs" /> {potato.loser.nickname} a explosé
        </p>
      )}
      <p>
        {passesLabel(potato.passes)}
        {potato.passPoints > 0 && ` : + ${potato.passPoints} pts`}
      </p>
      {potato.survivorPoints > 0 && <p>Survivant : + {potato.survivorPoints} pts</p>}
    </div>
  );
}
