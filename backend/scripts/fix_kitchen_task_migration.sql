-- Manual fix script for Phase 8.12 migration
-- This script safely adds the kitchen task fields to packaging_unit table
-- Run this if the migration was marked as applied but failed during execution

-- Step 1: Create enum if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PackagingUnitStatus') THEN
    CREATE TYPE "PackagingUnitStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED');
  END IF;
END $$;

-- Step 2: Add columns if they don't exist (idempotent)
DO $$
BEGIN
  -- Add ingredients_usage_snapshot
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'packaging_unit' AND column_name = 'ingredients_usage_snapshot'
  ) THEN
    ALTER TABLE "packaging_unit" ADD COLUMN "ingredients_usage_snapshot" JSONB;
  END IF;

  -- Add photos_cooked
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'packaging_unit' AND column_name = 'photos_cooked'
  ) THEN
    ALTER TABLE "packaging_unit" ADD COLUMN "photos_cooked" TEXT[] DEFAULT ARRAY[]::TEXT[];
  END IF;

  -- Add photos_portioned
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'packaging_unit' AND column_name = 'photos_portioned'
  ) THEN
    ALTER TABLE "packaging_unit" ADD COLUMN "photos_portioned" TEXT[] DEFAULT ARRAY[]::TEXT[];
  END IF;

  -- Add photos_raw
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'packaging_unit' AND column_name = 'photos_raw'
  ) THEN
    ALTER TABLE "packaging_unit" ADD COLUMN "photos_raw" TEXT[] DEFAULT ARRAY[]::TEXT[];
  END IF;

  -- Add status
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'packaging_unit' AND column_name = 'status'
  ) THEN
    ALTER TABLE "packaging_unit" ADD COLUMN "status" "PackagingUnitStatus" NOT NULL DEFAULT 'PENDING';
  END IF;

  -- Add updated_at (nullable first)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'packaging_unit' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE "packaging_unit" ADD COLUMN "updated_at" TIMESTAMP(3);
  END IF;
END $$;

-- Step 3: Backfill updated_at for existing rows
UPDATE "packaging_unit" 
SET "updated_at" = "created_at" 
WHERE "updated_at" IS NULL;

-- Step 4: Set NOT NULL constraint on updated_at
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'packaging_unit' 
    AND column_name = 'updated_at' 
    AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE "packaging_unit" ALTER COLUMN "updated_at" SET NOT NULL;
  END IF;
END $$;

-- Step 5: Create index if it doesn't exist
CREATE INDEX IF NOT EXISTS "packaging_unit_status_idx" ON "packaging_unit"("status");
