import { createHash, randomBytes } from 'node:crypto';
import type { PublicUser } from '@lbq/shared';
import type { PrismaClient } from '../db.js';

export const SESSION_COOKIE = 'lbq_session';
export const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;

/** Only the hash is stored: a leaked DB dump does not leak usable tokens (sessions, reset links). */
export const hashToken = (token: string) => createHash('sha256').update(token).digest('base64url');

export function toPublicUser(u: {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  firebaseUid?: string | null;
}): PublicUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    createdAt: u.createdAt.toISOString(),
    ...(u.firebaseUid ? { firebase: true as const } : {}),
  };
}

export async function createSession(prisma: PrismaClient, userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await prisma.session.create({
    data: { id: hashToken(token), userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  });
  return token;
}

/**
 * Resolves a session token to its user, or null if unknown/expired.
 * Also meant for socket auth (T7: `host:create` ownership check).
 */
export async function getUserBySessionToken(
  prisma: PrismaClient,
  token: string,
): Promise<PublicUser | null> {
  const session = await prisma.session.findUnique({
    where: { id: hashToken(token) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.deleteMany({ where: { id: session.id } });
    return null;
  }
  return toPublicUser(session.user);
}

export async function deleteSession(prisma: PrismaClient, token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { id: hashToken(token) } });
}

/** Logs the user out everywhere, except the session of `keepToken` if given. */
export async function deleteUserSessions(
  prisma: PrismaClient,
  userId: string,
  keepToken?: string,
): Promise<void> {
  await prisma.session.deleteMany({
    where: { userId, ...(keepToken && { id: { not: hashToken(keepToken) } }) },
  });
}
