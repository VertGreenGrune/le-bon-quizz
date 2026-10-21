-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "QuestionType" ADD VALUE 'TYPE_ANSWER';
ALTER TYPE "QuestionType" ADD VALUE 'POLL';
ALTER TYPE "QuestionType" ADD VALUE 'SLIDER';

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "config" JSONB;

-- AlterTable
ALTER TABLE "QuestionResult" ADD COLUMN     "answerCount" INTEGER,
ADD COLUMN     "details" JSONB,
ADD COLUMN     "type" "QuestionType" NOT NULL DEFAULT 'MCQ';
