import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PublicUser } from '@lbq/shared';
import { ApiError } from '../api/errors.js';
import type { PrismaClient } from '../db.js';
import { SESSION_COOKIE, getUserBySessionToken } from './session.js';

export * from './password.js';
export * from './session.js';
export * from './firebase.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by `requireAuth`. */
    user: PublicUser | null;
  }
}

/** Token from the `lbq_session` cookie, or from `Authorization: Bearer <token>`. */
export function getRequestToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim() || null;
  return request.cookies[SESSION_COOKIE] ?? null;
}

/** `preHandler` hook: 401 unless the request carries a valid host session. */
export function requireAuth(prisma: PrismaClient) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const token = getRequestToken(request);
    request.user = token ? await getUserBySessionToken(prisma, token) : null;
    if (!request.user) throw new ApiError(401, 'UNAUTHORIZED', 'Authentification requise');
  };
}

/** The authenticated user; only call in routes protected by `requireAuth`. */
export function currentUser(request: FastifyRequest): PublicUser {
  if (!request.user) throw new ApiError(401, 'UNAUTHORIZED', 'Authentification requise');
  return request.user;
}
