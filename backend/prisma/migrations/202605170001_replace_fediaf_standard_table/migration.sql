DROP TABLE IF EXISTS "nutrition_standard_fediaf";

CREATE TYPE "NutritionStandardSpecies" AS ENUM ('DOG', 'CAT');
CREATE TYPE "NutritionStandardEntrySourceType" AS ENUM ('CORE_RECOMMENDATION', 'ANNEX_7_8');
CREATE TYPE "NutritionStandardBasis" AS ENUM ('PER_100G_DRY_MATTER', 'PER_1000_KCAL_ME', 'PER_MJ_ME', 'RATIO');
CREATE TYPE "NutritionStandardMaxType" AS ENUM ('LEGAL_MAX', 'NUTRITIONAL_MAX', 'UNSPECIFIED');
CREATE TYPE "NutritionStandardReviewStatus" AS ENUM ('UNREVIEWED', 'REVIEWED', 'QUESTION', 'NEEDS_FIX');

CREATE TABLE "nutrition_standard_version" (
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
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "nutrition_standard_version_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "nutrition_nutrient_definition" (
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
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "nutrition_nutrient_definition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "nutrition_standard_entry" (
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
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "nutrition_standard_entry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "nutrition_standard_review_event" (
  "id" TEXT NOT NULL,
  "entry_id" TEXT NOT NULL,
  "status" "NutritionStandardReviewStatus" NOT NULL,
  "note" TEXT,
  "reviewed_by" TEXT,
  "reviewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "nutrition_standard_review_event_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "nutrition_standard_version_code_key" ON "nutrition_standard_version"("code");
CREATE UNIQUE INDEX "nutrition_standard_version_id_species_key" ON "nutrition_standard_version"("id", "species");
CREATE INDEX "nutrition_standard_version_standard_code_species_idx" ON "nutrition_standard_version"("standard_code", "species");
CREATE INDEX "nutrition_standard_version_is_active_idx" ON "nutrition_standard_version"("is_active");

CREATE UNIQUE INDEX "nutrition_nutrient_definition_code_key" ON "nutrition_nutrient_definition"("code");
CREATE INDEX "nutrition_nutrient_definition_category_idx" ON "nutrition_nutrient_definition"("category");
CREATE INDEX "nutrition_nutrient_definition_is_active_idx" ON "nutrition_nutrient_definition"("is_active");

CREATE UNIQUE INDEX "nutrition_standard_entry_version_id_nutrient_id_source_table_life_stage_basis_unit_key"
  ON "nutrition_standard_entry"("version_id", "nutrient_id", "source_table", "life_stage", "basis", "unit");
CREATE INDEX "nutrition_standard_entry_version_id_idx" ON "nutrition_standard_entry"("version_id");
CREATE INDEX "nutrition_standard_entry_nutrient_id_idx" ON "nutrition_standard_entry"("nutrient_id");
CREATE INDEX "nutrition_standard_entry_source_table_idx" ON "nutrition_standard_entry"("source_table");
CREATE INDEX "nutrition_standard_entry_source_type_idx" ON "nutrition_standard_entry"("source_type");
CREATE INDEX "nutrition_standard_entry_life_stage_idx" ON "nutrition_standard_entry"("life_stage");
CREATE INDEX "nutrition_standard_entry_category_idx" ON "nutrition_standard_entry"("category");

CREATE INDEX "nutrition_standard_review_event_entry_id_reviewed_at_idx" ON "nutrition_standard_review_event"("entry_id", "reviewed_at");
CREATE INDEX "nutrition_standard_review_event_status_idx" ON "nutrition_standard_review_event"("status");

ALTER TABLE "nutrition_standard_entry"
  ADD CONSTRAINT "nutrition_standard_entry_version_id_species_fkey"
  FOREIGN KEY ("version_id", "species") REFERENCES "nutrition_standard_version"("id", "species") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "nutrition_standard_entry"
  ADD CONSTRAINT "nutrition_standard_entry_nutrient_id_fkey"
  FOREIGN KEY ("nutrient_id") REFERENCES "nutrition_nutrient_definition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "nutrition_standard_review_event"
  ADD CONSTRAINT "nutrition_standard_review_event_entry_id_fkey"
  FOREIGN KEY ("entry_id") REFERENCES "nutrition_standard_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
