import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AUDIO_UPLOAD_MAX_BYTES, UPLOAD_MAX_BYTES, type UploadImageResponse } from '@lbq/shared';
import type { ApiDeps } from './index.js';
import { ApiError } from './errors.js';

/**
 * Detects the image type from its magic bytes (the client-declared mimetype is not trusted,
 * since uploads are served from our own origin).
 */
export function sniffImageType(buf: Buffer): 'png' | 'jpg' | 'gif' | 'webp' | null {
  const ascii = (start: number, end: number) => buf.subarray(start, end).toString('latin1');
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
    return 'png';
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a') return 'gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  return null;
}

/** Detects the audio type from its magic bytes (MP3, OGG, M4A, AAC, WAV). */
export function sniffAudioType(buf: Buffer): 'mp3' | 'ogg' | 'm4a' | 'aac' | 'wav' | null {
  const ascii = (start: number, end: number) => buf.subarray(start, end).toString('latin1');
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return 'wav';
  if (ascii(0, 4) === 'OggS') return 'ogg';
  if (ascii(4, 8) === 'ftyp') return 'm4a'; // MP4 container (M4A / AAC in MP4)
  if (ascii(0, 3) === 'ID3') return 'mp3'; // MP3 with an ID3v2 tag
  if (buf.length >= 2 && buf[0] === 0xff && (buf[1]! & 0xe0) === 0xe0) {
    // MPEG frame sync: layer bits 00 = ADTS (raw AAC), otherwise MPEG audio layer I–III.
    return (buf[1]! & 0x06) === 0 ? 'aac' : 'mp3';
  }
  return null;
}

function publicBaseUrl(request: FastifyRequest, configured?: string): string {
  return (configured ?? `${request.protocol}://${request.host}`).replace(/\/+$/, '');
}

// Local-disk storage served at /uploads/ (phase 2). S3-compatible storage: see T9 follow-up.
export async function uploadRoutes(app: FastifyInstance, { uploadDir, publicUrl }: ApiDeps) {
  const upload = (
    route: string,
    maxBytes: number,
    sniff: (buf: Buffer) => string | null,
    formats: string,
  ) =>
    app.post(route, async (request, reply) => {
      const file = await request.file({ limits: { fileSize: maxBytes, files: 1 } });
      if (!file) throw new ApiError(400, 'INVALID_PAYLOAD', 'Champ "file" manquant');
      const data = await file.toBuffer(); // throws 413 above maxBytes
      const ext = sniff(data);
      if (!ext) throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', `Formats acceptés : ${formats}`);
      const name = `${randomUUID()}.${ext}`;
      await writeFile(path.join(uploadDir, name), data);
      const url = `${publicBaseUrl(request, publicUrl)}/uploads/${name}`;
      return reply.status(201).send({ url } satisfies UploadImageResponse);
    });

  upload('/uploads/image', UPLOAD_MAX_BYTES, sniffImageType, 'PNG, JPEG, GIF, WebP');
  upload('/uploads/audio', AUDIO_UPLOAD_MAX_BYTES, sniffAudioType, 'MP3, OGG, M4A, AAC, WAV');
}
