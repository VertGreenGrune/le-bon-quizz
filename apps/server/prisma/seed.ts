/**
 * `pnpm db:seed` — demo host account + DEMO_QUIZ (kept with id `demo`, so
 * `host:create { quizId: 'demo' }` still works once games load quizzes from the DB).
 * Idempotent: the demo quiz is recreated on every run.
 */
import { DEMO_QUIZ } from '@lbq/shared';
import { hashPassword } from '../src/auth/password.js';
import { createQuiz } from '../src/api/quizzes.service.js';
import { createPrisma } from '../src/db.js';

const DEMO_EMAIL = 'demo@lebonquizz.local';
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'demo1234';

const prisma = createPrisma();
try {
  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {},
    create: { email: DEMO_EMAIL, name: 'Démo', passwordHash: await hashPassword(DEMO_PASSWORD) },
  });
  await prisma.quiz.deleteMany({ where: { id: DEMO_QUIZ.id } });
  const { id, ...input } = DEMO_QUIZ;
  await createQuiz(prisma, user.id, input, id);
  console.log(`Seeded quiz "${DEMO_QUIZ.title}" for ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
} finally {
  await prisma.$disconnect();
}
