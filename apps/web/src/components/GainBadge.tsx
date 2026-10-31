import { motion } from 'framer-motion';

/** « +850 », « +0 », « −500 »: what a player / team earned on the question just played (T41). */
export function formatGain(gained: number): string {
  return gained < 0 ? `−${-gained}` : `+${gained}`;
}

export function GainBadge({
  gained,
  instant,
  delay = 0,
  className = '',
}: {
  gained: number;
  instant: boolean;
  /** Seconds before it pops in (the rows come in one by one). */
  delay?: number;
  className?: string;
}) {
  const color =
    gained > 0
      ? 'bg-emerald-500 text-white'
      : gained < 0
        ? 'bg-answer-red text-white'
        : 'bg-slate-500/70 text-white/90';
  return (
    <motion.span
      initial={instant ? false : { scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: instant ? 0 : delay, type: 'spring', stiffness: 300, damping: 15 }}
      className={`rounded-lg px-2.5 py-0.5 text-[0.8em] font-black whitespace-nowrap tabular-nums shadow ${color} ${className}`}
      data-testid="gain"
    >
      {formatGain(gained)}
    </motion.span>
  );
}
