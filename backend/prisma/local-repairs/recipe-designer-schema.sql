-- Local development repair for databases that already have the
-- design_recipe foundation tables but have not applied the mobile recipe
-- designer schema changes.

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
  ADD COLUMN IF NOT EXISTS "assessment_summary" JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "fediaf_dog_scenario" "FediafDogScenario" DEFAULT 'ADULT_MER_110',
  ADD COLUMN IF NOT EXISTS "missing_data_report" JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "review_note" TEXT,
  ADD COLUMN IF NOT EXISTS "review_status" "DesignRecipeReviewStatus" DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS "reviewed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reviewed_by" TEXT,
  ADD COLUMN IF NOT EXISTS "total_weight_g" DOUBLE PRECISION DEFAULT 0;

UPDATE "design_recipe"
SET
  "assessment_summary" = COALESCE("assessment_summary", '{}'::jsonb),
  "fediaf_dog_scenario" = COALESCE("fediaf_dog_scenario", 'ADULT_MER_110'::"FediafDogScenario"),
  "missing_data_report" = COALESCE("missing_data_report", '[]'::jsonb),
  "review_status" = COALESCE("review_status", 'NONE'::"DesignRecipeReviewStatus"),
  "total_weight_g" = COALESCE("total_weight_g", 0);

ALTER TABLE "design_recipe"
  ALTER COLUMN "assessment_summary" SET NOT NULL,
  ALTER COLUMN "assessment_summary" SET DEFAULT '{}',
  ALTER COLUMN "fediaf_dog_scenario" SET NOT NULL,
  ALTER COLUMN "fediaf_dog_scenario" SET DEFAULT 'ADULT_MER_110',
  ALTER COLUMN "missing_data_report" SET NOT NULL,
  ALTER COLUMN "missing_data_report" SET DEFAULT '[]',
  ALTER COLUMN "review_status" SET NOT NULL,
  ALTER COLUMN "review_status" SET DEFAULT 'NONE',
  ALTER COLUMN "total_weight_g" SET NOT NULL,
  ALTER COLUMN "total_weight_g" SET DEFAULT 0,
  ALTER COLUMN "energy_density_kcal_per_kg" DROP NOT NULL,
  ALTER COLUMN "energy_density_kcal_per_kg" DROP DEFAULT,
  ALTER COLUMN "nutrition_standard" SET DEFAULT 'FEDIAF_2025',
  ALTER COLUMN "calculated_nutrition" SET DEFAULT '{}',
  ALTER COLUMN "compliance_status" SET DEFAULT '{}';

ALTER TABLE "design_recipe_item"
  ADD COLUMN IF NOT EXISTS "weight_g" DOUBLE PRECISION;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'design_recipe_item'
      AND column_name = 'weight_per_kg_g'
  ) THEN
    EXECUTE 'UPDATE "design_recipe_item" SET "weight_g" = "weight_per_kg_g" WHERE "weight_g" IS NULL';
  END IF;
END $$;

UPDATE "design_recipe_item"
SET "weight_g" = 0
WHERE "weight_g" IS NULL;

ALTER TABLE "design_recipe_item"
  ALTER COLUMN "weight_g" SET NOT NULL,
  ALTER COLUMN "ratio_percent" DROP NOT NULL,
  DROP COLUMN IF EXISTS "weight_per_kg_g";

UPDATE "design_recipe" AS recipe
SET "total_weight_g" = COALESCE(item_totals."total_weight_g", 0)
FROM (
  SELECT
    "design_recipe_id",
    SUM("weight_g") AS "total_weight_g"
  FROM "design_recipe_item"
  GROUP BY "design_recipe_id"
) AS item_totals
WHERE recipe."id" = item_totals."design_recipe_id";

CREATE TABLE IF NOT EXISTS "design_recipe_publish_snapshot" (
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

CREATE INDEX IF NOT EXISTS "design_recipe_publish_snapshot_design_recipe_id_idx"
  ON "design_recipe_publish_snapshot"("design_recipe_id");

CREATE INDEX IF NOT EXISTS "design_recipe_publish_snapshot_recipe_id_idx"
  ON "design_recipe_publish_snapshot"("recipe_id");

CREATE INDEX IF NOT EXISTS "design_recipe_fediaf_dog_scenario_idx"
  ON "design_recipe"("fediaf_dog_scenario");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'design_recipe_publish_snapshot_design_recipe_id_fkey'
  ) THEN
    ALTER TABLE "design_recipe_publish_snapshot"
      ADD CONSTRAINT "design_recipe_publish_snapshot_design_recipe_id_fkey"
      FOREIGN KEY ("design_recipe_id")
      REFERENCES "design_recipe"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;
