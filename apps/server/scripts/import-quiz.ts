/**
 * `pnpm --filter @lbq/server quiz:import <folder> <owner email> [--base-url <url>]`
 *
 * Imports `<folder>/quiz.json` as a private quiz of that host (updated in place if they already
 * have a quiz with this title). Media are copied into UPLOAD_DIR and referenced from
 * `--base-url` (default PUBLIC_URL, else http://localhost:<PORT>). See `quizImport.ts`.
 */
import path from 'node:path';
import { createPrisma } from '../src/db.js';
import { prepareQuiz, saveImportedQuiz, uploadDirStore } from './quizImport.js';

const args = process.argv.slice(2);
const baseUrlAt = args.indexOf('--base-url');
const baseUrl =
  baseUrlAt >= 0
    ? args.splice(baseUrlAt, 2)[1]
    : (process.env.PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 3001}`);
const [folderArg, email] = args;
if (!folderArg || !email || !baseUrl) {
  console.error('Usage : quiz:import <dossier> <email de l’animateur> [--base-url <url>]');
  process.exit(1);
}

// pnpm --filter runs this in apps/server: resolve the folder from where pnpm was launched.
const folder = path.resolve(process.env.INIT_CWD ?? process.cwd(), folderArg);
const uploadDir = path.resolve(process.env.UPLOAD_DIR ?? 'uploads');

const prisma = createPrisma();
try {
  const input = await prepareQuiz(folder, uploadDirStore(uploadDir, baseUrl), (m) =>
    console.warn(`⚠️  ${m}`),
  );
  const { quiz, created } = await saveImportedQuiz(prisma, email, input);
  console.log(
    `${created ? 'Créé' : 'Mis à jour'} : « ${quiz.title} » (${quiz.questions.length} questions, ` +
      `privé) pour ${email} — id ${quiz.id}`,
  );
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
