import {
  AUDIO_DEFAULT_DURATION_SEC,
  BLUFF_DEFAULT_VOTE_SEC,
  COLORS_DEFAULT_CELLS,
  COLORS_DEFAULT_MEMO_SEC,
  LIBRARY_LIMIT,
  MISSING_DEFAULT_MEMO_SEC,
  type LibraryQuery,
  type LibraryQuiz,
  type LibrarySort,
  type Question,
  type Quiz,
  type QuizDetail,
  type QuizAccess,
  type QuizInput,
  type QuizShareInfo,
  type QuizSummary,
  type SharedQuizSummary,
} from '@lbq/shared';
import type { PrismaClient } from '../db.js';
import type { Prisma } from '../generated/prisma/client.js';
import { ApiError } from './errors.js';

const withQuestions = {
  questions: { orderBy: { order: 'asc' }, include: { choices: { orderBy: { order: 'asc' } } } },
} satisfies Prisma.QuizInclude;

/** What a quiz detail needs: questions, owner name and the current host's share (T45). */
const detailInclude = (userId: string) =>
  ({
    ...withQuestions,
    owner: { select: { name: true } },
    shares: { where: { userId }, select: { role: true } },
  }) satisfies Prisma.QuizInclude;

type QuizRow = Prisma.QuizGetPayload<{ include: ReturnType<typeof detailInclude> }>;
type QuestionRow = QuizRow['questions'][number];
type BasePoints = Quiz['questions'][number]['basePoints'];

/** `Question.config` (JSON) of the typed / slider questions, written by `questionsCreate`. */
type QuestionConfig = Pick<
  Extract<Question, { type: 'TYPE_ANSWER' }>,
  'acceptedAnswers' | 'typoTolerance'
> &
  Pick<Extract<Question, { type: 'SLIDER' }>, 'slider'> &
  Pick<Extract<Question, { type: 'ORDER' }>, 'items'> &
  Pick<Extract<Question, { type: 'PIN' }>, 'zone'> &
  Pick<Extract<Question, { type: 'WHO_OF_US' }>, 'majorityBonus'> &
  Pick<Extract<Question, { type: 'BLUFF' }>, 'truth' | 'voteTimeSec'> &
  Pick<Extract<Question, { type: 'DRAW' }>, 'words'> &
  Pick<Extract<Question, { type: 'COLORS' }>, 'memoSec' | 'cells' | 'zones'> &
  Pick<Extract<Question, { type: 'MISSING' }>, 'missingImageUrl'>;

