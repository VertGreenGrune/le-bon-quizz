import type { MatchSide } from '@lbq/shared';
import { mediaUrl } from '../lib/mediaUrl';

/**
 * « Associer » (T67): one item of a column — its picture and / or its text, with its label
 * (1, 2, 3… on the left, A, B, C… on the right). Used by the TV, the phones and the report.
 */
export function MatchSideCard({
  side,
  label,
  size = 'md',
  className = '',
}: {
  side: MatchSide;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const img = { sm: 'h-10 max-w-16', md: 'h-14 max-w-24', lg: 'h-[9vh] max-w-[14vw]' }[size];
  const text = { sm: 'text-sm', md: 'text-base', lg: 'text-2xl' }[size];
  return (
    <span className={`flex min-w-0 items-center gap-2 ${className}`}>
      {label && (
        <span
          className={`shrink-0 rounded-md bg-black/25 px-1.5 font-black tabular-nums ${text}`}
          aria-hidden="true"
        >
          {label}
        </span>
      )}
      {side.imageUrl && (
        <img
          src={mediaUrl(side.imageUrl)}
          alt={side.text ?? ''}
          className={`${img} shrink-0 rounded object-contain`}
          draggable={false}
        />
      )}
      {side.text && <span className={`min-w-0 font-bold break-words ${text}`}>{side.text}</span>}
    </span>
  );
}
