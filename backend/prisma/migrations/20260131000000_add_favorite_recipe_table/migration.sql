-- Migration: Add Favorite Recipe Table
-- Date: 2026-01-31
-- Description: Create favorite_recipe table for user recipe bookmarks

-- Create favorite_recipe table
CREATE TABLE "favorite_recipe" (
    "id" text NOT NULL,
    "user_id" text NOT NULL,
    "recipe_id" text NOT NULL,
    "created_at" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Create primary key
ALTER TABLE ONLY "favorite_recipe"
    ADD CONSTRAINT "favorite_recipe_pkey" PRIMARY KEY ("id");

-- Create unique constraint to prevent duplicates
ALTER TABLE ONLY "favorite_recipe"
    ADD CONSTRAINT "favorite_recipe_user_id_recipe_id_key"
    UNIQUE ("user_id", "recipe_id");

-- Create indexes
CREATE INDEX "favorite_recipe_user_id_idx"
ON "favorite_recipe" ("user_id");

CREATE INDEX "favorite_recipe_recipe_id_idx"
ON "favorite_recipe" ("recipe_id");

CREATE INDEX "favorite_recipe_created_at_idx"
ON "favorite_recipe" ("created_at");

-- Create foreign key
ALTER TABLE ONLY "favorite_recipe"
    ADD CONSTRAINT "favorite_recipe_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "user"("id")
    ON UPDATE CASCADE ON DELETE CASCADE;
