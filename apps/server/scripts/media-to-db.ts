/**
 * `pnpm --filter @lbq/server media:to-db [upload dir]`
 *
 * Copies the pictures and sounds of the old upload dir (default UPLOAD_DIR, else `uploads`)
 * into the `Media` table, under the same names, so the URLs saved in quizzes keep working.
 * Files already in the database are skipped; the folder is left untouched.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createPrisma } from '../src/db.js';
import { contentTypeOf, saveMedia } from '../src/media.js';

const dir = path.resolve(
  process.env.INIT_CWD ?? process.cwd(),
  process.argv[2] ?? process.env.UPLOAD_DIR ?? 'uploads',
);
const prisma = createPrisma();
try {
  const names = (await readdir(dir)).filter((n) => contentTypeOf(n));
  const stored = new Set(
    (await prisma.media.findMany({ where: { name: { in: names } }, select: { name: true } })).map(
      (m) => m.name,
    ),
  );
  let copied = 0;
  let bytes = 0;
  for (const name of names) {
    if (stored.has(name)) continue;
    const data = await readFile(path.join(dir, name));
    await saveMedia(prisma, name, data);
    copied += 1;
    bytes += data.length;
  }
  console.log(
    `${copied} fichier(s) copié(s) (${(bytes / 1024 / 1024).toFixed(1)} Mo), ` +
      `${stored.size} déjà dans la base — dossier ${dir}`,
  );
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
