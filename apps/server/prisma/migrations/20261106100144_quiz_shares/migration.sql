-- CreateEnum
CREATE TYPE "ShareRole" AS ENUM ('viewer', 'editor');

-- CreateTable
CREATE TABLE "QuizShare" (
    "quizId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ShareRole" NOT NULL DEFAULT 'viewer',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuizShare_pkey" PRIMARY KEY ("quizId","userId")
);

-- CreateIndex
CREATE INDEX "QuizShare_userId_idx" ON "QuizShare"("userId");

-- AddForeignKey
ALTER TABLE "QuizShare" ADD CONSTRAINT "QuizShare_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizShare" ADD CONSTRAINT "QuizShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
