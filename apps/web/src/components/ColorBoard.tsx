import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { ColorBoard as Board } from '@lbq/shared';
import { mediaUrl } from '../lib/mediaUrl';
import { boardAspect, colorHex, fitBox, shapePath } from '../lib/colors';

/**
 * « Couleurs perdues » (T58): the board, the same on the TV, the phones, the editor and the
 * report. Generated board = an SVG grid of shapes; picture board = the picture with its zones.
 * - `colored`: the colors are visible (memorizing, reveal): shapes filled with `colors`, the
 *   picture in color with the zones outlined;
 * - otherwise grey: shapes / zones filled with `colors` (what a player put) or grey, picture in
 *   grayscale.
 */
export function ColorBoardView({
  board,
  colors = [],
  colored = false,
  numbers = true,
  marks,
  labels,
  selected,
  locked,
  onSpot,
  fit = false,
  className = '',
}: {
  board: Board;
  colors?: readonly number[];
  colored?: boolean;
  numbers?: boolean;
  /** ✓ / ✗ per zone (reveal, a player's board). */
  marks?: readonly (boolean | null)[];
  /** Under the number (reveal: « 2 / 3 »). */
  labels?: readonly (string | null)[];
  selected?: number;
  /** Zones that can't be changed (50/50). */
  locked?: ReadonlySet<number>;
  onSpot?: (zone: number) => void;
  /** Fill the parent (which must have a size) keeping the board's aspect ratio. */
  fit?: boolean;
  className?: string;
}) {
  const [pictureAspect, setPictureAspect] = useState<number>();
  const aspect = boardAspect(board, pictureAspect);
  const outer = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    if (!fit || !outer.current) return;
    const el = outer.current;
    const measure = () => setBox(fitBox(el.clientWidth, el.clientHeight, aspect));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [fit, aspect]);

  const cols = board.cols ?? 1;
  const rows = board.rows ?? 1;
  const inner = (
    <div
      className={`relative overflow-hidden rounded-xl bg-white shadow-lg select-none [container-type:inline-size] ${fit ? '' : `w-full ${className}`}`}
      style={fit ? (box ?? { width: 0, height: 0 }) : { aspectRatio: aspect }}
      data-testid="color-board"
    >
      {board.imageUrl ? (
        <img
          src={mediaUrl(board.imageUrl)}
          alt=""
          draggable={false}
          onLoad={(e) => {
            const img = e.currentTarget;
            if (img.naturalHeight > 0) setPictureAspect(img.naturalWidth / img.naturalHeight);
          }}
          className={`absolute inset-0 size-full object-fill ${colored ? '' : 'grayscale'}`}
        />
      ) : (
        <svg
          viewBox={`0 0 ${cols * 100} ${rows * 100}`}
          className="absolute inset-0 size-full"
          aria-hidden="true"
        >
          {board.spots.map((spot, i) => {
            const r = spot.radius * cols * 100;
            const fill = colored || colors[i] !== undefined ? colorHex(colors[i]) : colorHex(-1);
            return (
              <path
                key={i}
                d={shapePath(spot.shape ?? 'circle')}
                transform={`translate(${spot.x * cols * 100} ${spot.y * rows * 100}) scale(${r})`}
                fill={fill}
                stroke="#1f2937"
                strokeWidth={4 / r}
                data-testid="color-shape"
                data-color={colors[i] ?? -1}
              />
            );
          })}
        </svg>
      )}
      {board.spots.map((spot, i) => (
        <Spot
          key={i}
          spot={spot}
          picture={!!board.imageUrl}
          fill={board.imageUrl && !colored ? colors[i] : undefined}
          number={numbers ? i + 1 : undefined}
          mark={marks?.[i]}
          label={labels?.[i]}
          selected={selected === i}
          locked={locked?.has(i)}
          onClick={onSpot && !locked?.has(i) ? () => onSpot(i) : undefined}
        />
      ))}
    </div>
  );
  if (!fit) return inner;
  return (
    <div ref={outer} className={`flex min-h-0 items-center justify-center ${className}`}>
      {inner}
    </div>
  );
}

function Spot({
  spot,
  picture,
  fill,
  number,
  mark,
  label,
  selected,
  locked,
  onClick,
}: {
  spot: Board['spots'][number];
  picture: boolean;
  /** Picture, grey board: the color a player put (-1 = none). */
  fill?: number;
  number?: number;
  mark?: boolean | null;
  label?: string | null;
  selected: boolean;
  locked?: boolean;
  onClick?: () => void;
}) {
  const style = {
    left: `${spot.x * 100}%`,
    top: `${spot.y * 100}%`,
    width: `${spot.radius * 200}%`,
  };
  const content: ReactNode = (
    <>
      {number !== undefined && (
        <span className="pointer-events-none flex flex-col items-center leading-none font-black text-white [text-shadow:0_0_3px_#000,0_0_6px_#000]">
          <span className="text-[1.3em]">{locked ? '🎯' : number}</span>
          {label && <span className="mt-0.5 text-[0.7em]">{label}</span>}
        </span>
      )}
      {mark != null && (
        <span
          className={`absolute -top-[12%] -right-[12%] flex size-[45%] items-center justify-center rounded-full text-[0.8em] font-black text-white ${mark ? 'bg-answer-green' : 'bg-answer-red'}`}
        >
          {mark ? '✓' : '✗'}
        </span>
      )}
    </>
  );
  const classes = `absolute flex aspect-square -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[clamp(0.55rem,4.5cqw,2rem)] whitespace-nowrap ${
    picture
      ? fill === undefined
        ? 'border-[3px] border-dashed border-white shadow-[0_0_0_2px_rgba(0,0,0,0.5)]'
        : 'border-[3px] border-white shadow-[0_0_0_2px_rgba(0,0,0,0.6)]'
      : ''
  } ${mark != null ? `ring-[3px] ${mark ? 'ring-answer-green' : 'ring-answer-red'}` : ''} ${selected ? 'z-10 ring-4 ring-white ring-offset-2 ring-offset-black animate-pulse' : ''}`;
  const bg = picture && fill !== undefined ? { backgroundColor: colorHex(fill) } : undefined;
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Zone ${number ?? ''}`}
      aria-pressed={selected}
      className={`${classes} touch-manipulation`}
      style={{ ...style, ...bg }}
      data-testid="color-spot"
    >
      {content}
    </button>
  ) : (
    <span className={classes} style={{ ...style, ...bg }} data-testid="color-spot">
      {content}
    </span>
  );
}
