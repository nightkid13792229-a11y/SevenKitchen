-- Script: Create favorite_recipe table in production database
-- Date: 2026-01-31
-- Description: Add missing favorite_recipe table to support recipe favorites feature

-- Start transaction
BEGIN;

-- Check if table exists, create if not
CREATE TABLE IF NOT EXISTS "favorite_recipe" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "recipe_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorite_recipe_pkey" PRIMARY KEY ("id")
);

-- Create unique constraint on (user_id, recipe_id)
CREATE UNIQUE INDEX IF NOT EXISTS "favorite_recipe_user_id_recipe_id_key" ON "favorite_recipe"("user_id", "recipe_id");

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "favorite_recipe_user_id_idx" ON "favorite_recipe"("user_id");
CREATE INDEX IF NOT EXISTS "favorite_recipe_recipe_id_idx" ON "favorite_recipe"("recipe_id");
CREATE INDEX IF NOT EXISTS "favorite_recipe_created_at_idx" ON "favorite_recipe"("created_at");

-- Add foreign key constraint to user table
ALTER TABLE "favorite_recipe"
DROP CONSTRAINT IF EXISTS "favorite_recipe_user_id_fkey";

ALTER TABLE "favorite_recipe"
ADD CONSTRAINT "favorite_recipe_user_id_fkey"
FOREIGN KEY ("user_id")
REFERENCES "user"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Add comment for documentation
COMMENT ON TABLE "favorite_recipe" IS 'User favorite recipes';
COMMENT ON COLUMN "favorite_recipe"."user_id" IS 'User who favorited the recipe';
COMMENT ON COLUMN "favorite_recipe"."recipe_id" IS 'Recipe business ID (not UUID)';
COMMENT ON COLUMN "favorite_recipe"."created_at" IS 'When the recipe was favorited';

-- Commit transaction
COMMIT;

-- Verify table creation
SELECT
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'favorite_recipe'
ORDER BY ordinal_position;
