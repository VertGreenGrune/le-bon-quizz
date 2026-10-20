import * as Sentry from '@sentry/react';

/**
 * Browser error monitoring, enabled only when `VITE_SENTRY_DSN` is set at build time (the DSN
 * is public by design). Imported first by `main.tsx`.
 */
const dsn = import.meta.env.VITE_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT ?? import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE,
  });
}
