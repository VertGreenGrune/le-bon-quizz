import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { UploadImageResponse } from '@lbq/shared';
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

function publicBaseUrl(request: FastifyRequest, configured?: string): string {
  return (configured ?? `${request.protocol}://${request.host}`).replace(/\/+$/, '');
}

// Local-disk storage served at /uploads/ (phase 2). S3-compatible storage: see T9 follow-up.
export async function uploadRoutes(app: FastifyInstance, { uploadDir, publicUrl }: ApiDeps) {
  app.post('/uploads/image', async (request, reply) => {
    const file = await request.file();
    if (!file) throw new ApiError(400, 'INVALID_PAYLOAD', 'Champ "file" manquant');
    const data = await file.toBuffer(); // throws 413 above UPLOAD_MAX_BYTES
    const ext = sniffImageType(data);
    if (!ext) {
      throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Formats acceptés : PNG, JPEG, GIF, WebP');
    }
    const name = `${randomUUID()}.${ext}`;
    await writeFile(path.join(uploadDir, name), data);
    const url = `${publicBaseUrl(request, publicUrl)}/uploads/${name}`;
    return reply.status(201).send({ url } satisfies UploadImageResponse);
  });
}
