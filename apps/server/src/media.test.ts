/** `/uploads/` served from the `Media` table. The Postgres part needs TEST_DATABASE_URL. */
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrisma, type PrismaClient } from './db.js';
import { contentTypeOf, hashedMediaName, mediaRoutes, parseRange, saveMedia } from './media.js';

describe('media helpers', () => {
  it('only accepts plain media names', () => {
    expect(contentTypeOf('abc.png')).toBe('image/png');
    expect(contentTypeOf('a-b_c.mp3')).toBe('audio/mpeg');
    expect(contentTypeOf('x.html')).toBeNull();
    expect(contentTypeOf('../secret.png')).toBeNull();
    expect(contentTypeOf('a.b.png')).toBeNull();
  });

  it('names a file after its content', () => {
    const a = hashedMediaName(Buffer.from('a'), 'png');
    expect(a).toMatch(/^[0-9a-f]{32}\.png$/);
    expect(hashedMediaName(Buffer.from('a'), 'png')).toBe(a);
    expect(hashedMediaName(Buffer.from('b'), 'png')).not.toBe(a);
  });

  it('parses one byte range', () => {
    expect(parseRange('bytes=0-', 10)).toEqual([0, 9]);
    expect(parseRange('bytes=2-5', 10)).toEqual([2, 5]);
    expect(parseRange('bytes=4-99', 10)).toEqual([4, 9]);
    expect(parseRange('bytes=-3', 10)).toEqual([7, 9]);
    expect(parseRange('bytes=10-', 10)).toBeNull();
    expect(parseRange('bytes=5-2', 10)).toBeNull();
    expect(parseRange('bytes=0-1,4-5', 10)).toBeUndefined();
    expect(parseRange('items=0-1', 10)).toBeUndefined();
  });
});

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)('/uploads/ from the database (Postgres)', () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;
  let dir: string;
  const data = Buffer.from('0123456789');

  beforeAll(async () => {
    execSync('pnpm exec prisma migrate deploy', {
      cwd: path.resolve(import.meta.dirname, '..'),
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
      stdio: 'ignore',
    });
    prisma = createPrisma(TEST_DATABASE_URL);
    dir = mkdtempSync(path.join(tmpdir(), 'lbq-media-'));
    writeFileSync(path.join(dir, 'old.wav'), Buffer.from('old file'));
    app = Fastify();
    await app.register(mediaRoutes, { prisma, uploadDir: dir });
    await app.ready();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE "Media"');
  });

  it('serves a stored file with its type and long caching', async () => {
    await saveMedia(prisma, 'clip.mp3', data);
    await saveMedia(prisma, 'clip.mp3', Buffer.from('other')); // same name: kept as is
    const res = await app.inject('/uploads/clip.mp3');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('audio/mpeg');
    expect(res.headers['cache-control']).toContain('immutable');
    expect(res.headers['accept-ranges']).toBe('bytes');
    // T65: readable from a canvas of the editor (another origin in dev).
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.rawPayload.equals(data)).toBe(true);
    expect(await prisma.media.findUnique({ where: { name: 'clip.mp3' } })).toMatchObject({
      contentType: 'audio/mpeg',
      size: 10,
    });
  });

  it('answers byte ranges (seeking in a sound)', async () => {
    await saveMedia(prisma, 'seek.mp3', data);
    const part = await app.inject({ url: '/uploads/seek.mp3', headers: { range: 'bytes=3-5' } });
    expect(part.statusCode).toBe(206);
    expect(part.headers['content-range']).toBe('bytes 3-5/10');
    expect(part.body).toBe('345');
    const bad = await app.inject({ url: '/uploads/seek.mp3', headers: { range: 'bytes=20-' } });
    expect(bad.statusCode).toBe(416);
    const head = await app.inject({ method: 'HEAD', url: '/uploads/seek.mp3' });
    expect(head.statusCode).toBe(200);
    expect(head.headers['content-length']).toBe('10');
  });

  it('still serves a file of the old upload dir, 404 otherwise', async () => {
    const old = await app.inject('/uploads/old.wav');
    expect(old.statusCode).toBe(200);
    expect(old.body).toBe('old file');
    for (const url of ['/uploads/missing.png', '/uploads/x.html', '/uploads/..%2Fsecret.png']) {
      expect((await app.inject(url)).statusCode, url).toBe(404);
    }
  });
});
