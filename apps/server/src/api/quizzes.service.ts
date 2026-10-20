import type { Quiz, QuizDetail, QuizInput, QuizSummary } from '@lbq/shared';
import type { PrismaClient } from '../db.js';
import type { Prisma } from '../generated/prisma/client.js';

const withQuestions = {
  questions: { orderBy: { order: 'asc' }, include: { choices: { orderBy: { order: 'asc' } } } },
} satisfies Prisma.QuizInclude;

type QuizRow = Prisma.QuizGetPayload<{ include: typeof withQuestions }>;
type BasePoints = Quiz['questions'][number]['basePoints'];

export function toQuizDetail(q: QuizRow): QuizDetail {
  return {
    id: q.id,
    title: q.title,
    description: q.description ?? undefined,
    coverImageUrl: q.coverImageUrl ?? undefined,
    createdAt: q.createdAt.toISOString(),
    updatedAt: q.updatedAt.toISOString(),
    questions: q.questions.map((qu) => ({
      text: qu.text,
      imageUrl: qu.imageUrl ?? undefined,
      type: qu.type,
      timeLimitSec: qu.timeLimitSec,
      basePoints: qu.basePoints as BasePoints,
      choices: qu.choices.map((c) => ({ text: c.text, isCorrect: c.isCorrect })),
    })),
  };
}

const questionsCreate = (input: QuizInput) =>
  ({
    create: input.questions.map((qu, order) => ({
      order,
      text: qu.text,
      imageUrl: qu.imageUrl ?? null,
      type: qu.type,
      timeLimitSec: qu.timeLimitSec,
      basePoints: qu.basePoints,
      choices: {
        create: qu.choices.map((c, i) => ({ order: i, text: c.text, isCorrect: c.isCorrect })),
      },
    })),
  }) satisfies Prisma.QuestionCreateNestedManyWithoutQuizInput;

const quizFields = (input: QuizInput) => ({
  title: input.title,
  description: input.description ?? null,
  coverImageUrl: input.coverImageUrl ?? null,
});

export async function listQuizzes(prisma: PrismaClient, ownerId: string): Promise<QuizSummary[]> {
  const rows = await prisma.quiz.findMany({
    where: { ownerId },
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { questions: true } } },
  });
  return rows.map((q) => ({
    id: q.id,
    title: q.title,
    description: q.description ?? undefined,
    coverImageUrl: q.coverImageUrl ?? undefined,
    questionCount: q._count.questions,
    createdAt: q.createdAt.toISOString(),
    updatedAt: q.updatedAt.toISOString(),
  }));
}

/**
 * Quiz owned by `ownerId`, or null (also null when it belongs to someone else, so other
 * hosts' quiz ids are not disclosed). Meant to be reused by T7 for `host:create`.
 */
export async function getQuizForOwner(
  prisma: PrismaClient,
  id: string,
  ownerId: string,
): Promise<QuizDetail | null> {
  const q = await prisma.quiz.findFirst({ where: { id, ownerId }, include: withQuestions });
  return q && toQuizDetail(q);
}

export async function createQuiz(
  prisma: PrismaClient,
  ownerId: string,
  input: QuizInput,
  id?: string,
): Promise<QuizDetail> {
  const q = await prisma.quiz.create({
    data: { id, ownerId, ...quizFields(input), questions: questionsCreate(input) },
    include: withQuestions,
  });
  return toQuizDetail(q);
}

/** Replaces the quiz content (questions are recreated). Null if not found / not owned. */
export async function updateQuiz(
  prisma: PrismaClient,
  id: string,
  ownerId: string,
  input: QuizInput,
): Promise<QuizDetail | null> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.quiz.findFirst({ where: { id, ownerId }, select: { id: true } });
    if (!existing) return null;
    await tx.question.deleteMany({ where: { quizId: id } });
    const q = await tx.quiz.update({
      where: { id },
      data: { ...quizFields(input), questions: questionsCreate(input) },
      include: withQuestions,
    });
    return toQuizDetail(q);
  });
}

export async function deleteQuiz(
  prisma: PrismaClient,
  id: string,
  ownerId: string,
): Promise<boolean> {
  const { count } = await prisma.quiz.deleteMany({ where: { id, ownerId } });
  return count > 0;
}

export const COPY_SUFFIX = ' (copie)';
const TITLE_MAX = 95;

export async function duplicateQuiz(
  prisma: PrismaClient,
  id: string,
  ownerId: string,
): Promise<QuizDetail | null> {
  const source = await getQuizForOwner(prisma, id, ownerId);
  if (!source) return null;
  const title = source.title.slice(0, TITLE_MAX - COPY_SUFFIX.length) + COPY_SUFFIX;
  return createQuiz(prisma, ownerId, { ...source, title });
}
