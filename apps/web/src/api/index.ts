import { createApiClient, type ApiClient } from './client';

export { ApiError, createApiClient, type ApiClient, type ClientErrorCode } from './client';

/** Same default as `lib/socket.ts`: the game server on port 3001 of the page's host. */
export const SERVER_URL: string =
  import.meta.env.VITE_SERVER_URL ?? `${location.protocol}//${location.hostname}:3001`;

/** App-wide API client. */
export const api: ApiClient = createApiClient(SERVER_URL);
