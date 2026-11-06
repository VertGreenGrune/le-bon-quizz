import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  ChangePasswordBody,
  FirebaseLoginBody,
  ForgotPasswordBody,
  LoginBody,
  RegisterBody,
  ResetPasswordBody,
  type AuthConfig,
  type AuthResponse,
} from '@lbq/shared';
import {
  DUMMY_HASH,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  createSession,
  currentUser,
  deleteSession,
  deleteUserSessions,
  getRequestToken,
  hashPassword,
  hashToken,
  requireAuth,
  toPublicUser,
  verifyPassword,
} from '../auth/index.js';
import { createAuthRateLimits } from '../auth/rateLimit.js';
import { Prisma } from '../generated/prisma/client.js';
import { createLogMailer } from '../mail/mailer.js';
import { passwordResetMail, resetLink } from '../mail/passwordReset.js';
import type { ApiDeps } from './index.js';
import { ApiError, parse } from './errors.js';

/** Lifetime of a "mot de passe oublié" link. */
export const RESET_TOKEN_TTL_MS = 3600 * 1000;

function setSessionCookie(reply: FastifyReply, token: string) {
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax', // web (:5173) and API (:3001) are same-site
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL_MS / 1000,
  });
}

/** Origin of the web app for e-mailed links: configured, else the page that sent the request. */
function webOrigin(request: FastifyRequest, configured?: string): string {
  return configured || request.headers.origin || `${request.protocol}://${request.host}`;
}

