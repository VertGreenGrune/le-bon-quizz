import {
  LIBRARY_LIMIT,
  type LibraryQuery,
  type LibraryQuiz,
  type LibrarySort,
  type Question,
  type Quiz,
  type QuizDetail,
  type QuizInput,
  type QuizSummary,
} from '@lbq/shared';
import type { PrismaClient } from '../db.js';
import type { Prisma } from '../generated/prisma/client.js';

const withQuestions = {
  questions: { orderBy: { order: 'asc' }, include: { choices: { orderBy: { order: 'asc' } } } },
} satisfies Prisma.QuizInclude;

type QuizRow = Prisma.QuizGetPayload<{ include: typeof withQuestions }>;
type QuestionRow = QuizRow['questions'][number];
type BasePoints = Quiz['questions'][number]['basePoints'];

/** `Question.config` (JSON) of the typed / slider questions, written by `questionsCreate`. */
type QuestionConfig = Pick<
  Extract<Question, { type: 'TYPE_ANSWER' }>,
  'acceptedAnswers' | 'typoTolerance'
> &
  Pick<Extract<Question, { type: 'SLIDER' }>, 'slider'>;

function toQuestion(qu: QuestionRow): Question {
  const base = {
    text: qu.text,
    imageUrl: qu.imageUrl ?? undefined,
    timeLimitSec: qu.timeLimitSec,
    basePoints: qu.basePoints as BasePoints,
  };
  const config = (qu.config ?? {}) as Partial<QuestionConfig>;
  switch (qu.type) {
    case 'TYPE_ANSWER':
      return {
        ...base,
        type: qu.type,
        acceptedAnswers: config.acceptedAnswers ?? [],
        typoTolerance: config.typoTolerance ?? true,
      };
    case 'SLIDER':
      return { ...base, type: qu.type, slider: config.slider! };
    case 'POLL':
      return { ...base, type: qu.type, choices: qu.choices.map((c) => ({ text: c.text })) };
    default:
      return {
        ...base,
        type: qu.type,
        choices: qu.choices.map((c) => ({ text: c.text, isCorrect: c.isCorrect })),
      };
  }
}

function questionConfig(qu: Question): Prisma.InputJsonValue | undefined {
  if (qu.type === 'TYPE_ANSWER')
    return { acceptedAnswers: qu.acceptedAnswers, typoTolerance: qu.typoTolerance };
  if (qu.type === 'SLIDER') return { slider: qu.slider };
  return undefined;
}

/** Poll choices are stored with `isCorrect: false`; typed / slider questions have none. */
function choiceRows(qu: Question): { order: number; text: string; isCorrect: boolean }[] {
  if (qu.type === 'TYPE_ANSWER' || qu.type === 'SLIDER') return [];
  if (qu.type === 'POLL') return qu.choices.map((c, order) => ({ order, ...c, isCorrect: false }));
  return qu.choices.map((c, order) => ({ order, ...c }));
}

export function toQuizDetail(q: QuizRow): QuizDetail {
  return {
    id: q.id,
    title: q.title,
    description: q.description ?? undefined,
    coverImageUrl: q.coverImageUrl ?? undefined,
    visibility: q.visibility,
    createdAt: q.createdAt.toISOString(),
    updatedAt: q.updatedAt.toISOString(),
    questions: q.questions.map(toQuestion),
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
      config: questionConfig(qu),
      choices: { create: choiceRows(qu) },
    })),
  }) satisfies Prisma.QuestionCreateNestedManyWithoutQuizInput;

/** `visibility` is only written when given (absent = default PRIVATE / unchanged). */
const quizFields = (input: QuizInput) => ({
  title: input.title,
  description: input.description ?? null,
  coverImageUrl: input.coverImageUrl ?? null,
  ...(input.visibility && { visibility: input.visibility }),
});

const counts = {
  _count: { select: { questions: true, gameSessions: true } },
} satisfies Prisma.QuizInclude;

export async function listQuizzes(prisma: PrismaClient, ownerId: string): Promise<QuizSummary[]> {
  const rows = await prisma.quiz.findMany({
    where: { ownerId },
    orderBy: { updatedAt: 'desc' },
    include: counts,
  });
  return rows.map((q) => ({
    id: q.id,
    title: q.title,
    description: q.description ?? undefined,
    coverImageUrl: q.coverImageUrl ?? undefined,
    visibility: q.visibility,
    questionCount: q._count.questions,
    playCount: q._count.gameSessions,
    createdAt: q.createdAt.toISOString(),
    updatedAt: q.updatedAt.toISOString(),
  }));
}

const librarySort: Record<LibrarySort, Prisma.QuizOrderByWithRelationInput[]> = {
  popular: [{ gameSessions: { _count: 'desc' } }, { createdAt: 'desc' }],
  newest: [{ createdAt: 'desc' }],
};

/** Public quizzes of the other hosts (summaries only: never the questions / answers). */
export async function listLibrary(
  prisma: PrismaClient,
  userId: string,
  { search, sort = 'popular' }: LibraryQuery,
): Promise<LibraryQuiz[]> {
  const rows = await prisma.quiz.findMany({
    where: {
      visibility: 'PUBLIC',
      ownerId: { not: userId },
      ...(search && { title: { contains: search, mode: 'insensitive' } }),
    },
    orderBy: librarySort[sort],
    take: LIBRARY_LIMIT,
    include: { ...counts, owner: { select: { name: true } } },
  });
  return rows.map((q) => ({
    id: q.id,
    title: q.title,
    description: q.description ?? undefined,
    coverImageUrl: q.coverImageUrl ?? undefined,
    authorName: q.owner.name,
    questionCount: q._count.questions,
    playCount: q._count.gameSessions,
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

/** Quiz `userId` may launch: their own, or anyone's public quiz. Null otherwise. */
export async function getPlayableQuiz(
  prisma: PrismaClient,
  id: string,
  userId: string,
): Promise<QuizDetail | null> {
  const q = await prisma.quiz.findFirst({
    where: { id, OR: [{ ownerId: userId }, { visibility: 'PUBLIC' }] },
    include: withQuestions,
  });
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

/** A private copy of `source` owned by `ownerId`, title suffixed " (copie)". */
function copyQuiz(prisma: PrismaClient, ownerId: string, source: QuizDetail) {
  const { id: _id, createdAt: _c, updatedAt: _u, ...input } = source;
  const title = source.title.slice(0, TITLE_MAX - COPY_SUFFIX.length) + COPY_SUFFIX;
  return createQuiz(prisma, ownerId, { ...input, title, visibility: 'PRIVATE' });
}

export async function duplicateQuiz(
  prisma: PrismaClient,
  id: string,
  ownerId: string,
): Promise<QuizDetail | null> {
  const source = await getQuizForOwner(prisma, id, ownerId);
  return source && copyQuiz(prisma, ownerId, source);
}

/** "Copier dans mes quiz" from the library: any public quiz. Null if not found / private. */
export async function copyPublicQuiz(
  prisma: PrismaClient,
  id: string,
  userId: string,
): Promise<QuizDetail | null> {
  const q = await prisma.quiz.findFirst({
    where: { id, visibility: 'PUBLIC' },
    include: withQuestions,
  });
  return q && copyQuiz(prisma, userId, toQuizDetail(q));
}
