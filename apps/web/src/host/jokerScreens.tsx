import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { JOKERS, type JokerUsedPayload, type RankedPlayer } from '@lbq/shared';
import { Avatar } from '../components/Avatar';
import { announcement, nextAnnouncements } from '../lib/jokers';
import { getSocket } from '../lib/socket';
import { playSound } from './sounds';

/** How long one announcement stays on the TV. */
export const ANNOUNCE_MS = 2800;

/**
 * Games with jokers: a big animated announcement on the TV each time someone plays a joker
 * (« 🥶 Red a gelé Batou ! ») with a sound. Listens to `joker:used` by itself; not shown after a
 * reload (announcements are never re-sent).
 */
export function JokerAnnouncements() {
  const [queue, setQueue] = useState<(JokerUsedPayload & { key: number })[]>([]);
  useEffect(() => {
    const socket = getSocket();
    let key = 0;
    const onUsed = (p: JokerUsedPayload) =>
      setQueue((q) => nextAnnouncements(q, { ...p, key: ++key }));
    socket.on('joker:used', onUsed);
    return () => {
      socket.off('joker:used', onUsed);
    };
  }, []);

  const current = queue[0];
  useEffect(() => {
    if (!current) return;
    playSound('joker');
    const id = setTimeout(() => setQueue((q) => nextAnnouncements(q, null)), ANNOUNCE_MS);
    return () => clearTimeout(id);
  }, [current]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[32vh] z-40 flex justify-center px-8">
      <AnimatePresence mode="wait">
        {current && (
          <motion.div
            key={current.key}
            role="status"
            data-testid="joker-announcement"
            initial={{ scale: 0.3, rotate: -8, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            exit={{ scale: 1.3, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 16 }}
            className={`flex items-center gap-6 rounded-3xl px-10 py-6 shadow-2xl ${
              current.blocked ? 'bg-sky-200 text-sky-950' : 'bg-white text-brand'
            }`}
          >
            <motion.span
              className="text-8xl"
              animate={{ rotate: [0, -12, 12, -6, 0], scale: [1, 1.2, 1] }}
              transition={{ duration: 0.8 }}
              aria-hidden="true"
            >
              {current.blocked ? '🛡️' : JOKERS[current.joker].icon}
            </motion.span>
            <Avatar id={current.by.avatar} size="lg" />
            <span className="flex flex-col">
              <span className="text-4xl font-black">{announcement(current).title}</span>
              <span className="text-2xl font-semibold opacity-75">
                {announcement(current).detail}
              </span>
            </span>
            {current.target && <Avatar id={current.target.avatar} size="lg" />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Leaderboard row: the joker played on the last question, then the hand. */
export function JokerIcons({ jokers }: { jokers: NonNullable<RankedPlayer['jokers']> }) {
  return (
    <span className="flex items-center gap-1 text-[0.6em]" data-testid="joker-icons">
      {jokers.used && (
        <span
          className="rounded-full bg-amber-300 px-2 text-brand"
          title={`Joker joué : ${JOKERS[jokers.used].name}`}
        >
          {JOKERS[jokers.used].icon}
        </span>
      )}
      {jokers.hand.map((j, i) => (
        <span key={i} title={JOKERS[j].name} className="opacity-80">
          {JOKERS[j].icon}
        </span>
      ))}
    </span>
  );
}
