/**
 * Uploaded pictures and sounds live in the `Media` table and are served at `/uploads/<name>`
 * (the URLs saved in quizzes since the uploads were files keep working). A file still in the
 * old upload dir is served from there until `media:to-db` copies it. Files never change
 * (names are hashes / random ids), so they are cached in memory and by browsers for a year.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from './db.js';

const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
};

/** `<hash or uuid>.<ext>`: nothing else is ever served (no path traversal). */
const MEDIA_NAME = /^[\w-]{1,80}\.([a-z0-9]{2,5})$/;

export function contentTypeOf(name: string): string | null {
  const ext = MEDIA_NAME.exec(name)?.[1];
  return (ext && CONTENT_TYPES[ext]) || null;
}

/** Name of a file from its content (same bytes = same name, so re-imports reuse it). */
export const hashedMediaName = (data: Buffer, ext: string) =>
  `${createHash('sha256').update(data).digest('hex').slice(0, 32)}.${ext}`;

/** Stores a media file (nothing to do when that name is already stored). */
export async function saveMedia(prisma: PrismaClient, name: string, data: Buffer): Promise<void> {
  const contentType = contentTypeOf(name);
  if (!contentType) throw new Error(`Nom de média invalide : ${name}`);
  await prisma.media.upsert({
    where: { name },
    create: { name, contentType, size: data.length, data: new Uint8Array(data) },
    update: {},
  });
}

interface Cached {
  contentType: string;
  data: Buffer;
}

/** Keeps the most recently served files in memory, up to `maxBytes` in all. */
class MediaCache {
  private readonly files = new Map<string, Cached>();
  private bytes = 0;
  constructor(private readonly maxBytes: number) {}

  get(name: string): Cached | undefined {
    const file = this.files.get(name);
    if (file) {
      this.files.delete(name); // most recent last
      this.files.set(name, file);
    }
    return file;
  }

  set(name: string, file: Cached): void {
    if (file.data.length > this.maxBytes || this.files.has(name)) return;
    this.files.set(name, file);
    this.bytes += file.data.length;
    for (const [oldest, old] of this.files) {
      if (this.bytes <= this.maxBytes) break;
      this.files.delete(oldest);
      this.bytes -= old.data.length;
    }
  }
}

/** `Range: bytes=a-b` (one range) → [start, end] inclusive; null = not satisfiable. */
export function parseRange(header: string, size: number): [number, number] | null | undefined {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (!m[1] && !m[2])) return undefined; // not a single byte range: send everything
  let start: number;
  let end: number;
  if (!m[1]) {
    start = Math.max(0, size - Number(m[2])); // last n bytes
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  }
  return start <= end && start < size ? [start, end] : null;
}

export interface MediaRoutesOptions {
  prisma: PrismaClient;
  /** Old upload dir, read for files not copied to the database yet. */
  uploadDir?: string;
  /** Memory cache size; default 128 MB. */
  cacheBytes?: number;
}

export async function mediaRoutes(
  app: FastifyInstance,
  { prisma, uploadDir, cacheBytes = 128 * 1024 * 1024 }: MediaRoutesOptions,
): Promise<void> {
  const cache = new MediaCache(cacheBytes);

  const load = async (name: string): Promise<Cached | null> => {
    const cached = cache.get(name);
    if (cached) return cached;
    const row = await prisma.media.findUnique({
      where: { name },
      select: { contentType: true, data: true },
    });
    let file: Cached | null = row
      ? { contentType: row.contentType, data: Buffer.from(row.data) }
      : null;
    if (!file && uploadDir) {
      const data = await readFile(path.join(uploadDir, name)).catch(() => null);
      if (data) file = { contentType: contentTypeOf(name)!, data };
    }
    if (file) cache.set(name, file);
    return file;
  };

  const serve = async (request: FastifyRequest, reply: FastifyReply) => {
    const { name } = request.params as { name: string };
    const file = contentTypeOf(name) ? await load(name) : null;
    if (!file) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Route introuvable' } });
    }
    const size = file.data.length;
    reply
      .header('content-type', file.contentType)
      .header('x-content-type-options', 'nosniff')
      .header('cache-control', 'public, max-age=31536000, immutable')
      // T65: the editor reads a picture's pixels (« Couleurs perdues » paint bucket) from a
      // canvas: public files, no credentials, so any page may read them.
      .header('access-control-allow-origin', '*')
      .header('cross-origin-resource-policy', 'cross-origin')
      .header('accept-ranges', 'bytes');
    const header = request.headers.range;
    const range = header ? parseRange(header, size) : undefined;
    if (range === null) {
      return reply.status(416).header('content-range', `bytes */${size}`).send();
    }
    const [start, end] = range ?? [0, size - 1];
    if (range) reply.status(206).header('content-range', `bytes ${start}-${end}/${size}`);
    reply.header('content-length', end - start + 1);
    return reply.send(file.data.subarray(start, end + 1)); // HEAD: Fastify drops the body
  };

  app.get('/uploads/:name', serve); // Fastify also answers HEAD with it
}
