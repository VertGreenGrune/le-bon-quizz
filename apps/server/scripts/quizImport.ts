/**
 * Quiz import (T23): a folder with a `quiz.json` (`QuizInput`, media given as paths relative to
 * the folder) becomes a private quiz of a host. Used by `scripts/import-quiz.ts`.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { QuizInput, type QuizDetail } from '@lbq/shared';
import { createQuiz, updateQuiz } from '../src/api/quizzes.service.js';
import { sniffAudioType, sniffImageType } from '../src/api/uploads.routes.js';
import type { PrismaClient } from '../src/db.js';

export type MediaKind = 'image' | 'audio';

/** Copies a local media file to where the server serves it; returns its public URL. */
export type MediaStore = (file: string, kind: MediaKind) => Promise<string>;

const isUrl = (s: string) => /^https?:\/\//i.test(s);

/**
 * Media store writing into the server's upload dir (served at `<baseUrl>/uploads/`). Files are
 * named after their content hash, so importing the same quiz again reuses the same files.
 */
export function uploadDirStore(uploadDir: string, baseUrl: string): MediaStore {
  return async (file, kind) => {
    const data = await readFile(file);
    const ext = kind === 'image' ? sniffImageType(data) : sniffAudioType(data);
    if (!ext)
      throw new Error(`${file}: format ${kind === 'image' ? 'd’image' : 'audio'} non reconnu`);
    const name = `${createHash('sha256').update(data).digest('hex').slice(0, 32)}.${ext}`;
    await mkdir(uploadDir, { recursive: true });
    const target = path.join(uploadDir, name);
    if (!existsSync(target)) await writeFile(target, data);
    return `${baseUrl.replace(/\/+$/, '')}/uploads/${name}`;
  };
}

type Json = Record<string, unknown>;

/**
 * Reads `<folder>/quiz.json`, copies its local media through `store` and validates it with
 * `QuizInput`. A missing sound is skipped with a warning (music files are added by the user);
 * a missing picture is an error. The quiz is always private.
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
      if (kind === 'image') throw new Error(`Image introuvable : ${ref}`);
      return undefined;
    }
    return store(file, kind);
  };

  if (raw.coverImageUrl !== undefined) raw.coverImageUrl = await media(raw.coverImageUrl, 'image');
  const questions = Array.isArray(raw.questions) ? (raw.questions as Json[]) : [];
  for (const [i, q] of questions.entries()) {
    if (q.imageUrl !== undefined) q.imageUrl = await media(q.imageUrl, 'image');
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