export async function authRoutes(app: FastifyInstance, deps: ApiDeps) {
  const { prisma } = deps;
  const mailer = deps.mailer ?? createLogMailer(app.log);
  const limits = deps.rateLimits ?? createAuthRateLimits();
  const firebase = deps.firebase;

  // T46: with Firebase Auth, passwords live at Firebase: the local password endpoints are off.
  const local = {
    onRequest: async () => {
      if (firebase) {
        throw new ApiError(
          404,
          'LOCAL_AUTH_DISABLED',
          'Connexion par Firebase : utilisez « Continuer avec Google » ou votre e-mail Firebase.',
        );
      }
    },
  };

  app.get('/auth/config', async () =>
    firebase ? ({ firebase: firebase.config } satisfies AuthConfig) : ({} satisfies AuthConfig),
  );

  /**
   * Firebase ID token → our own session (same cookie as `/auth/login`). The account is found by
   * its Firebase uid; at the first sign-in an existing account with the same e-mail is linked
   * (only when Firebase verified the address, so nobody can take over an account by signing up
   * at Firebase with someone else's e-mail); otherwise a new account is created.
   */
  app.post('/auth/firebase', async (request, reply) => {
    if (!firebase) {
      throw new ApiError(
        404,
        'NOT_FOUND',
        'La connexion Firebase n’est pas activée sur ce serveur.',
      );
    }
    const { idToken, name } = parse(FirebaseLoginBody, request.body);
    let identity;
    try {
      identity = await firebase.verify(idToken);
    } catch (err) {
      request.log.info({ err }, 'Firebase ID token refused');
      throw new ApiError(
        401,
        'FIREBASE_TOKEN_INVALID',
        'Connexion refusée ou expirée, reconnectez-vous.',
      );
    }
    const { uid, email, emailVerified } = identity;
    let user = await prisma.user.findUnique({ where: { firebaseUid: uid } });
    if (!user) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        if (!emailVerified) {
          throw new ApiError(
            403,
            'EMAIL_NOT_VERIFIED',
            'Un compte existe déjà avec cette adresse : confirmez-la avec le lien reçu par e-mail, puis reconnectez-vous.',
          );
        }
        user = await prisma.user.update({ where: { id: existing.id }, data: { firebaseUid: uid } });
      } else {
        const fallbackName = email.split('@')[0]!.slice(0, 60) || 'Animateur';
        try {
          user = await prisma.user.create({
            data: { email, name: name ?? identity.name ?? fallbackName, firebaseUid: uid },
          });
        } catch (err) {
          // Two sign-ins at once: the other request created it.
          if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) {
            throw err;
          }
          user = await prisma.user.findUnique({ where: { firebaseUid: uid } });
          if (!user)
            throw new ApiError(409, 'EMAIL_TAKEN', 'Un compte existe déjà avec cet e-mail');
        }
      }
    }
    const token = await createSession(prisma, user.id);
    setSessionCookie(reply, token);
    return { user: toPublicUser(user), token } satisfies AuthResponse;
  });

  app.post('/auth/register', local, async (request, reply) => {
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

  app.post('/auth/login', local, async (request, reply) => {
    const { email, password } = parse(LoginBody, request.body);
    const key = `${request.ip}|${email}`;
    if (limits.login.blocked(key)) {
      throw new ApiError(
        429,
        'TOO_MANY_ATTEMPTS',
        'Trop de tentatives, réessayez dans quelques minutes.',
      );
    }
    const user = await prisma.user.findUnique({ where: { email } });
    // Always run scrypt so response time doesn't reveal whether the email exists.
    const valid = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !valid) {
      limits.login.hit(key);
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'E-mail ou mot de passe incorrect');
    }
    limits.login.reset(key);
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

  // Always 204: the answer never tells whether an account exists for this e-mail.
  app.post('/auth/forgot-password', local, async (request, reply) => {
    const { email } = parse(ForgotPasswordBody, request.body);
    const limited = limits.resetByEmail.blocked(email) || limits.resetByIp.blocked(request.ip);
    limits.resetByEmail.hit(email);
    limits.resetByIp.hit(request.ip);
    const user = limited ? null : await prisma.user.findUnique({ where: { email } });
    if (user) {
      const token = randomBytes(32).toString('base64url');
      await prisma.$transaction([
        // A new link replaces the previous unused ones.
        prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
        prisma.passwordResetToken.create({
          data: {
            id: hashToken(token),
            userId: user.id,
            expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
          },
        }),
      ]);
      const mail = passwordResetMail(
        user.email,
        user.name,
        resetLink(webOrigin(request, deps.publicWebUrl), token),
      );
      // Not awaited, so the SMTP round trip doesn't reveal that the account exists.
      mailer.send(mail).catch((err: unknown) => {
        // Logged with its link so the admin can still pass it on.
        request.log.error({ err, to: mail.to, text: mail.text }, 'password reset e-mail failed');
      });
    }
    return reply.status(204).send();
  });

  app.post('/auth/reset-password', local, async (request, reply) => {
    const { token, password } = parse(ResetPasswordBody, request.body);
    const id = hashToken(token);
    const passwordHash = await hashPassword(password);
    const user = await prisma.$transaction(async (tx) => {
      // Conditional update = single use, even with two concurrent requests.
      const used = await tx.passwordResetToken.updateMany({
        where: { id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (used.count !== 1) return null;
      const { userId } = await tx.passwordResetToken.findUniqueOrThrow({ where: { id } });
      await tx.session.deleteMany({ where: { userId } }); // logged out everywhere
      await tx.passwordResetToken.deleteMany({ where: { userId, usedAt: null } });
      return tx.user.update({ where: { id: userId }, data: { passwordHash } });
    });
    if (!user) {
      throw new ApiError(
        400,
        'RESET_TOKEN_INVALID',
        "Ce lien n'est plus valable (expiré ou déjà utilisé).",
      );
    }
    const session = await createSession(prisma, user.id);
    setSessionCookie(reply, session);
    return { user: toPublicUser(user), token: session } satisfies AuthResponse;
  });

  app.post(
    '/auth/change-password',
    { onRequest: [local.onRequest, requireAuth(prisma)] },
    async (request, reply) => {
      const { currentPassword, newPassword } = parse(ChangePasswordBody, request.body);
      const { id } = currentUser(request);
      const user = await prisma.user.findUniqueOrThrow({ where: { id } });
      if (
        !(await verifyPassword(currentPassword, user.passwordHash ?? DUMMY_HASH)) ||
        !user.passwordHash
      ) {
        throw new ApiError(400, 'WRONG_PASSWORD', 'Mot de passe actuel incorrect');
      }
      await prisma.user.update({
        where: { id },
        data: { passwordHash: await hashPassword(newPassword) },
      });
      // Other devices are logged out; this one stays logged in.
      await deleteUserSessions(prisma, id, getRequestToken(request) ?? undefined);
      await prisma.passwordResetToken.deleteMany({ where: { userId: id, usedAt: null } });
      return reply.status(204).send();
    },
  );
}
