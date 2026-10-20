import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerWeb } from './web.js';

describe('registerWeb (built web app served by the server)', () => {
  let dir: string;
  let app: FastifyInstance;

  beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'lbq-web-'));
    mkdirSync(path.join(dir, 'assets'));
    writeFileSync(path.join(dir, 'index.html'), '<!doctype html><div id="root"></div>');
    writeFileSync(path.join(dir, 'assets', 'main-abc123.js'), 'console.log(1)');
    app = Fastify();
    app.get('/health', async () => ({ status: 'ok' }));
    await registerWeb(app, dir);
  });

  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('serves index.html, never cached', async () => {
    const res = await app.inject('/');
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('id="root"');
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('serves fingerprinted assets as immutable', async () => {
    const res = await app.inject('/assets/main-abc123.js');
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toContain('immutable');
  });

  it('falls back to index.html for client-side routes', async () => {
    for (const url of ['/host/123456', '/join?pin=123456', '/editor/abc']) {
      const res = await app.inject(url);
      expect(res.statusCode, url).toBe(200);
      expect(res.body, url).toContain('id="root"');
    }
  });

  it('answers a JSON 404 for server paths, missing assets and non-GET requests', async () => {
    for (const [method, url] of [
      ['GET', '/api/nope'],
      ['GET', '/uploads/missing.png'],
      ['GET', '/assets/missing.js'],
      ['POST', '/host/123456'],
    ] as const) {
      const res = await app.inject({ method, url });
      expect(res.statusCode, url).toBe(404);
      expect(res.json(), url).toEqual({
        error: { code: 'NOT_FOUND', message: 'Route introuvable' },
      });
    }
  });
});
