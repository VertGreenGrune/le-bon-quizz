import path from 'node:path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@lbq/shared';
import { registerSocketHandlers } from './socket/index.js';
import { registerApi } from './api/index.js';
import { createPrisma } from './db.js';

const PORT = Number(process.env.PORT ?? 3001);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? true; // `true` = reflect origin (dev / LAN phones)

const app = Fastify({ logger: true });
// credentials: the host session is an httpOnly cookie sent by the web app (other port).
// methods: @fastify/cors 11 only allows GET/HEAD/POST by default; the editor needs PUT/DELETE.
await app.register(cors, {
  origin: CORS_ORIGIN,
  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE'],
});

const prisma = createPrisma();
app.addHook('onClose', () => prisma.$disconnect());
await registerApi(app, {
  prisma,
  uploadDir: path.resolve(process.env.UPLOAD_DIR ?? 'uploads'),
  publicUrl: process.env.PUBLIC_URL,
});

app.get('/health', async () => ({ status: 'ok' }));

const io = new Server<ClientToServerEvents, ServerToClientEvents>(app.server, {
  cors: { origin: CORS_ORIGIN, credentials: true },
});
registerSocketHandlers(io);

await app.listen({ port: PORT, host: '0.0.0.0' });
