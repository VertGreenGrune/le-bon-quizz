import { AnimatePresence, motion } from 'framer-motion';
import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { matchLeftLabel, matchRightLabel, type MatchColumns } from '@lbq/shared';
import { MatchSideCard } from './MatchSideCard';

/**
 * « Associer » (T67) board, wires like a repair panel: the left items on the left with a colored
 * plug, the right items on the right with a plug; a link is a thick cable between two plugs.
 * Interactive on the phone (drag a cable from a plug to its partner, or tap one then the other),
 * read-only on the TV and the « Réponse envoyée ! » screen.
 */

/** One color per left item: the cable and its plug. */
export const WIRE_COLORS = ['#e8590c', '#1c7ed6', '#2f9e44', '#ae3ec9', '#f2c400', '#0c8599'];

export type WireSide = 'left' | 'right';

type Point = { x: number; y: number };

/** A cable from `a` to `b`: a curve that leaves each plug horizontally, sagging a little. */
export function wirePath(a: Point, b: Point): string {
  const dx = Math.max(30, Math.abs(b.x - a.x) * 0.45);
  const sag = Math.min(40, Math.abs(b.x - a.x) * 0.15);
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y + sag}, ${b.x - dx} ${b.y + sag}, ${b.x} ${b.y}`;
}

/** Moves under this many pixels count as a tap, above as a drag. */
const TAP_SLOP_PX = 8;

export function WireBoard({
  columns,
  links,
  size = 'phone',
  selected = null,
  onTap,
  onConnect,
  onUnplug,
  draw = false,
  badges,
  colorOf,
  ghosts = [],
}: {
  columns: MatchColumns;
  /** `links[left]` = the right item plugged to it (-1 = none), in shown indexes. */
  links: readonly number[];
  size?: 'phone' | 'tv';
  /** The item tapped first (tap-tap linking). */
  selected?: { side: WireSide; index: number } | null;
  onTap?: (side: WireSide, index: number) => void;
  onConnect?: (left: number, right: number) => void;
  /** A plugged cable pulled out and dropped nowhere. */
  onUnplug?: (left: number) => void;
  /** TV reveal: the cables draw themselves one after the other. */
  draw?: boolean;
  /** Small text after each left item (TV reveal: « ✓ 2 »). */
  badges?: (string | null)[];
  /** The color of a left item's cable and plug (default: one color per item). */
  colorOf?: (left: number) => string;
  /** Thin dashed cables (the result: the right link of a missed pair), `[left, right]`. */
  ghosts?: [number, number][];
}) {
  const interactive = !!onConnect;
  const n = columns.left.length;
  const board = useRef<HTMLDivElement>(null);
  const plugs = useRef<Record<WireSide, (HTMLSpanElement | null)[]>>({ left: [], right: [] });
  const [points, setPoints] = useState<Record<WireSide, Point[]>>({ left: [], right: [] });
  const [drag, setDrag] = useState<{
    side: WireSide;
    index: number;
    start: Point;
    at: Point;
    moved: boolean;
    pointerId: number;
  } | null>(null);

  // Plug centers, in the board's own coordinates: measured with offsets (relative to the board,
  // its positioned ancestor), so a screen sliding / scaling in (CSS transforms) doesn't skew them.
  useLayoutEffect(() => {
    const el = board.current;
    if (!el) return;
    const measure = () => {
      const center = (p: HTMLSpanElement | null): Point => {
        let x = 0;
        let y = 0;
        let node: HTMLElement | null = p;
        while (node && node !== el) {
          x += node.offsetLeft;
          y += node.offsetTop;
          node = node.offsetParent as HTMLElement | null;
        }
        return p ? { x: x + p.offsetWidth / 2, y: y + p.offsetHeight / 2 } : { x: 0, y: 0 };
      };
      setPoints({
        left: plugs.current.left.slice(0, n).map(center),
        right: plugs.current.right.slice(0, n).map(center),
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    // Pictures load later and change the rows' height.
    el.querySelectorAll('img').forEach((img) => img.addEventListener('load', measure));
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [n, columns]);

  /** A pointer position in the board's coordinates (undoing any CSS scale of the screen). */
  const local = (e: { clientX: number; clientY: number }): Point => {
    const el = board.current!;
    const box = el.getBoundingClientRect();
    const scale = el.offsetWidth ? box.width / el.offsetWidth : 1;
    return { x: (e.clientX - box.left) / scale, y: (e.clientY - box.top) / scale };
  };

  const down = (side: WireSide, index: number) => (e: ReactPointerEvent) => {
    if (!interactive) return;
    e.preventDefault();
    board.current?.setPointerCapture(e.pointerId);
    const p = local(e);
    setDrag({ side, index, start: p, at: p, moved: false, pointerId: e.pointerId });
  };
  const move = (e: ReactPointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const at = local(e);
    const moved = drag.moved || Math.hypot(at.x - drag.start.x, at.y - drag.start.y) > TAP_SLOP_PX;
    setDrag({ ...drag, at, moved });
  };
  const up = (e: ReactPointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    setDrag(null);
    if (!drag.moved) return onTap?.(drag.side, drag.index);
    const target = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest<HTMLElement>('[data-wire-side]');
    const side = target?.dataset.wireSide as WireSide | undefined;
    const index = Number(target?.dataset.wireIndex);
    if (side && side !== drag.side && Number.isInteger(index)) {
      navigator.vibrate?.(20);
      return drag.side === 'left' ? onConnect?.(drag.index, index) : onConnect?.(index, drag.index);
    }
    // Pulled a plugged cable out and dropped it nowhere: unplugged.
    const left = drag.side === 'left' ? drag.index : links.indexOf(drag.index);
    if (left >= 0 && links[left]! >= 0) onUnplug?.(left);
  };

  // The cable being dragged comes from its left plug when the drag started on a plugged right item.
  const dragFrom =
    drag?.moved &&
    (drag.side === 'left'
      ? { left: drag.index, from: points.left[drag.index] }
      : { left: links.indexOf(drag.index), from: points.right[drag.index] });
  const color = (left: number) => colorOf?.(left) ?? WIRE_COLORS[left % WIRE_COLORS.length]!;
  const tv = size === 'tv';
  const plugSize = tv ? 'size-7' : 'size-5';
  const cardSize = tv ? 'lg' : 'sm';
  const stroke = tv ? 14 : 9;

  const card = (side: WireSide, index: number) => {
    const isLeft = side === 'left';
    const owner = isLeft ? (links[index]! >= 0 ? index : -1) : links.indexOf(index);
    const plugged = owner >= 0;
    const active = selected?.side === side && selected.index === index;
    const plugColor = isLeft || plugged ? color(isLeft ? index : owner) : '#9ca3af';
    return (
      <button
        key={`${side}${index}`}
        type="button"
        tabIndex={interactive ? 0 : -1}
        disabled={!interactive}
        data-wire-side={side}
        data-wire-index={index}
        data-testid={`match-${side}-${index}`}
        aria-pressed={interactive ? active : undefined}
        onPointerDown={down(side, index)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onTap?.(side, index);
          }
        }}
        className={`flex w-full touch-none items-center gap-2 rounded-2xl text-left shadow select-none ${
          isLeft ? 'flex-row' : 'flex-row-reverse'
        } ${tv ? 'bg-panel px-4 py-2 text-white' : 'min-h-14 bg-white px-2 py-1.5 text-brand'} ${
          active ? 'ring-4 ring-white' : ''
        } disabled:cursor-default`}
      >
        <MatchSideCard
          side={isLeft ? columns.left[index]! : columns.right[index]!}
          label={isLeft ? matchLeftLabel(index) : matchRightLabel(index)}
          size={cardSize}
          className={`min-w-0 flex-1 ${isLeft ? '' : 'justify-end text-right'}`}
        />
        {isLeft && badges?.[index] && (
          <span className="shrink-0 rounded-full bg-black/25 px-2 text-lg font-black">
            {badges[index]}
          </span>
        )}
        <motion.span
          ref={(el) => {
            plugs.current[side][index] = el;
          }}
          animate={{ scale: plugged ? [1.5, 1] : 1 }}
          transition={{ duration: 0.25 }}
          className={`${plugSize} shrink-0 rounded-full border-4 border-black/40 shadow-inner`}
          style={{ background: plugColor }}
          aria-hidden="true"
        />
      </button>
    );
  };

  return (
    <div
      ref={board}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => setDrag(null)}
      className={`relative grid w-full ${tv ? 'grid-cols-[minmax(0,1fr)_10vw_minmax(0,1fr)] gap-y-3' : 'grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)] gap-y-2'}`}
      data-testid="wire-board"
    >
      {columns.left.map((_, i) => [
        <div key={`l${i}`} className="col-start-1 flex">
          {card('left', i)}
        </div>,
        <div key={`r${i}`} className="col-start-3 flex">
          {card('right', i)}
        </div>,
      ])}
      <svg
        className="pointer-events-none absolute inset-0 size-full overflow-visible"
        aria-hidden="true"
      >
        {ghosts.map(([l, r]) => {
          const a = points.left[l];
          const b = points.right[r];
          return a && b ? (
            <path
              key={`ghost-${l}-${r}`}
              d={wirePath(a, b)}
              fill="none"
              stroke="white"
              strokeOpacity={0.85}
              strokeWidth={3}
              strokeDasharray="6 6"
              strokeLinecap="round"
              data-testid="ghost-cable"
            />
          ) : null;
        })}
        <AnimatePresence>
          {links.map((r, l) => {
            const a = points.left[l];
            const b = points.right[r];
            // The cable being moved is drawn by the drag, not here.
            if (r < 0 || !a || !b || (dragFrom && dragFrom.left === l)) return null;
            const order = draw ? links.slice(0, l).filter((x) => x >= 0).length : 0;
            return (
              <Cable
                key={`${l}-${r}`}
                d={wirePath(a, b)}
                color={color(l)}
                width={stroke}
                delay={draw ? 0.4 + order * 0.45 : 0}
              />
            );
          })}
          {dragFrom && dragFrom.from && dragFrom.left >= 0 && (
            <Cable
              key="drag"
              d={
                drag!.side === 'left'
                  ? wirePath(dragFrom.from, drag!.at)
                  : wirePath(points.left[dragFrom.left]!, drag!.at)
              }
              color={color(dragFrom.left)}
              width={stroke}
              instant
            />
          )}
          {dragFrom && dragFrom.from && dragFrom.left < 0 && (
            // From an empty right plug: a grey cable until it reaches a left item.
            <Cable
              key="drag-right"
              d={wirePath(drag!.at, dragFrom.from)}
              color="#9ca3af"
              width={stroke}
              instant
            />
          )}
        </AnimatePresence>
      </svg>
    </div>
  );
}

/** A cable: a dark sheath under the colored wire, drawn from its start when it appears. */
function Cable({
  d,
  color,
  width,
  delay = 0,
  instant = false,
}: {
  d: string;
  color: string;
  width: number;
  delay?: number;
  instant?: boolean;
}) {
  const grow = instant
    ? {}
    : {
        initial: { pathLength: 0 },
        animate: { pathLength: 1 },
        exit: { pathLength: 0, opacity: 0 },
        transition: { duration: 0.35, delay, ease: 'easeOut' as const },
      };
  return (
    <g>
      <motion.path
        d={d}
        fill="none"
        stroke="rgba(0,0,0,0.45)"
        strokeWidth={width + 5}
        strokeLinecap="round"
        {...grow}
      />
      <motion.path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        {...grow}
      />
      <motion.path
        d={d}
        fill="none"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth={Math.max(2, width / 4)}
        strokeLinecap="round"
        transform="translate(0 -2)"
        {...grow}
      />
    </g>
  );
}
