-- CreateEnum
CREATE TYPE "GameMode" AS ENUM ('solo', 'teams');

-- AlterTable
ALTER TABLE "GameSession" ADD COLUMN     "mode" "GameMode" NOT NULL DEFAULT 'solo';

-- AlterTable
ALTER TABLE "PlayerResult" ADD COLUMN     "teamId" INTEGER;

-- CreateTable
CREATE TABLE "TeamResult" (
    "id" TEXT NOT NULL,
    "gameSessionId" TEXT NOT NULL,
    "teamId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "playerCount" INTEGER NOT NULL,
    "rank" INTEGER NOT NULL,

    CONSTRAINT "TeamResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeamResult_gameSessionId_teamId_key" ON "TeamResult"("gameSessionId", "teamId");

-- AddForeignKey
ALTER TABLE "TeamResult" ADD CONSTRAINT "TeamResult_gameSessionId_fkey" FOREIGN KEY ("gameSessionId") REFERENCES "GameSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
