import type { FastifyError, FastifyInstance } from 'fastify';
import type { ApiErrorBody, ApiErrorCode } from '@lbq/shared';
import type { z } from 'zod';

export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Ressource') =>
  new ApiError(404, 'NOT_FOUND', `${what} introuvable`);

/** Validates `data` with a shared zod schema; 400 INVALID_PAYLOAD on failure. */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join('.')}: ` : '';
    throw new ApiError(400, 'INVALID_PAYLOAD', `${where}${issue?.message ?? 'Invalid payload'}`);
  }
  return result.data;
}

const body = (code: ApiErrorCode, message: string): ApiErrorBody => ({ error: { code, message } });

/** Maps every error to `ApiErrorBody`; never leaks internals on 5xx. */
export function installErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError | ApiError, request, reply) => {
    if (err instanceof ApiError) {
      return reply.status(err.statusCode).send(body(err.code, err.message));
    }
    const status = err.statusCode ?? 500;
    if (status === 413) {
      return reply.status(413).send(body('FILE_TOO_LARGE', 'Fichier trop volumineux'));
    }
    if (status === 415) {
      return reply.status(415).send(body('UNSUPPORTED_MEDIA_TYPE', err.message));
    }
    if (status >= 400 && status < 500) {
      return reply.status(status).send(body('INVALID_PAYLOAD', err.message));
    }
    request.log.error(err);
    return reply.status(500).send(body('INTERNAL', 'Erreur interne'));
  });
  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send(body('NOT_FOUND', 'Route introuvable')),
  );
}
