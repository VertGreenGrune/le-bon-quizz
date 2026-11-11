import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { SHAPES, type PotatoReveal, type PotatoShow, type PotatoStatus } from '@lbq/shared';
import { Avatar } from '../components/Avatar';
import { ShapeIcon, shapeBg } from '../components/shapes';
import { passesLabel, potatoDanger, potatoTickMs } from '../lib/potato';
import { playSound } from './sounds';

type LiveStatus = PotatoStatus & { at: number };

/** The round's time now (local clock), frozen while paused. */
function elapsedAt(status: LiveStatus | null, paused: boolean, now: number): number {
  if (!status) return 0;
  return status.elapsedMs + (paused ? 0 : Math.max(0, now - status.at));
}

/**
 * The bomb ticks on the TV, faster and faster (`potatoTickMs`); silent while paused. The round's
 * time comes from `game:state.potato` (never the fuse, which stays on the server).
 */
function usePotatoTicks(status: LiveStatus | null, fuseMinSec: number, paused: boolean) {
  const latest = useRef({ status, paused, fuseMinSec });
  latest.current = { status, paused, fuseMinSec };
  const active = status !== null && !paused;
  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const { status: s, paused: p, fuseMinSec: f } = latest.current;
      playSound('potato-tick');
      timer = setTimeout(tick, potatoTickMs(elapsedAt(s, p, Date.now()), f));
    };
    timer = setTimeout(tick, 300);
    return () => clearTimeout(timer);
  }, [active]);
}

