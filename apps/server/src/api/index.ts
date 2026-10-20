import { mkdirSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { UPLOAD_MAX_BYTES } from '@lbq/shared';
import { requireAuth } from '../auth/index.js';
import type { PrismaClient } from '../db.js';
import { authRoutes } from './auth.routes.js';
import { installErrorHandler } from './errors.js';
import { gameRoutes } from './games.routes.js';
import { quizRoutes } from './quizzes.routes.js';
import { uploadRoutes } from './uploads.routes.js';

export interface ApiDeps {
  prisma: PrismaClient;
  /** Absolute directory where uploaded images are written (served at `/uploads/`). */
  uploadDir: string;
  /** Public base URL of this server for upload URLs; defaults to the request's host. */
  publicUrl?: string;
}

/** REST API of PLAN.md §6 under `/api`, plus static `/uploads/`. */
export async function registerApi(app: FastifyInstance, deps: ApiDeps): Promise<void> {
  mkdirSync(deps.uploadDir, { recursive: true });
  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: UPLOAD_MAX_BYTES, files: 1 } });
  await app.register(fastifyStatic, {
    root: deps.uploadDir,
    prefix: '/uploads/',
    decorateReply: false,
    setHeaders: (res) => {
      res.header('x-content-type-options', 'nosniff');
      res.header('cache-control', 'public, max-age=31536000, immutable');
    },
  });

  await app.register(
    async (api) => {
      api.decorateRequest('user', null);
      installErrorHandler(api);
      await api.register(authRoutes, deps);
      // Everything else requires a logged-in host.
      await api.register(async (priv) => {
        priv.addHook('onRequest', requireAuth(deps.prisma));
        await priv.register(quizRoutes, deps);
        await priv.register(gameRoutes, deps);
        await priv.register(uploadRoutes, deps);
      });
    },
    { prefix: '/api' },
  );
}
