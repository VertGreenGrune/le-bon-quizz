import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import type { ApiErrorBody } from '@lbq/shared';

/** Server routes and Vite assets: a miss there is a real 404, never the SPA's index.html. */
const SERVER_PATHS = /^\/(api|uploads|socket\.io|health|assets)(\/|$)/;

/**
 * Production: serves the built web app (`apps/web/dist`) from the same origin as the API and
 * Socket.IO, so the `SameSite=Lax` session cookie works without CORS. Unknown GETs fall back to
 * `index.html` (client-side routes such as `/host/123456`).
 */
export async function registerWeb(app: FastifyInstance, distDir: string): Promise<void> {
  await app.register(fastifyStatic, {
    root: distDir,
    prefix: '/',
    wildcard: false,
    setHeaders: (res, filePath) => {
      // Vite fingerprints everything under assets/; index.html must always be revalidated.
      res.header(
        'cache-control',
        /[\\/]assets[\\/]/.test(filePath) ? 'public, max-age=31536000, immutable' : 'no-cache',
      );
    },
  });

  app.setNotFoundHandler((request, reply) => {
    const path = request.url.split('?')[0] ?? '/';
    if ((request.method === 'GET' || request.method === 'HEAD') && !SERVER_PATHS.test(path)) {
      return reply.sendFile('index.html');
    }
    const body: ApiErrorBody = { error: { code: 'NOT_FOUND', message: 'Route introuvable' } };
    return reply.status(404).send(body);
  });
}
