import type { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@lbq/shared';

export type IoServer = Server<ClientToServerEvents, ServerToClientEvents>;

/** Entry point for all socket handlers. Implemented in task T1 (see docs/TASKS.md). */
export function registerSocketHandlers(io: IoServer): void {
  io.on('connection', (socket) => {
    socket.on('disconnect', () => {});
  });
}
