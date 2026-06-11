ALTER TABLE "recipe_series"
  ADD COLUMN IF NOT EXISTS "customer_dog_id" TEXT;

ALTER TABLE "design_recipe"
  ADD COLUMN IF NOT EXISTS "customer_dog_id" TEXT;

ALTER TABLE "recipe"
  ADD COLUMN IF NOT EXISTS "customer_owner_id" TEXT,
  ADD COLUMN IF NOT EXISTS "customer_dog_id" TEXT,
  ADD COLUMN IF NOT EXISTS "source_design_recipe_id" TEXT;

CREATE INDEX IF NOT EXISTS "recipe_series_customer_dog_id_idx"
  ON "recipe_series"("customer_dog_id");

CREATE INDEX IF NOT EXISTS "design_recipe_customer_dog_id_idx"
  ON "design_recipe"("customer_dog_id");

CREATE INDEX IF NOT EXISTS "recipe_customer_owner_id_idx"
  ON "recipe"("customer_owner_id");

CREATE INDEX IF NOT EXISTS "recipe_customer_dog_id_idx"
  ON "recipe"("customer_dog_id");

CREATE UNIQUE INDEX IF NOT EXISTS "recipe_source_design_recipe_id_key"
  ON "recipe"("source_design_recipe_id");
