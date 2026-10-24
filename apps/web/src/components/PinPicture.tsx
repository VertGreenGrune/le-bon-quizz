import type { PointerEvent, ReactNode } from 'react';
import type { PinPoint, PinZone } from '@lbq/shared';
import { mediaUrl } from '../lib/mediaUrl';

/**
 * PIN questions: a picture with marks placed on it in picture fractions (0–1 from the top left),
 * like the server measures distances. The wrapper shrinks to the picture, so percentages of the
 * wrapper are percentages of the picture.
 */
export function PinPicture({
  src,
  onPick,
  className = '',
  imgClassName = '',
  children,
}: {
  src: string;
  /** Tap / click on the picture: the point in picture fractions. */
  onPick?: (point: PinPoint) => void;
  className?: string;
  imgClassName?: string;
  children?: ReactNode;
}) {
  const pick = (e: PointerEvent<HTMLDivElement>) => {
    if (!onPick) return;
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    onPick({
      x: clamp01((e.clientX - r.left) / r.width),
      y: clamp01((e.clientY - r.top) / r.height),
    });
  };
  return (
    <div
      className={`relative inline-block touch-none select-none ${onPick ? 'cursor-crosshair' : ''} ${className}`}
      onPointerDown={onPick ? pick : undefined}
      data-testid="pin-picture"
    >
      <img src={mediaUrl(src)} alt="" draggable={false} className={`block ${imgClassName}`} />
      {children}
    </div>
  );
}

const clamp01 = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 10_000) / 10_000;
const pct = (v: number) => `${v * 100}%`;

/** The correct zone: an ellipse on a non-square picture (radius in widths / heights). */
export function PinZoneMark({ zone, className = '' }: { zone: PinZone; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute rounded-[50%] border-4 border-white bg-answer-green/45 shadow-[0_0_0_3px_rgba(0,0,0,0.35)] ${className}`}
      style={{
        left: pct(zone.x - zone.radius),
        top: pct(zone.y - zone.radius),
        width: pct(2 * zone.radius),
        height: pct(2 * zone.radius),
      }}
    />
  );
}

/** Something centred on a point of the picture (a pin, an avatar…). */
export function PinMarker({
  point,
  className = '',
  children,
}: {
  point: PinPoint;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <span
      className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 ${className}`}
      style={{ left: pct(point.x), top: pct(point.y) }}
    >
      {children}
    </span>
  );
}
