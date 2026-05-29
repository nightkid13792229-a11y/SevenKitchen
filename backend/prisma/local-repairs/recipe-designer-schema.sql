-- Local development repair for databases that already have the
-- design_recipe foundation tables but have not applied the mobile recipe
-- designer schema changes.

DO $$
BEGIN
  CREATE TYPE "NutritionStandardSpecies" AS ENUM ('DOG', 'CAT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "NutritionStandardEntrySourceType" AS ENUM ('CORE_RECOMMENDATION', 'ANNEX_7_8');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "NutritionStandardBasis" AS ENUM (
    'PER_100G_DRY_MATTER',
    'PER_1000_KCAL_ME',
    'PER_MJ_ME',
    'RATIO'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "NutritionStandardMaxType" AS ENUM ('LEGAL_MAX', 'NUTRITIONAL_MAX', 'UNSPECIFIED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "NutritionStandardReviewStatus" AS ENUM ('UNREVIEWED', 'REVIEWED', 'QUESTION', 'NEEDS_FIX');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "nutrition_standard_version" (
  "id" TEXT NOT NULL,
  "code" VARCHAR(80) NOT NULL,
  "standard_code" VARCHAR(50) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "species" "NutritionStandardSpecies" NOT NULL,
  "publication_month" VARCHAR(7) NOT NULL,
  "source_title" VARCHAR(300) NOT NULL,
  "source_url" VARCHAR(500) NOT NULL,
  "pdf_url" VARCHAR(500) NOT NULL,
  "import_batch" VARCHAR(80) NOT NULL,
  "import_status" VARCHAR(40) NOT NULL DEFAULT 'IMPORTED',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "nutrition_standard_version_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "nutrition_nutrient_definition" (
  "id" TEXT NOT NULL,
  "code" VARCHAR(80) NOT NULL,
  "field_path" VARCHAR(120),
  "name" VARCHAR(120) NOT NULL,
  "name_en" VARCHAR(160) NOT NULL,
  "category" VARCHAR(60) NOT NULL,
  "default_ingredient_unit" VARCHAR(20),
  "default_standard_unit" VARCHAR(30) NOT NULL,
  "is_direct" BOOLEAN NOT NULL DEFAULT true,
  "is_derived" BOOLEAN NOT NULL DEFAULT false,
  "expression" JSONB,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "nutrition_nutrient_definition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "nutrition_standard_entry" (
  "id" TEXT NOT NULL,
  "version_id" TEXT NOT NULL,
  "nutrient_id" TEXT NOT NULL,
  "fediaf_name" VARCHAR(160) NOT NULL,
  "category" VARCHAR(60) NOT NULL,
  "source_table" VARCHAR(20) NOT NULL,
  "source_type" "NutritionStandardEntrySourceType" NOT NULL,
  "pdf_page" INTEGER NOT NULL,
  "species" "NutritionStandardSpecies" NOT NULL,
  "life_stage" VARCHAR(80) NOT NULL,
  "basis" "NutritionStandardBasis" NOT NULL,
  "unit" VARCHAR(30) NOT NULL,
  "min_value" DOUBLE PRECISION,
  "max_value" DOUBLE PRECISION,
  "recommended_value" DOUBLE PRECISION,
  "max_type" "NutritionStandardMaxType" NOT NULL DEFAULT 'UNSPECIFIED',
  "footnote_refs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "notes" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "nutrition_standard_entry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "nutrition_standard_review_event" (
  "id" TEXT NOT NULL,
  "entry_id" TEXT NOT NULL,
  "status" "NutritionStandardReviewStatus" NOT NULL,
  "note" TEXT,
  "reviewed_by" TEXT,
  "reviewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "nutrition_standard_review_event_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "nutrition_standard_version_code_key"
  ON "nutrition_standard_version"("code");

CREATE UNIQUE INDEX IF NOT EXISTS "nutrition_standard_version_id_species_key"
  ON "nutrition_standard_version"("id", "species");

CREATE INDEX IF NOT EXISTS "nutrition_standard_version_standard_code_species_idx"
  ON "nutrition_standard_version"("standard_code", "species");

CREATE INDEX IF NOT EXISTS "nutrition_standard_version_is_active_idx"
  ON "nutrition_standard_version"("is_active");

CREATE UNIQUE INDEX IF NOT EXISTS "nutrition_nutrient_definition_code_key"
  ON "nutrition_nutrient_definition"("code");

CREATE INDEX IF NOT EXISTS "nutrition_nutrient_definition_category_idx"
  ON "nutrition_nutrient_definition"("category");

CREATE INDEX IF NOT EXISTS "nutrition_nutrient_definition_is_active_idx"
  ON "nutrition_nutrient_definition"("is_active");

CREATE UNIQUE INDEX IF NOT EXISTS "nutrition_standard_entry_version_id_nutrient_id_source_table_life_stage_basis_unit_key"
  ON "nutrition_standard_entry"("version_id", "nutrient_id", "source_table", "life_stage", "basis", "unit");

CREATE INDEX IF NOT EXISTS "nutrition_standard_entry_version_id_idx"
  ON "nutrition_standard_entry"("version_id");

CREATE INDEX IF NOT EXISTS "nutrition_standard_entry_nutrient_id_idx"
  ON "nutrition_standard_entry"("nutrient_id");

CREATE INDEX IF NOT EXISTS "nutrition_standard_entry_source_table_idx"
  ON "nutrition_standard_entry"("source_table");

CREATE INDEX IF NOT EXISTS "nutrition_standard_entry_source_type_idx"
  ON "nutrition_standard_entry"("source_type");

CREATE INDEX IF NOT EXISTS "nutrition_standard_entry_life_stage_idx"
  ON "nutrition_standard_entry"("life_stage");

CREATE INDEX IF NOT EXISTS "nutrition_standard_entry_category_idx"
  ON "nutrition_standard_entry"("category");

CREATE INDEX IF NOT EXISTS "nutrition_standard_review_event_entry_id_reviewed_at_idx"
  ON "nutrition_standard_review_event"("entry_id", "reviewed_at");

CREATE INDEX IF NOT EXISTS "nutrition_standard_review_event_status_idx"
  ON "nutrition_standard_review_event"("status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'nutrition_standard_entry_version_id_species_fkey'
  ) THEN
    ALTER TABLE "nutrition_standard_entry"
      ADD CONSTRAINT "nutrition_standard_entry_version_id_species_fkey"
      FOREIGN KEY ("version_id", "species")
      REFERENCES "nutrition_standard_version"("id", "species")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'nutrition_standard_entry_nutrient_id_fkey'
  ) THEN
    ALTER TABLE "nutrition_standard_entry"
      ADD CONSTRAINT "nutrition_standard_entry_nutrient_id_fkey"
      FOREIGN KEY ("nutrient_id")
      REFERENCES "nutrition_nutrient_definition"("id")
      ON DELETE RESTRICT
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'nutrition_standard_review_event_entry_id_fkey'
  ) THEN
    ALTER TABLE "nutrition_standard_review_event"
      ADD CONSTRAINT "nutrition_standard_review_event_entry_id_fkey"
      FOREIGN KEY ("entry_id")
      REFERENCES "nutrition_standard_entry"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

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