/** Re-renders every 100 ms while `active` (shake, lock countdown). */
function useClock(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

/** The bomb: shakes and glows more and more (`danger` 0 → 1). */
export function Bomb({ danger, size = 'text-[11rem]' }: { danger: number; size?: string }) {
  const reduced = useReducedMotion();
  const amplitude = 2 + danger * 10;
  return (
    <motion.span
      aria-hidden="true"
      data-testid="potato-bomb"
      className={`inline-block leading-none select-none ${size}`}
      style={{
        filter: `drop-shadow(0 0 ${8 + danger * 40}px rgba(255, ${140 - danger * 120}, 0, 0.9))`,
      }}
      animate={
        reduced
          ? undefined
          : { rotate: [-amplitude, amplitude, -amplitude], scale: [1, 1 + danger * 0.08, 1] }
      }
      transition={{ duration: Math.max(0.12, 0.6 - danger * 0.45), repeat: Infinity }}
    >
      💣
    </motion.span>
  );
}

/**
 * « Patate chaude » (T63) on the TV, during the round: the ticking bomb, who holds it, their
 * sub-question with its choices (never the right one) — no clock (the fuse is secret).
 */
export function PotatoStage({
  show,
  status,
  paused,
  instant,
}: {
  show: PotatoShow | undefined;
  status: LiveStatus | null;
  paused: boolean;
  instant: boolean;
}) {
  const fuseMinSec = show?.fuseMinSec ?? 30;
  usePotatoTicks(status, fuseMinSec, paused);
  // The lock after a wrong answer: from the moment this `question:show` arrived.
  const [lockEnd, setLockEnd] = useState(0);
  const lockMs = show?.lockMs ?? 0;
  const subNumber = show?.sub?.number;
  useEffect(() => {
    setLockEnd(lockMs > 0 ? Date.now() + lockMs : 0);
  }, [lockMs, subNumber]);
  const now = useClock(status !== null);
  const danger = paused ? 0 : potatoDanger(elapsedAt(status, paused, now), fuseMinSec);
  const locked = lockEnd > now;
  const holder = show?.holder ?? status?.holder;
  const sub = show?.sub;
  return (
    <div
      className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-5"
      data-testid="potato-stage"
    >
      <div className="flex items-center justify-center gap-10">
        <Bomb danger={danger} />
        {holder ? (
          <motion.div
            key={holder.id}
            initial={instant ? false : { x: 120, opacity: 0, scale: 0.6 }}
            animate={{ x: 0, opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18 }}
            className="flex flex-col items-center gap-2"
            data-testid="potato-holder"
          >
            <Avatar id={holder.avatar} size="xl" />
            <span
              className="max-w-[28rem] truncate text-5xl font-black"
              data-testid="potato-holder-name"
            >
              {holder.nickname}
            </span>
            <span className="text-3xl font-bold opacity-90">a la patate !</span>
            {status?.from && (
              <span className="text-xl font-semibold opacity-75">
                passée par {status.from.nickname}
              </span>
            )}
          </motion.div>
        ) : (
          <p className="text-4xl font-black">Personne n’a la patate…</p>
        )}
        <div className="flex flex-col items-center rounded-2xl bg-panel px-6 py-3">
          <span className="text-5xl font-black tabular-nums" data-testid="potato-passes">
            {status?.passes ?? 0}
          </span>
          <span className="text-lg font-semibold">passe{(status?.passes ?? 0) > 1 ? 's' : ''}</span>
        </div>
      </div>

      {sub && (
        <div className="relative flex w-full max-w-6xl flex-col gap-3" data-testid="potato-sub">
          <motion.p
            key={sub.number}
            initial={instant ? false : { y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="rounded-2xl bg-white px-6 py-3 text-center text-3xl font-black text-black shadow-lg"
          >
            {sub.text}
          </motion.p>
          <div className="grid grid-cols-2 gap-3">
            {sub.choices.map((text, i) => {
              const s = SHAPES[i]!;
              return (
                <div
                  key={`${sub.number}-${i}`}
                  className={`flex items-center gap-4 rounded-xl px-5 py-3 text-2xl font-bold shadow-lg ${shapeBg[s.color]}`}
                >
                  <ShapeIcon shape={s.shape} className="size-9 shrink-0 fill-white" />
                  <span className="flex-1">{text}</span>
                </div>
              );
            })}
          </div>
          {locked && (
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/75 text-4xl font-black"
              data-testid="potato-wrong"
            >
              ❌ Raté ! Question suivante…
            </motion.div>
          )}
        </div>
      )}
      {paused && <p className="text-2xl font-bold opacity-80">⏸ La mèche est en pause</p>}
    </div>
  );
}

/** The reveal: 💥 with the loser, then everyone's passes and points. */
export function PotatoRevealView({ reveal, instant }: { reveal: PotatoReveal; instant: boolean }) {
  const loser = reveal.loser;
  return (
    <div
      className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-4"
      data-testid="potato-reveal"
    >
      <motion.div
        initial={instant ? false : { scale: 0.2, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 12 }}
        className="flex items-center gap-6"
      >
        <span className="text-[7rem] leading-none" aria-hidden="true">
          💥
        </span>
        {loser ? (
          <span className="flex items-center gap-4 text-5xl font-black" data-testid="potato-loser">
            <Avatar id={loser.avatar} size="xl" />
            <span>
              BOUM ! {loser.nickname}
              <br />
              <span className="text-3xl font-bold opacity-90">a explosé avec la patate</span>
            </span>
          </span>
        ) : (
          <span className="text-4xl font-black">Pas de partie de patate (il faut 2 joueurs)</span>
        )}
      </motion.div>
      {reveal.last && (
        <motion.p
          initial={instant ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: instant ? 0 : 0.6 }}
          className="rounded-2xl bg-panel px-6 py-2 text-xl font-semibold"
        >
          Dernière question : {reveal.last.text} → <strong>{reveal.last.answer}</strong>
        </motion.p>
      )}
      <ol
        className={`grid w-full gap-x-6 gap-y-2 ${reveal.players.length > 8 ? 'max-w-7xl grid-cols-3' : 'max-w-5xl grid-cols-2'}`}
        data-testid="potato-scores"
      >
        {reveal.players.map((p, i) => {
          const lost = p.id === loser?.id;
          return (
            <motion.li
              key={p.id}
              initial={instant ? false : { x: -40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: instant ? 0 : 0.9 + i * 0.12 }}
              className={`flex items-center gap-3 rounded-xl px-4 py-2 text-2xl font-bold ${lost ? 'bg-answer-red' : 'bg-panel'}`}
            >
              <Avatar id={p.avatar} size="sm" />
              <span className="min-w-0 flex-1 truncate">
                {lost && '💥 '}
                {p.nickname}
              </span>
              <span className="text-lg font-semibold opacity-85">{passesLabel(p.passes)}</span>
              <span className="w-20 text-right tabular-nums">+{p.points}</span>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}
