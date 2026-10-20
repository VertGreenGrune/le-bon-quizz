import type { FastifyInstance } from 'fastify';
import { QuizInput } from '@lbq/shared';
import { currentUser } from '../auth/index.js';
import type { ApiDeps } from './index.js';
import { notFound, parse } from './errors.js';
import {
  createQuiz,
  deleteQuiz,
  duplicateQuiz,
  getQuizForOwner,
  listQuizzes,
  updateQuiz,
} from './quizzes.service.js';

type IdParams = { Params: { id: string } };

export async function quizRoutes(app: FastifyInstance, { prisma }: ApiDeps) {
  app.get('/quizzes', async (request) => listQuizzes(prisma, currentUser(request).id));

  app.post('/quizzes', async (request, reply) => {
    const input = parse(QuizInput, request.body);
    return reply.status(201).send(await createQuiz(prisma, currentUser(request).id, input));
  });

  app.get<IdParams>('/quizzes/:id', async (request) => {
    const quiz = await getQuizForOwner(prisma, request.params.id, currentUser(request).id);
    if (!quiz) throw notFound('Quiz');
    return quiz;
  });

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
}
