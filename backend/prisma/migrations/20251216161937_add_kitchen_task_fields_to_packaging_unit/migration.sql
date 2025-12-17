/*
  Warnings:

  - Added the required column `updated_at` to the `packaging_unit` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PackagingUnitStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED');

-- AlterTable: Add columns (updated_at as nullable first for safe backfill)
ALTER TABLE "packaging_unit" ADD COLUMN     "ingredients_usage_snapshot" JSONB,
ADD COLUMN     "photos_cooked" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "photos_portioned" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "photos_raw" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "status" "PackagingUnitStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "updated_at" TIMESTAMP(3);

-- Backfill: Set updated_at = created_at for existing rows
UPDATE "packaging_unit" SET "updated_at" = "created_at" WHERE "updated_at" IS NULL;

-- Set NOT NULL constraint after backfill
ALTER TABLE "packaging_unit" ALTER COLUMN "updated_at" SET NOT NULL;

-- CreateIndex
CREATE INDEX "packaging_unit_status_idx" ON "packaging_unit"("status");
