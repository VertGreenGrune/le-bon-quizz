import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@lbq/shared';
import { SERVER_URL } from './serverUrl';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: GameSocket | undefined;

/**
 * Single shared, typed socket for the whole app. `withCredentials` sends the host's
 * `lbq_session` cookie with the handshake (the server identifies the host on `host:create`).
 */
export function getSocket(): GameSocket {
  socket ??= io(SERVER_URL, { autoConnect: true, withCredentials: true });
  return socket;
}

/**
 * The server reads the session cookie once per connection, so call this after login/logout
 * for `host:create` to see the new identity.
 */
export function reconnectSocket(): void {
  socket?.disconnect().connect();
}
