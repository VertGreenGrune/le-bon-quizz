import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTheme } from '../themes';

/**
 * Animated number (scores, counts). Counts from `from` (default: `value`, i.e. no animation on
 * mount) and from the currently displayed number whenever `value` changes. Instant when the
 * user prefers reduced motion.
 */
export function CountUp({
  value,
  from,
  duration = 900,
  delay = 0,
}: {
  value: number;
  from?: number;
  duration?: number;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? value : (from ?? value));
  const shownRef = useRef(shown);
  shownRef.current = shown;

  useEffect(() => {
    const start = shownRef.current;
    if (reduced || start === value) {
      setShown(value);
      return;
    }
    let frame = 0;
    let t0: number | null = null;
    const step = (now: number) => {
      t0 ??= now + delay;
      const p = Math.min(1, Math.max(0, (now - t0) / duration));
      const eased = 1 - (1 - p) ** 3;
      setShown(Math.round(start + (value - start) * eased));
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, duration, delay, reduced]);

  return <>{shown}</>;
}

/**
 * One-shot confetti rain over the whole screen, in the shapes of the page's theme (T40:
 * pumpkins and bats, snowflakes, pixel squares…). Renders nothing with reduced motion.
 */
export function Confetti({ count = 120, delay = 0 }: { count?: number; delay?: number }) {
  const reduced = useReducedMotion();
  const { confetti } = useTheme();
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const emoji =
          confetti.emojis.length > 0 && Math.random() < confetti.emojiShare
            ? confetti.emojis[i % confetti.emojis.length]!
            : null;
        const shape = confetti.shapes[i % confetti.shapes.length]!;
        const size = 8 + Math.random() * 10;
        return {
          id: i,
          left: Math.random() * 100,
          drift: (Math.random() - 0.5) * 30,
          emoji,
          style: emoji
            ? { fontSize: size * 2, lineHeight: 1 }
            : {
                width: size,
                height: shape === 'rect' ? size * 0.45 : size,
                background: confetti.colors[i % confetti.colors.length]!,
                borderRadius: shape === 'circle' ? '50%' : shape === 'rect' ? 2 : 0,
              },
          spin: (Math.random() < 0.5 ? -1 : 1) * (emoji ? 180 : 360 + Math.random() * 720),
          duration: 2.6 + Math.random() * 2,
          delay: delay + Math.random() * 0.8,
        };
      }),
    [count, delay, confetti],
  );
  if (reduced) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden="true">
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className="absolute -top-8 block"
          style={{ left: `${p.left}%`, ...p.style }}
          initial={{ y: 0, x: 0, rotate: 0, opacity: 1 }}
          animate={{ y: '110vh', x: `${p.drift}vw`, rotate: p.spin, opacity: [1, 1, 0.8] }}
          transition={{ duration: p.duration, delay: p.delay, ease: [0.25, 0.5, 0.6, 1] }}
        >
          {p.emoji}
        </motion.span>
      ))}
    </div>
  );
}
