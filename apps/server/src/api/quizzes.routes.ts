import type { FastifyInstance } from 'fastify';
import { QuizInput, ShareQuizBody } from '@lbq/shared';
import { currentUser } from '../auth/index.js';
import type { ApiDeps } from './index.js';
import { notFound, parse } from './errors.js';
import {
  createQuiz,
  deleteQuiz,
  duplicateQuiz,
  getQuizForUser,
  listQuizzes,
  listShares,
  listSharedQuizzes,
  removeShare,
  shareQuiz,
  updateQuiz,
} from './quizzes.service.js';

type IdParams = { Params: { id: string } };
type ShareParams = { Params: { id: string; userId: string } };

export async function quizRoutes(app: FastifyInstance, { prisma }: ApiDeps) {
  app.get('/quizzes', async (request) => listQuizzes(prisma, currentUser(request).id));

  app.post('/quizzes', async (request, reply) => {
    const input = parse(QuizInput, request.body);
    return reply.status(201).send(await createQuiz(prisma, currentUser(request).id, input));
  });

  /** Own quizzes and quizzes shared with the current host (T45). */
  app.get<IdParams>('/quizzes/:id', async (request) => {
    const quiz = await getQuizForUser(prisma, request.params.id, currentUser(request).id);
    if (!quiz) throw notFound('Quiz');
    return quiz;
  });

  /** Owner or `editor` share (T45); `expectedUpdatedAt` → 409 QUIZ_CONFLICT. */
  app.put<IdParams>('/quizzes/:id', async (request) => {
    const input = parse(QuizInput, request.body);
    const quiz = await updateQuiz(prisma, request.params.id, currentUser(request).id, input);
    if (!quiz) throw notFound('Quiz');
    return quiz;
  });

  app.delete<IdParams>('/quizzes/:id', async (request, reply) => {
    const deleted = await deleteQuiz(prisma, request.params.id, currentUser(request).id);
    if (!deleted) throw notFound('Quiz');
    return reply.status(204).send();
  });

  app.post<IdParams>('/quizzes/:id/duplicate', async (request, reply) => {
    const quiz = await duplicateQuiz(prisma, request.params.id, currentUser(request).id);
    if (!quiz) throw notFound('Quiz');
    return reply.status(201).send(quiz);
  });

  // ---------- Sharing (T45) ----------

  app.get('/shared-quizzes', async (request) => listSharedQuizzes(prisma, currentUser(request).id));

  app.get<IdParams>('/quizzes/:id/shares', async (request) => {
    const shares = await listShares(prisma, request.params.id, currentUser(request).id);
    if (!shares) throw notFound('Quiz');
    return shares;
  });

  app.post<IdParams>('/quizzes/:id/shares', async (request, reply) => {
    const body = parse(ShareQuizBody, request.body);
    const share = await shareQuiz(prisma, request.params.id, currentUser(request).id, body);
    if (!share) throw notFound('Quiz');
    return reply.status(201).send(share);
  });

  app.delete<ShareParams>('/quizzes/:id/shares/:userId', async (request, reply) => {
    const { id, userId } = request.params;
    const removed = await removeShare(prisma, id, userId, currentUser(request).id);
    if (!removed) throw notFound('Partage');
    return reply.status(204).send();
  });
}