function toQuestion(qu: QuestionRow): Question {
  const base = {
    text: qu.text,
    imageUrl: qu.imageUrl ?? undefined,
    timeLimitSec: qu.timeLimitSec,
    basePoints: qu.basePoints as BasePoints,
    ...(qu.audioUrl && {
      audio: {
        url: qu.audioUrl,
        startSec: qu.audioStartSec ?? 0,
        durationSec: qu.audioDurationSec ?? AUDIO_DEFAULT_DURATION_SEC,
      },
      ...(qu.audioOnReveal && { audioOnReveal: true }),
    }),
    ...(qu.imageEffect && qu.imageEffect !== 'none' && { imageEffect: qu.imageEffect }),
    ...(qu.buzzer && { buzzer: true }),
    ...(qu.explanation && { explanation: qu.explanation }),
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
    case 'ORDER':
      return { ...base, type: qu.type, items: config.items ?? [] };
    case 'PIN':
      return { ...base, type: qu.type, zone: config.zone! };
    case 'WHO_OF_US':
      return { ...base, type: qu.type, majorityBonus: config.majorityBonus ?? false };
    case 'WORD_CLOUD':
      return { ...base, type: qu.type };
    case 'BLUFF':
      return {
        ...base,
        type: qu.type,
        truth: config.truth ?? '',
        voteTimeSec: config.voteTimeSec ?? BLUFF_DEFAULT_VOTE_SEC,
      };
    case 'DRAW':
      return { ...base, type: qu.type, words: config.words ?? [] };
    case 'LIST':
    case 'POINTLESS':
      return {
        ...base,
        type: qu.type,
        items: config.items ?? [],
        typoTolerance: config.typoTolerance ?? true,
      };
    case 'COLORS':
      return {
        ...base,
        type: qu.type,
        memoSec: config.memoSec ?? COLORS_DEFAULT_MEMO_SEC,
        cells: config.cells ?? COLORS_DEFAULT_CELLS,
        zones: config.zones ?? [],
      };
    case 'MISSING':
      return {
        ...base,
        type: qu.type,
        missingImageUrl: config.missingImageUrl ?? '',
        memoSec: config.memoSec ?? MISSING_DEFAULT_MEMO_SEC,
        zone: config.zone!,
      };
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
  if (qu.type === 'ORDER') return { items: qu.items };
  if (qu.type === 'PIN') return { zone: qu.zone };
  if (qu.type === 'WHO_OF_US') return { majorityBonus: qu.majorityBonus };
  if (qu.type === 'BLUFF') return { truth: qu.truth, voteTimeSec: qu.voteTimeSec };
  if (qu.type === 'DRAW') return { words: qu.words };
  if (qu.type === 'LIST' || qu.type === 'POINTLESS')
    return { items: qu.items, typoTolerance: qu.typoTolerance };
  if (qu.type === 'COLORS') return { memoSec: qu.memoSec, cells: qu.cells, zones: qu.zones };
  if (qu.type === 'MISSING')
    return { missingImageUrl: qu.missingImageUrl, memoSec: qu.memoSec, zone: qu.zone };
  return undefined;
}

/** Poll choices are stored with `isCorrect: false`; the types without choices have none. */
function choiceRows(qu: Question): { order: number; text: string; isCorrect: boolean }[] {
  if (qu.type === 'POLL') return qu.choices.map((c, order) => ({ order, ...c, isCorrect: false }));
  if (qu.type === 'MCQ' || qu.type === 'TRUE_FALSE')
    return qu.choices.map((c, order) => ({ order, ...c }));
  return [];
}

/** `userId` owns the quiz or it was shared with them (any role / editors only). */
const accessibleBy = (userId: string, editorsOnly = false): Prisma.QuizWhereInput => ({
  OR: [
    { ownerId: userId },
    { shares: { some: { userId, ...(editorsOnly && { role: 'editor' as const }) } } },
  ],
});

function accessOf(q: QuizRow, userId: string): QuizAccess {
  return q.ownerId === userId ? 'owner' : (q.shares[0]?.role ?? 'viewer');
}

export function toQuizDetail(q: QuizRow, userId: string): QuizDetail {
  return {
    id: q.id,
    title: q.title,
    description: q.description ?? undefined,
    coverImageUrl: q.coverImageUrl ?? undefined,
    visibility: q.visibility,
    theme: q.theme,
    createdAt: q.createdAt.toISOString(),
    updatedAt: q.updatedAt.toISOString(),
    questions: q.questions.map(toQuestion),
    access: accessOf(q, userId),
    ownerName: q.owner.name,
  };
}

const questionsCreate = (input: QuizInput) =>
  ({
    create: input.questions.map((qu, order) => ({
      order,
      text: qu.text,
      imageUrl: qu.imageUrl ?? null,
      audioUrl: qu.audio?.url ?? null,
      audioStartSec: qu.audio?.startSec ?? null,
      audioDurationSec: qu.audio?.durationSec ?? null,
      audioOnReveal: qu.audio && qu.audioOnReveal ? true : null,
      imageEffect: qu.imageUrl && qu.imageEffect !== 'none' ? (qu.imageEffect ?? null) : null,
      buzzer: !!qu.buzzer,
      explanation: qu.explanation?.trim() || null,
      type: qu.type,
      timeLimitSec: qu.timeLimitSec,
      basePoints: qu.basePoints,
      config: questionConfig(qu),
      choices: { create: choiceRows(qu) },
    })),
  }) satisfies Prisma.QuestionCreateNestedManyWithoutQuizInput;

/**
 * `visibility` / `theme` are only written when given (absent = default PRIVATE / classic, or
 * unchanged).
 */
const quizFields = (input: QuizInput, owner = true) => ({
  title: input.title,
  description: input.description ?? null,
  coverImageUrl: input.coverImageUrl ?? null,
  // Only the owner changes the visibility (a co-editor's `visibility` is ignored, T45).
  ...(owner && input.visibility && { visibility: input.visibility }),
  ...(input.theme && { theme: input.theme }),
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
    theme: q.theme,
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
    theme: q.theme,
    authorName: q.owner.name,
    questionCount: q._count.questions,
    playCount: q._count.gameSessions,
    createdAt: q.createdAt.toISOString(),
    updatedAt: q.updatedAt.toISOString(),
  }));
}

