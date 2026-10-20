import { UPLOAD_MAX_BYTES } from '@lbq/shared';

export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

/** Client-side pre-check (the server re-checks the magic bytes). Returns an error or null. */
export function checkImageFile(file: { type: string; size: number }): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) return 'Formats acceptés : PNG, JPEG, GIF, WebP';
  if (file.size > UPLOAD_MAX_BYTES) {
    return `Image trop lourde (${Math.round(UPLOAD_MAX_BYTES / 1024 / 1024)} Mo maximum)`;
  }
  return null;
}
