import type { FirebaseWebConfig } from '@lbq/shared';
import type { FirebaseVerifier } from '../auth/firebase.js';
import type { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import { requireAuth } from '../auth/index.js';
import type { AuthRateLimits } from '../auth/rateLimit.js';
import type { PrismaClient } from '../db.js';
import type { Mailer } from '../mail/mailer.js';
import { mediaRoutes } from '../media.js';
import { authRoutes } from './auth.routes.js';
import { installErrorHandler } from './errors.js';
import { gameRoutes } from './games.routes.js';
import { libraryRoutes } from './library.routes.js';
import { quizRoutes } from './quizzes.routes.js';
import { uploadRoutes } from './uploads.routes.js';

export interface ApiDeps {
  prisma: PrismaClient;
  /**
   * Old upload dir: pictures / sounds now live in the database (`Media`); files still there
   * (not copied by `media:to-db` yet) are served too.
   */
  uploadDir?: string;
  /** Public base URL of this server for upload URLs; defaults to the request's host. */
  publicUrl?: string;
  /** Sends the password reset e-mails; default: written to the log. */
  mailer?: Mailer;
  /** Web app origin used in e-mailed links; defaults to the request's `Origin`. */
  publicWebUrl?: string;
  /** In-memory limits of login / reset requests; default: fresh ones. */
  rateLimits?: AuthRateLimits;
  /**
   * T46: Firebase Auth. Set = hosts sign in with Firebase (`POST /auth/firebase`) and the
   * e-mail / password endpoints answer 404 `LOCAL_AUTH_DISABLED`; absent = local accounts.
   */
  firebase?: { config: FirebaseWebConfig; verify: FirebaseVerifier };
}

/** REST API of PLAN.md §6 under `/api`, plus static `/uploads/`. */
export async function registerApi(app: FastifyInstance, deps: ApiDeps): Promise<void> {
  await app.register(cookie);
  // Size limits are set per upload route (images / audio).
  await app.register(multipart, { limits: { files: 1 } });
  await app.register(mediaRoutes, { prisma: deps.prisma, uploadDir: deps.uploadDir });

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
        await priv.register(libraryRoutes, deps);
        await priv.register(uploadRoutes, deps);
      });
    },
    { prefix: '/api' },
  );
}
