-- AlterTable
ALTER TABLE "GameSession" ADD COLUMN     "jokers" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PlayerResult" ADD COLUMN     "jokersUsed" TEXT[] DEFAULT ARRAY[]::TEXT[];
