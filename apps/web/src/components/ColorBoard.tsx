import { useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import type { ColorBoard as Board } from '@lbq/shared';
import { mediaUrl } from '../lib/mediaUrl';
import {
  boardAspect,
  boardPicture,
  colorHex,
  fitBox,
  nearestSpot,
  shapePath,
  type BoardColor,
} from '../lib/colors';

/**
 * « Couleurs perdues » (T58): the board, the same on the TV, the phones, the editor and the
 * report. Generated board = an SVG grid of shapes; picture board = the picture with its zones.
 * - `colored`: the colors are visible (memorizing, reveal): shapes filled with `colors`, the
 *   colored picture with the zones outlined;
 * - otherwise: shapes / zones filled with `colors` (what a player put) or grey; the picture is
 *   the blank one (T65: zones in white) or, for older questions, the colored one in grayscale.
 * Paint-bucket zones (T65, no `radius`) are numbered markers at their tap point; with `onSpot`
 * a tap anywhere on the picture picks the nearest one.
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
  colors?: readonly BoardColor[];
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
  const picture = boardPicture(board, colored);
  const grey = !colored && !board.blankImageUrl;
  // Paint-bucket boards: a tap anywhere picks the nearest marker.
  const tapAnywhere =
    onSpot && picture && board.spots.some((s) => s.radius === undefined)
      ? (e: MouseEvent<HTMLDivElement>) => {
          const r = e.currentTarget.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return;
          const zone = nearestSpot(
            board.spots,
            (e.clientX - r.left) / r.width,
            (e.clientY - r.top) / r.height,
            r.width / r.height,
          );
          if (zone >= 0 && !locked?.has(zone)) onSpot(zone);
        }
      : undefined;
  const inner = (
    <div
      className={`relative overflow-hidden rounded-xl bg-white shadow-lg select-none [container-type:inline-size] ${fit ? '' : `w-full ${className}`} ${tapAnywhere ? 'cursor-pointer touch-manipulation' : ''}`}
      style={fit ? (box ?? { width: 0, height: 0 }) : { aspectRatio: aspect }}
      onClick={tapAnywhere}
      data-testid="color-board"
    >
      {picture ? (
        <img
          src={mediaUrl(picture)}
          alt=""
          draggable={false}
          onLoad={(e) => {
            const img = e.currentTarget;
            if (img.naturalHeight > 0) setPictureAspect(img.naturalWidth / img.naturalHeight);
          }}
          className={`absolute inset-0 size-full object-fill ${grey ? 'grayscale' : ''}`}
          data-testid="color-board-picture"
        />
      ) : (
        <svg
          viewBox={`0 0 ${cols * 100} ${rows * 100}`}
          className="absolute inset-0 size-full"
          aria-hidden="true"
        >
          {board.spots.map((spot, i) => {
            const r = (spot.radius ?? 0.1) * cols * 100;
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
          picture={!!picture}
          colored={colored}
          fill={colors[i]}
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
  colored,
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
  colored: boolean;
  /** The color shown on the zone (a player's, or the right one when colored). */
  fill?: BoardColor;
  number?: number;
  mark?: boolean | null;
  label?: string | null;
  selected: boolean;
  locked?: boolean;
  onClick?: () => void;
}) {
  const marker = spot.radius === undefined;
  const hasFill = fill !== undefined && fill !== null && fill !== -1;
  const style = {
    left: `${spot.x * 100}%`,
    top: `${spot.y * 100}%`,
    width: marker ? 'clamp(1.4rem, 9cqw, 5rem)' : `${spot.radius! * 200}%`,
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
  // Round picture zones (T58): the color a player put, never over the colored picture.
  // Markers (T65): always the color they hold (the player's, or the right one when colored).
  const showFill = picture && hasFill && (marker || !colored);
  const border = !picture
    ? ''
    : marker
      ? hasFill
        ? 'border-[3px] border-white shadow-[0_0_0_2px_rgba(0,0,0,0.6)]'
        : `border-[3px] border-dashed border-black/70 shadow-[0_0_0_2px_rgba(255,255,255,0.8)] ${colored ? 'bg-black/35' : 'bg-white/70'}`
      : showFill
        ? 'border-[3px] border-white shadow-[0_0_0_2px_rgba(0,0,0,0.6)]'
        : 'border-[3px] border-dashed border-white shadow-[0_0_0_2px_rgba(0,0,0,0.5)]';
  const classes = `absolute flex aspect-square -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[clamp(0.55rem,4.5cqw,2rem)] whitespace-nowrap ${border} ${mark != null ? `ring-[3px] ${mark ? 'ring-answer-green' : 'ring-answer-red'}` : ''} ${selected ? 'z-10 ring-4 ring-white ring-offset-2 ring-offset-black animate-pulse' : ''}`;
  const bg = showFill ? { backgroundColor: colorHex(fill) } : undefined;
  return onClick ? (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
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
