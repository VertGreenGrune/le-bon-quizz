import { findAvatar } from '@lbq/shared';

/** Box size (and corner radius) of each variant. */
const sizes = {
  xs: 'size-6 rounded-md',
  sm: 'size-8 rounded-lg',
  md: 'size-11 rounded-xl',
  lg: 'size-16 rounded-2xl',
  xl: 'size-24 rounded-3xl',
} as const;

export type AvatarSize = keyof typeof sizes;

/**
 * A player's avatar: a portrait from `public/avatars/<id>.jpg` (`AVATARS` in @lbq/shared).
 * Unknown / missing ids (games saved before avatars) render a neutral tile with a question mark.
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
  const box = `inline-flex shrink-0 select-none overflow-hidden ${sizes[size]} ${className}`;
  if (!avatar)
    return (
      <span
        aria-hidden="true"
        className={`${box} items-center justify-center bg-gray-300 font-bold text-gray-500`}
      >
        ?
      </span>
    );
  return (
    <img
      src={`/avatars/${avatar.id}.jpg`}
      alt=""
      aria-hidden="true"
      draggable={false}
      data-avatar={avatar.id}
      className={`${box} bg-[#3d8fc9] object-cover`}
    />
  );
}
