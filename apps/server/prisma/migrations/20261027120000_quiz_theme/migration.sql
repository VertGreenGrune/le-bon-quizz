-- CreateEnum
CREATE TYPE "QuizTheme" AS ENUM ('classic', 'halloween', 'christmas', 'retro', 'space');

-- AlterTable
ALTER TABLE "Quiz" ADD COLUMN     "theme" "QuizTheme" NOT NULL DEFAULT 'classic';
