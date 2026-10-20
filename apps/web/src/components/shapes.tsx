import type { Shape } from '@lbq/shared';

/** Shared by host screen (T2) and phone controller (T3). Index ↔ shape is defined in SHAPES. */
export const shapeBg = {
  red: 'bg-answer-red',
  blue: 'bg-answer-blue',
  yellow: 'bg-answer-yellow',
  green: 'bg-answer-green',
} as const;

const paths: Record<Shape, string> = {
  triangle: 'M50 8 L94 88 L6 88 Z',
  diamond: 'M50 4 L96 50 L50 96 L4 50 Z',
  circle: 'M50 6 A44 44 0 1 1 49.99 6 Z',
  square: 'M10 10 H90 V90 H10 Z',
};

export function ShapeIcon({ shape, className }: { shape: Shape; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <path d={paths[shape]} />
    </svg>
  );
}
