CREATE TYPE "RecipeSeriesStatus" AS ENUM ('ACTIVE', 'DELETED');

CREATE TABLE "recipe_series" (
  "id" TEXT NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "status" "RecipeSeriesStatus" NOT NULL DEFAULT 'ACTIVE',
  "deleted_at" TIMESTAMP(3),
  "deleted_by" TEXT,
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recipe_series_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "recipe_series_status_idx" ON "recipe_series"("status");
CREATE INDEX "recipe_series_updated_at_idx" ON "recipe_series"("updated_at");

ALTER TABLE "recipe"
  ADD COLUMN "series_id" TEXT,
  ADD COLUMN "series_life_stage" TEXT;

ALTER TABLE "design_recipe"
  ADD COLUMN "series_id" TEXT,
  ADD COLUMN "series_life_stage" TEXT;

CREATE INDEX "recipe_series_id_idx" ON "recipe"("series_id");
CREATE INDEX "recipe_series_id_series_life_stage_status_idx"
  ON "recipe"("series_id", "series_life_stage", "status");
CREATE INDEX "design_recipe_series_id_idx" ON "design_recipe"("series_id");
CREATE INDEX "design_recipe_series_id_series_life_stage_idx"
  ON "design_recipe"("series_id", "series_life_stage");

ALTER TABLE "recipe"
  ADD CONSTRAINT "recipe_series_id_fkey"
  FOREIGN KEY ("series_id") REFERENCES "recipe_series"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "design_recipe"
  ADD CONSTRAINT "design_recipe_series_id_fkey"
  FOREIGN KEY ("series_id") REFERENCES "recipe_series"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
