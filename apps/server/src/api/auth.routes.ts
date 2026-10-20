import type { FastifyInstance, FastifyReply } from 'fastify';
import { LoginBody, RegisterBody, type AuthResponse } from '@lbq/shared';
import {
  DUMMY_HASH,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  createSession,
  currentUser,
  deleteSession,
  getRequestToken,
  hashPassword,
  requireAuth,
  toPublicUser,
  verifyPassword,
} from '../auth/index.js';
import { Prisma } from '../generated/prisma/client.js';
import type { ApiDeps } from './index.js';
import { ApiError, parse } from './errors.js';

function setSessionCookie(reply: FastifyReply, token: string) {
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax', // web (:5173) and API (:3001) are same-site
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function authRoutes(app: FastifyInstance, { prisma }: ApiDeps) {
  app.post('/auth/register', async (request, reply) => {
    const { email, name, password } = parse(RegisterBody, request.body);
    let user;
    try {
      user = await prisma.user.create({
        data: { email, name, passwordHash: await hashPassword(password) },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ApiError(409, 'EMAIL_TAKEN', 'Un compte existe déjà avec cet e-mail');
      }
      throw err;
    }
    const token = await createSession(prisma, user.id);
    setSessionCookie(reply, token);
    return reply.status(201).send({ user: toPublicUser(user), token } satisfies AuthResponse);
  });

  app.post('/auth/login', async (request, reply) => {
    const { email, password } = parse(LoginBody, request.body);
    const user = await prisma.user.findUnique({ where: { email } });
    // Always run scrypt so response time doesn't reveal whether the email exists.
    const valid = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !valid) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'E-mail ou mot de passe incorrect');
    }
    const token = await createSession(prisma, user.id);
    setSessionCookie(reply, token);
    return { user: toPublicUser(user), token } satisfies AuthResponse;
  });

  app.post('/auth/logout', async (request, reply) => {
    const token = getRequestToken(request);
    if (token) await deleteSession(prisma, token);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.status(204).send();
  });

  app.get('/auth/me', { onRequest: requireAuth(prisma) }, async (request) => currentUser(request));
}
