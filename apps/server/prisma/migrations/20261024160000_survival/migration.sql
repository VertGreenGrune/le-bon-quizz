-- AlterEnum
ALTER TYPE "GameMode" ADD VALUE 'survival';

-- AlterTable
ALTER TABLE "GameSession" ADD COLUMN     "hearts" INTEGER;

-- AlterTable
ALTER TABLE "PlayerResult" ADD COLUMN     "eliminatedAt" INTEGER,
ADD COLUMN     "hearts" INTEGER;
