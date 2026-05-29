ALTER TABLE "design_recipe"
  ADD COLUMN IF NOT EXISTS "published_recipe_version" INTEGER,
  ADD COLUMN IF NOT EXISTS "revision_of_design_recipe_id" TEXT,
  ADD COLUMN IF NOT EXISTS "revision_base_recipe_id" TEXT;

ALTER TABLE "design_recipe_publish_snapshot"
  ADD COLUMN IF NOT EXISTS "recipe_version" INTEGER;

CREATE INDEX IF NOT EXISTS "design_recipe_revision_of_design_recipe_id_idx"
  ON "design_recipe"("revision_of_design_recipe_id");

CREATE INDEX IF NOT EXISTS "design_recipe_revision_base_recipe_id_idx"
  ON "design_recipe"("revision_base_recipe_id");

CREATE INDEX IF NOT EXISTS "design_recipe_publish_snapshot_recipe_id_recipe_version_idx"
  ON "design_recipe_publish_snapshot"("recipe_id", "recipe_version");
