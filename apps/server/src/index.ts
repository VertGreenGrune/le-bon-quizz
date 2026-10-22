import path from 'node:path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@lbq/shared';
import { registerSocketHandlers } from './socket/index.js';
import { registerApi } from './api/index.js';
import { createPrisma } from './db.js';
import { createPrismaPersistence } from './game/persistence.js';
import { e2eJokerHand } from './game/jokers.js';
import { mailerFromEnv } from './mail/mailer.js';
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
  mailer: mailerFromEnv(process.env, app.log),
  // Links in e-mails: PUBLIC_WEB_URL, else the single allowed web origin, else the request's.
  publicWebUrl: process.env.PUBLIC_WEB_URL || process.env.CORS_ORIGIN,
});

app.get('/health', async () => ({ status: 'ok' }));

// Production image: this process also serves the built web app (same origin, see web.ts).
if (process.env.WEB_DIST_DIR) await registerWeb(app, path.resolve(process.env.WEB_DIST_DIR));

// Short heartbeat (default 25 s + 20 s): a phone that silently loses the network (Wi-Fi gone,
// no TCP close) is seen offline within ~10 s, so the game pauses for it (PLAN.md §2).
const io = new Server<ClientToServerEvents, ServerToClientEvents>(app.server, {
  cors: { origin: CORS_ORIGIN, credentials: true },
  pingInterval: 5_000,
  pingTimeout: 5_000,
});
registerSocketHandlers(io, {
  persistence: createPrismaPersistence(prisma),
  jokerHand: e2eJokerHand(process.env),
});

// Fly.io stops machines with SIGINT, Docker with SIGTERM.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.log.info(`${signal} received, shutting down`);
    io.disconnectSockets(true);
    void app.close().then(() => process.exit(0));
  });
}

await app.listen({ port: PORT, host: '0.0.0.0' });
