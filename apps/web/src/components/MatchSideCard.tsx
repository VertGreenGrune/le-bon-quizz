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
  // The picture may shrink (never below a readable size) before the text breaks a word.
  const img = {
    sm: 'h-10 min-w-9 max-w-[40%]',
    md: 'h-14 min-w-12 max-w-[40%]',
    lg: 'h-[9vh] min-w-[5vw] max-w-[40%]',
  }[size];
  const textMin = { sm: 'min-w-[4rem]', md: 'min-w-[5rem]', lg: 'min-w-[6rem]' }[size];
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
          className={`${img} min-w-0 shrink rounded object-contain`}
          draggable={false}
        />
      )}
      {/* Never squeezed to a letter per line beside a picture: whole words, wrapped. */}
      {side.text && (
        <span className={`${textMin} flex-1 font-bold break-words ${text}`}>{side.text}</span>
      )}
    </span>
  );
}
