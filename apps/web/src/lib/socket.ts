import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@lbq/shared';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Defaults to the same host as the page on port 3001, so phones on the LAN work without config. */
const SERVER_URL =
  import.meta.env.VITE_SERVER_URL ?? `${location.protocol}//${location.hostname}:3001`;

let socket: GameSocket | undefined;

/**
 * Single shared, typed socket for the whole app. `withCredentials` sends the host's
 * `lbq_session` cookie with the handshake (the server identifies the host on `host:create`).
 */
export function getSocket(): GameSocket {
  socket ??= io(SERVER_URL, { autoConnect: true, withCredentials: true });
  return socket;
}