/**
 * Quiz `userId` owns or was shared with (T45), or null (also null when it belongs to someone
 * else, so other hosts' quiz ids are not disclosed).
 */
export async function getQuizForUser(
  prisma: PrismaClient,
  id: string,
  userId: string,
): Promise<QuizDetail | null> {
  const q = await prisma.quiz.findFirst({
    where: { id, ...accessibleBy(userId) },
    include: detailInclude(userId),
  });
  return q && toQuizDetail(q, userId);
}

/** Quiz `userId` may launch: their own, one shared with them, or anyone's public quiz. */
export async function getPlayableQuiz(
  prisma: PrismaClient,
  id: string,
  userId: string,
): Promise<QuizDetail | null> {
  const q = await prisma.quiz.findFirst({
    where: { id, OR: [...accessibleBy(userId).OR!, { visibility: 'PUBLIC' }] },
    include: detailInclude(userId),
  });
  return q && toQuizDetail(q, userId);
}

export async function createQuiz(
  prisma: PrismaClient,
  ownerId: string,
  input: QuizInput,
  id?: string,
): Promise<QuizDetail> {
  const q = await prisma.quiz.create({
    data: { id, ownerId, ...quizFields(input), questions: questionsCreate(input) },
    include: detailInclude(ownerId),
  });
  return toQuizDetail(q, ownerId);
}

/**
 * Replaces the quiz content (questions are recreated): the owner or an `editor` share (T45).
 * Null if not found / not allowed. With `expectedUpdatedAt`, 409 `QUIZ_CONFLICT` when the quiz
 * was saved since (checked and bumped by one conditional update, so two saves can't both pass).
 */
export async function updateQuiz(
  prisma: PrismaClient,
  id: string,
  userId: string,
  input: QuizInput,
): Promise<QuizDetail | null> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.quiz.findFirst({
      where: { id, ...accessibleBy(userId, true) },
      select: { ownerId: true },
    });
    if (!existing) return null;
    const { count } = await tx.quiz.updateMany({
      where: {
        id,
        ...(input.expectedUpdatedAt && { updatedAt: new Date(input.expectedUpdatedAt) }),
      },
      data: quizFields(input, existing.ownerId === userId),
    });
    if (count === 0) {
      throw new ApiError(
        409,
        'QUIZ_CONFLICT',
        'Ce quiz a été modifié par quelqu’un d’autre entre-temps. Rechargez-le avant d’enregistrer.',
      );
    }
    await tx.question.deleteMany({ where: { quizId: id } });
    const q = await tx.quiz.update({
      where: { id },
      data: { questions: questionsCreate(input) },
      include: detailInclude(userId),
    });
    return toQuizDetail(q, userId);
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
  const { id: _id, createdAt: _c, updatedAt: _u, access: _a, ownerName: _o, ...input } = source;
  const title = source.title.slice(0, TITLE_MAX - COPY_SUFFIX.length) + COPY_SUFFIX;
  return createQuiz(prisma, ownerId, { ...input, title, visibility: 'PRIVATE' });
}

