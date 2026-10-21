-- CreateEnum
CREATE TYPE "QuizVisibility" AS ENUM ('PRIVATE', 'PUBLIC');

-- AlterTable
ALTER TABLE "Quiz" ADD COLUMN     "visibility" "QuizVisibility" NOT NULL DEFAULT 'PRIVATE';

-- CreateIndex
CREATE INDEX "Quiz_visibility_createdAt_idx" ON "Quiz"("visibility", "createdAt");
