import { findAvatar } from '@lbq/shared';

/** Box + emoji size of each variant. */
const sizes = {
  xs: 'size-6 text-sm',
  sm: 'size-8 text-lg',
  md: 'size-11 text-2xl',
  lg: 'size-16 text-4xl',
  xl: 'size-24 text-6xl',
} as const;

export type AvatarSize = keyof typeof sizes;

/**
 * A player's avatar: an animal emoji on a colored circle (`AVATARS` in @lbq/shared). Unknown /
 * missing ids (games saved before avatars) render a neutral circle with a question mark.
 */
export function Avatar({
  id,
  size = 'md',
  className = '',
}: {
  id: string | null | undefined;
  size?: AvatarSize;
  className?: string;
}) {
  const avatar = findAvatar(id);
  return (
    <span
      aria-hidden="true"
      data-avatar={avatar?.id}
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full leading-none ${sizes[size]} ${avatar ? '' : 'bg-gray-300 text-gray-500'} ${className}`}
      style={avatar ? { backgroundColor: avatar.color } : undefined}
    >
      {avatar ? avatar.emoji : '?'}
    </span>
  );
}
