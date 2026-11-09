import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { SHAPES, type LobbyMember } from '@lbq/shared';
import { ShapeIcon, shapeBg } from '../components/shapes';
import { sendAnswer, toggleChoice, validateChoices } from './playerStore';
import { selectedChoices, type PlayerState } from './playerState';
import { buttonSize, initialBodies, step, type Arena, type Body } from './movingPhysics';

/**
 * 🌀 Brouilleur (choix multiple only): the usual colored shape buttons, but drifting all over the
 * screen at a medium speed. Single answer: a tap answers (on touch-down, like the normal
 * buttons). « Select all » (`s` given with `multiple`): taps toggle, « Valider » stays still.
 */
export function MovingButtons({
  choiceCount,
  hidden = [],
  by,
  multiple,
  s,
}: {
  choiceCount: number;
  hidden?: number[];
  by: LobbyMember;
  multiple?: boolean;
  s?: PlayerState;
}) {
  const indexes = SHAPES.slice(0, choiceCount)
    .map((shape) => shape.index)
    .filter((i) => !hidden.includes(i));
  const arenaRef = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<number, HTMLButtonElement>());
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const key = indexes.join(',');

  useEffect(() => {
    const el = arenaRef.current;
    if (!el) return;
    let arena: Arena | null = null;
    let bodies: Body[] = [];
    let frame = 0;
    let last = 0;

    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      const button = buttonSize(width, height);
      const next: Arena = { width, height, ...button };
      if (!arena) bodies = initialBodies(key ? key.split(',').map(Number) : [], next);
      else {
        // Resized (rotation, keyboard…): keep the buttons inside the new area.
        for (const b of bodies) {
          b.x = Math.min(b.x, Math.max(0, width - button.w));
          b.y = Math.min(b.y, Math.max(0, height - button.h));
        }
      }
      arena = next;
      setSize(button);
    };

    const tick = (now: number) => {
      if (arena) {
        step(bodies, arena, last ? (now - last) / 1000 : 0);
        for (const b of bodies) {
          const btn = buttons.current.get(b.index);
          if (btn) btn.style.transform = `translate3d(${b.x}px, ${b.y}px, 0)`;
        }
      }
      last = now;
      frame = requestAnimationFrame(tick);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [key]);

  const selected = multiple && s ? selectedChoices(s) : [];
  return (
    <div className="flex flex-1 flex-col gap-3 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <p className="text-center text-sm font-black" data-testid="scrambled-hint">
        🌀 Brouillé par {by.nickname} : vise bien !
        {multiple && <> Plusieurs réponses possibles — coche toutes les bonnes</>}
      </p>
      <div
        ref={arenaRef}
        className="relative flex-1 touch-none overflow-hidden rounded-2xl bg-black/15"
        data-testid="moving-arena"
      >
        {size &&
          indexes.map((index) => {
            const shape = SHAPES[index]!;
            const on = selected.includes(index);
            return (
              <button
                key={index}
                ref={(el) => {
                  if (el) buttons.current.set(index, el);
                  else buttons.current.delete(index);
                }}
                type="button"
                aria-pressed={multiple ? on : undefined}
                aria-label={`Réponse ${shape.symbol}`}
                style={{ width: size.w, height: size.h, transform: 'translate3d(-9999px, 0, 0)' }}
                onPointerDown={
                  multiple
                    ? undefined
                    : (e) => {
                        // Fire on touch-down for speed (points depend on response time).
                        e.preventDefault();
                        sendAnswer({ choiceIndex: index });
                      }
                }
                onClick={() =>
                  multiple ? toggleChoice(index) : sendAnswer({ choiceIndex: index })
                }
                className={`absolute top-0 left-0 flex touch-manipulation items-center justify-center rounded-2xl shadow-[inset_0_-6px_0_rgba(0,0,0,0.25)] will-change-transform active:brightness-90 ${
                  shapeBg[shape.color]
                } ${multiple && on ? 'ring-[5px] ring-white' : ''} ${multiple && !on ? 'opacity-85' : ''}`}
              >
                <ShapeIcon shape={shape.shape} className="size-1/2 fill-white drop-shadow" />
                {on && (
                  <span
                    className="absolute top-1 right-1 flex size-7 items-center justify-center rounded-full bg-white text-base font-black text-brand"
                    aria-hidden="true"
                  >
                    ✓
                  </span>
                )}
              </button>
            );
          })}
      </div>
      {multiple && (
        <motion.button
          type="button"
          whileTap={{ scale: 0.95 }}
          disabled={selected.length === 0}
          onClick={validateChoices}
          className="touch-manipulation rounded-2xl bg-white py-4 text-2xl font-black text-brand shadow-[inset_0_-6px_0_rgba(0,0,0,0.25)] disabled:opacity-50"
        >
          Valider{selected.length > 0 && ` (${selected.length})`}
        </motion.button>
      )}
    </div>
  );
}
