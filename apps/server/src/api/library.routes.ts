import type { FastifyInstance } from 'fastify';
import { LibraryQuery } from '@lbq/shared';
import { currentUser } from '../auth/index.js';
import type { ApiDeps } from './index.js';
import { notFound, parse } from './errors.js';
import { copyPublicQuiz, listLibrary } from './quizzes.service.js';

/** Public quizzes of the other hosts: list, and copy one into the current host's quizzes. */
export async function libraryRoutes(app: FastifyInstance, { prisma }: ApiDeps) {
  app.get('/library', async (request) =>
    listLibrary(prisma, currentUser(request).id, parse(LibraryQuery, request.query)),
  );

  app.post<{ Params: { id: string } }>('/library/:id/copy', async (request, reply) => {
    const quiz = await copyPublicQuiz(prisma, request.params.id, currentUser(request).id);
    if (!quiz) throw notFound('Quiz');
    return reply.status(201).send(quiz);
  });
}
