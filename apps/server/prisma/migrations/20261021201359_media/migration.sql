-- CreateEnum
CREATE TYPE "ImageEffect" AS ENUM ('none', 'blur', 'zoom', 'pixelate');

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "audioDurationSec" INTEGER,
ADD COLUMN     "audioOnReveal" BOOLEAN,
ADD COLUMN     "audioStartSec" DOUBLE PRECISION,
ADD COLUMN     "audioUrl" TEXT,
ADD COLUMN     "imageEffect" "ImageEffect";
