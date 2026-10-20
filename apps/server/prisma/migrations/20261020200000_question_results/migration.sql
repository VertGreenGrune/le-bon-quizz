-- CreateTable
CREATE TABLE "QuestionResult" (
    "id" TEXT NOT NULL,
    "gameSessionId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "choices" TEXT[],
    "correctIndexes" INTEGER[],
    "distribution" INTEGER[],
    "playerCount" INTEGER NOT NULL,
    "correctCount" INTEGER NOT NULL,

    CONSTRAINT "QuestionResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuestionResult_gameSessionId_index_key" ON "QuestionResult"("gameSessionId", "index");

-- AddForeignKey
ALTER TABLE "QuestionResult" ADD CONSTRAINT "QuestionResult_gameSessionId_fkey" FOREIGN KEY ("gameSessionId") REFERENCES "GameSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

