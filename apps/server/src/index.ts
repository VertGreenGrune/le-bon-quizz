import path from 'node:path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@lbq/shared';
import { registerSocketHandlers } from './socket/index.js';
import { registerApi } from './api/index.js';
import { createPrisma } from './db.js';
import { createPrismaPersistence } from './game/persistence.js';
import { registerWeb } from './web.js';

const PORT = Number(process.env.PORT ?? 3001);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? true; // `true` = reflect origin (dev / LAN phones)

// trustProxy: behind Fly.io's proxy, so `request.protocol` is https (upload URLs).
const app = Fastify({ logger: true, trustProxy: process.env.TRUST_PROXY === 'true' });
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

// Production image: this process also serves the built web app (same origin, see web.ts).
if (process.env.WEB_DIST_DIR) await registerWeb(app, path.resolve(process.env.WEB_DIST_DIR));

const io = new Server<ClientToServerEvents, ServerToClientEvents>(app.server, {
  cors: { origin: CORS_ORIGIN, credentials: true },
});
registerSocketHandlers(io, { persistence: createPrismaPersistence(prisma) });

// Fly.io stops machines with SIGINT, Docker with SIGTERM.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.log.info(`${signal} received, shutting down`);
    io.disconnectSockets(true);
    void app.close().then(() => process.exit(0));
  });
}

await app.listen({ port: PORT, host: '0.0.0.0' });
