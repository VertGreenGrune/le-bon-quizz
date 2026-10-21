import { AUDIO_UPLOAD_MAX_BYTES, UPLOAD_MAX_BYTES } from '@lbq/shared';

export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

/** Client-side pre-check (the server re-checks the magic bytes). Returns an error or null. */
export function checkImageFile(file: { type: string; size: number }): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) return 'Formats acceptés : PNG, JPEG, GIF, WebP';
  if (file.size > UPLOAD_MAX_BYTES) {
    return `Image trop lourde (${Math.round(UPLOAD_MAX_BYTES / 1024 / 1024)} Mo maximum)`;
  }
  return null;
}

/** `accept` of the sound input (types + extensions: some systems give no MIME type). */
export const ACCEPTED_AUDIO =
  'audio/mpeg,audio/ogg,audio/mp4,audio/aac,audio/wav,.mp3,.ogg,.oga,.m4a,.aac,.wav';
const AUDIO_EXTENSIONS = /\.(mp3|ogg|oga|m4a|aac|wav)$/i;

/** Client-side pre-check of a sound (the server re-checks the magic bytes). */
export function checkAudioFile(file: { name: string; type: string; size: number }): string | null {
  if (!file.type.startsWith('audio/') && !AUDIO_EXTENSIONS.test(file.name)) {
    return 'Formats acceptés : MP3, OGG, M4A, AAC, WAV';
  }
  if (file.size > AUDIO_UPLOAD_MAX_BYTES) {
    return `Son trop lourd (${Math.round(AUDIO_UPLOAD_MAX_BYTES / 1024 / 1024)} Mo maximum)`;
  }
  return null;
}