export async function duplicateQuiz(
  prisma: PrismaClient,
  id: string,
  ownerId: string,
): Promise<QuizDetail | null> {
  const source = await getQuizForUser(prisma, id, ownerId);
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
    include: detailInclude(userId),
  });
  return q && copyQuiz(prisma, userId, toQuizDetail(q, userId));
}

// ---------- Sharing (T45) ----------

const shareSelect = {
  role: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true } },
} satisfies Prisma.QuizShareSelect;

const toShareInfo = (s: Prisma.QuizShareGetPayload<{ select: typeof shareSelect }>) =>
  ({ user: s.user, role: s.role, createdAt: s.createdAt.toISOString() }) satisfies QuizShareInfo;

const isOwner = async (prisma: PrismaClient, quizId: string, userId: string) =>
  (await prisma.quiz.count({ where: { id: quizId, ownerId: userId } })) > 0;

/** Shares of a quiz, oldest first. Null when `ownerId` doesn't own it. */
export async function listShares(
  prisma: PrismaClient,
  quizId: string,
  ownerId: string,
): Promise<QuizShareInfo[] | null> {
  if (!(await isOwner(prisma, quizId, ownerId))) return null;
  const rows = await prisma.quizShare.findMany({
    where: { quizId },
    orderBy: { createdAt: 'asc' },
    select: shareSelect,
  });
  return rows.map(toShareInfo);
}

/**
 * Shares a quiz with the host account of `body.email`, or changes that share's role. Null when
 * `ownerId` doesn't own the quiz; 404 `USER_NOT_FOUND` for an unknown e-mail.
 */
export async function shareQuiz(
  prisma: PrismaClient,
  quizId: string,
  ownerId: string,
  body: { email: string; role: QuizShareInfo['role'] },
): Promise<QuizShareInfo | null> {
  if (!(await isOwner(prisma, quizId, ownerId))) return null;
  const user = await prisma.user.findUnique({ where: { email: body.email }, select: { id: true } });
  if (!user) {
    throw new ApiError(404, 'USER_NOT_FOUND', 'Aucun compte animateur avec cette adresse e-mail');
  }
  if (user.id === ownerId) {
    throw new ApiError(400, 'INVALID_PAYLOAD', 'C’est déjà votre quiz');
  }
  const share = await prisma.quizShare.upsert({
    where: { quizId_userId: { quizId, userId: user.id } },
    create: { quizId, userId: user.id, role: body.role },
    update: { role: body.role },
    select: shareSelect,
  });
  return toShareInfo(share);
}

/**
 * Removes a share: by the owner (any share), or by the shared host themselves (« Ne plus
 * voir »). False when there is no such share or the requester may not remove it.
 */
export async function removeShare(
  prisma: PrismaClient,
  quizId: string,
  userId: string,
  requesterId: string,
): Promise<boolean> {
  if (requesterId !== userId && !(await isOwner(prisma, quizId, requesterId))) return false;
  const { count } = await prisma.quizShare.deleteMany({ where: { quizId, userId } });
  return count > 0;
}

/** Quizzes other hosts shared with `userId`, most recently updated first. */
export async function listSharedQuizzes(
  prisma: PrismaClient,
  userId: string,
): Promise<SharedQuizSummary[]> {
  const rows = await prisma.quizShare.findMany({
    where: { userId },
    orderBy: { quiz: { updatedAt: 'desc' } },
    select: {
      role: true,
      createdAt: true,
      quiz: { include: { ...counts, owner: { select: { name: true } } } },
    },
  });
  return rows.map(({ role, createdAt, quiz: q }) => ({
    id: q.id,
    title: q.title,
    description: q.description ?? undefined,
    coverImageUrl: q.coverImageUrl ?? undefined,
    visibility: q.visibility,
    theme: q.theme,
    questionCount: q._count.questions,
    playCount: q._count.gameSessions,
    createdAt: q.createdAt.toISOString(),
    updatedAt: q.updatedAt.toISOString(),
    role,
    ownerName: q.owner.name,
    sharedAt: createdAt.toISOString(),
  }));
}
