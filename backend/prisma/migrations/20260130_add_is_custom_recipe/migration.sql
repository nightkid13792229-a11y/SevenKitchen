-- Migration: Add is_custom_recipe column to recipe table
-- Date: 2026-01-30
-- Description: Add missing is_custom_recipe field to support custom recipe feature

-- Add the missing column
ALTER TABLE "recipe"
ADD COLUMN IF NOT EXISTS "is_custom_recipe" BOOLEAN NOT NULL DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN "recipe"."is_custom_recipe" IS 'Indicates if this is a custom recipe created by customer';

-- Create index for performance (optional but recommended)
CREATE INDEX IF NOT EXISTS "recipe_is_custom_recipe_idx" ON "recipe"("is_custom_recipe");
