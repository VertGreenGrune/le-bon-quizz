-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "auction" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "auctionTopic" TEXT;
