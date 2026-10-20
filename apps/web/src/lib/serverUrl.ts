/**
 * Game server (API + Socket.IO) base URL.
 * - `VITE_SERVER_URL` if set at build time;
 * - production build: the page's own origin (the server serves the web app, see DEPLOY.md);
 * - dev: the same host as the page on port 3001, so phones on the LAN work without config.
 */
export const SERVER_URL: string =
  import.meta.env.VITE_SERVER_URL ||
  (import.meta.env.PROD ? location.origin : `${location.protocol}//${location.hostname}:3001`);
