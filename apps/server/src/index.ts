import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@lbq/shared';
import { registerSocketHandlers } from './socket/index.js';

const PORT = Number(process.env.PORT ?? 3001);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? true; // `true` = reflect origin (dev / LAN phones)

const app = Fastify({ logger: true });
await app.register(cors, { origin: CORS_ORIGIN });

app.get('/health', async () => ({ status: 'ok' }));

const io = new Server<ClientToServerEvents, ServerToClientEvents>(app.server, {
  cors: { origin: CORS_ORIGIN },
});
registerSocketHandlers(io);

await app.listen({ port: PORT, host: '0.0.0.0' });
