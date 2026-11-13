/**
 * Quiz import (T23): a folder with a `quiz.json` (`QuizInput`, media given as paths relative to
 * the folder) becomes a private quiz of a host. Used by `scripts/import-quiz.ts`.
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { QuizInput, type QuizDetail } from '@lbq/shared';
import { createQuiz, updateQuiz } from '../src/api/quizzes.service.js';
import { sniffAudioType, sniffImageType } from '../src/api/uploads.routes.js';
import type { PrismaClient } from '../src/db.js';
import { hashedMediaName, saveMedia } from '../src/media.js';

export type MediaKind = 'image' | 'audio';

/** Copies a local media file to where the server serves it; returns its public URL. */
export type MediaStore = (file: string, kind: MediaKind) => Promise<string>;

const isUrl = (s: string) => /^https?:\/\//i.test(s);

/**
 * Media store saving through `save` (the database in production, served at
 * `<baseUrl>/uploads/`). Files are named after their content hash, so importing the same quiz
 * again reuses the same files.
 */
export function mediaStore(
  save: (name: string, data: Buffer) => Promise<void>,
  baseUrl: string,
): MediaStore {
  return async (file, kind) => {
    const data = await readFile(file);
    const ext = kind === 'image' ? sniffImageType(data) : sniffAudioType(data);
    if (!ext)
      throw new Error(`${file}: format ${kind === 'image' ? 'd’image' : 'audio'} non reconnu`);
    const name = hashedMediaName(data, ext);
    await save(name, data);
    return `${baseUrl.replace(/\/+$/, '')}/uploads/${name}`;
  };
}

/** Media store writing into the `Media` table. */
export const databaseStore = (prisma: PrismaClient, baseUrl: string) =>
  mediaStore((name, data) => saveMedia(prisma, name, data), baseUrl);

type Json = Record<string, unknown>;

/**
 * Reads `<folder>/quiz.json`, copies its local media through `store` and validates it with
 * `QuizInput`. A missing sound or question picture is skipped with a warning (copyrighted media
 * are added by the user); a missing cover or « point sur l'image » picture is an error. The quiz
 * is always private.
 */
export async function prepareQuiz(
  folder: string,
  store: MediaStore,
  warn: (message: string) => void = console.warn,
): Promise<QuizInput> {
  const raw = JSON.parse(await readFile(path.join(folder, 'quiz.json'), 'utf8')) as Json;

  const media = async (ref: unknown, kind: MediaKind): Promise<string | undefined> => {
    if (typeof ref !== 'string' || isUrl(ref)) return ref as string | undefined;
    const file = path.resolve(folder, ref);
    if (!existsSync(file)) {
      return undefined;
    }
    return store(file, kind);
  };

  if (raw.backgroundImageUrl !== undefined) {
    const ref = raw.backgroundImageUrl;
    raw.backgroundImageUrl = await media(ref, 'image');
    if (!raw.backgroundImageUrl) throw new Error(`Image introuvable : ${String(ref)}`);
  }
  if (raw.coverImageUrl !== undefined) {
    const ref = raw.coverImageUrl;
    raw.coverImageUrl = await media(ref, 'image');
    if (!raw.coverImageUrl) throw new Error(`Image introuvable : ${String(ref)}`);
  }
  const questions = Array.isArray(raw.questions) ? (raw.questions as Json[]) : [];
  for (const [i, q] of questions.entries()) {
    if (q.imageUrl !== undefined) {
      const ref = q.imageUrl;
      q.imageUrl = await media(ref, 'image');
      if (!q.imageUrl) {
        // PIN, « Couleurs perdues » zones: the picture is the question.
        if (
          q.type === 'PIN' ||
          q.type === 'MISSING' ||
          (q.type === 'COLORS' && Array.isArray(q.zones) && q.zones.length)
        )
          throw new Error(`Image introuvable : ${String(ref)}`);
        warn(`Question ${i + 1} : image ${String(ref)} absente, question importée sans l’image`);
        delete q.imageUrl;
        delete q.imageEffect;
      }
    }
    // « Qu'est-ce qui a disparu ? » (T59): the picture « après » is required too.
    if (q.missingImageUrl !== undefined) {
      const ref = q.missingImageUrl;
      q.missingImageUrl = await media(ref, 'image');
      if (!q.missingImageUrl) throw new Error(`Image introuvable : ${String(ref)}`);
    }
    // « Couleurs perdues » (T65): the picture with the zones in white (optional, but the
    // question needs it with paint-bucket zones: the schema says so).
    if (q.blankImageUrl !== undefined) {
      const ref = q.blankImageUrl;
      q.blankImageUrl = await media(ref, 'image');
      if (!q.blankImageUrl) throw new Error(`Image introuvable : ${String(ref)}`);
    }
    // « Associer » (T67): the pictures of the pairs.
    if (Array.isArray(q.pairs)) {
      for (const pair of q.pairs as Json[]) {
        for (const side of [pair.left, pair.right] as (Json | undefined)[]) {
          if (side?.imageUrl === undefined) continue;
          const ref = side.imageUrl;
          side.imageUrl = await media(ref, 'image');
          if (!side.imageUrl) throw new Error(`Image introuvable : ${String(ref)}`);
        }
      }
    }
    const audio = q.audio as Json | undefined;
    if (audio) {
      const url = await media(audio.url, 'audio');
      if (url) audio.url = url;
      else {
        warn(`Question ${i + 1} : son ${String(audio.url)} absent, question importée sans le son`);
        delete q.audio;
        delete q.audioOnReveal;
      }
    }
  }

  const parsed = QuizInput.safeParse({ ...raw, visibility: 'PRIVATE' });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((e) => `  - ${e.path.join('.')}: ${e.message}`);
    throw new Error(`quiz.json invalide :\n${issues.join('\n')}`);
  }
  return parsed.data;
}

/**
 * Creates the quiz for the host `ownerEmail`, or replaces the content of their quiz with the
 * same title (so re-running an import updates it instead of duplicating it).
 */
export async function saveImportedQuiz(
  prisma: PrismaClient,
  ownerEmail: string,
  input: QuizInput,
): Promise<{ quiz: QuizDetail; created: boolean }> {
  const owner = await prisma.user.findUnique({ where: { email: ownerEmail.trim().toLowerCase() } });
  if (!owner) throw new Error(`Aucun animateur avec l’adresse ${ownerEmail}`);
  const existing = await prisma.quiz.findFirst({
    where: { ownerId: owner.id, title: input.title },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (existing) {
    const quiz = await updateQuiz(prisma, existing.id, owner.id, input);
    return { quiz: quiz!, created: false };
  }
  return { quiz: await createQuiz(prisma, owner.id, input), created: true };
}
