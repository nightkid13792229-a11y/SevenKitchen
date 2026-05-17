-- Mobile recipe designer: free-total draft weights, explicit FEDIAF 2025
-- dog scenarios, review state, and publish snapshots.

DO $$
BEGIN
  CREATE TYPE "DesignRecipeReviewStatus" AS ENUM ('NONE', 'REQUIRED', 'APPROVED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "FediafDogScenario" AS ENUM (
    'EARLY_GROWTH_REPRODUCTION',
    'LATE_GROWTH',
    'ADULT_MER_95',
    'ADULT_MER_110'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "DesignRecipeStatus" ADD VALUE IF NOT EXISTS 'NEEDS_REVIEW';

ALTER TABLE "design_recipe"
  ADD COLUMN "assessment_summary" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "fediaf_dog_scenario" "FediafDogScenario" NOT NULL DEFAULT 'ADULT_MER_110',
  ADD COLUMN "missing_data_report" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "review_note" TEXT,
  ADD COLUMN "review_status" "DesignRecipeReviewStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "reviewed_at" TIMESTAMP(3),
  ADD COLUMN "reviewed_by" TEXT,
  ADD COLUMN "total_weight_g" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ALTER COLUMN "energy_density_kcal_per_kg" SET DEFAULT 0,
  ALTER COLUMN "nutrition_standard" SET DEFAULT 'FEDIAF_2025',
  ALTER COLUMN "calculated_nutrition" SET DEFAULT '{}',
  ALTER COLUMN "compliance_status" SET DEFAULT '{}';

ALTER TABLE "design_recipe_item"
  ADD COLUMN "weight_g" DOUBLE PRECISION;

UPDATE "design_recipe_item"
SET "weight_g" = "weight_per_kg_g"
WHERE "weight_g" IS NULL;

UPDATE "design_recipe" AS recipe
SET "total_weight_g" = item_totals."total_weight_g"
FROM (
  SELECT
    "design_recipe_id",
    SUM("weight_g") AS "total_weight_g"
  FROM "design_recipe_item"
  GROUP BY "design_recipe_id"
) AS item_totals
WHERE recipe."id" = item_totals."design_recipe_id";

ALTER TABLE "design_recipe_item"
  ALTER COLUMN "weight_g" SET NOT NULL,
  ALTER COLUMN "ratio_percent" DROP NOT NULL,
  DROP COLUMN "weight_per_kg_g";

CREATE TABLE "design_recipe_publish_snapshot" (
  "id" TEXT NOT NULL,
  "design_recipe_id" TEXT NOT NULL,
  "recipe_id" TEXT NOT NULL,
  "snapshot_data" JSONB NOT NULL,
  "review_status" "DesignRecipeReviewStatus" NOT NULL,
  "review_note" TEXT,
  "published_by" TEXT NOT NULL,
  "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "design_recipe_publish_snapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "design_recipe_publish_snapshot_design_recipe_id_idx"
  ON "design_recipe_publish_snapshot"("design_recipe_id");

CREATE INDEX "design_recipe_publish_snapshot_recipe_id_idx"
  ON "design_recipe_publish_snapshot"("recipe_id");

CREATE INDEX "design_recipe_fediaf_dog_scenario_idx"
  ON "design_recipe"("fediaf_dog_scenario");

ALTER TABLE "design_recipe_publish_snapshot"
  ADD CONSTRAINT "design_recipe_publish_snapshot_design_recipe_id_fkey"
  FOREIGN KEY ("design_recipe_id")
  REFERENCES "design_recipe"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
