/**
 * Sentry error monitoring, enabled only when `SENTRY_DSN` is set. Must run before Fastify is
 * imported so its instrumentation hooks in: `node --import ./dist/instrument.js dist/index.js`.
 * The Fastify integration (on by default) reports 5xx errors on its own.
 */
import * as Sentry from '@sentry/node';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
    // Fly.io sets FLY_IMAGE_REF to the deployed image (one per deploy).
    release: process.env.SENTRY_RELEASE ?? process.env.FLY_IMAGE_REF,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
  });
}
