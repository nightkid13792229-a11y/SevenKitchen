CREATE TYPE "NutritionGovernanceSourceType" AS ENUM (
  'USDA',
  'CFCT',
  'SUPPLEMENT_LABEL',
  'MANUAL'
);

CREATE TYPE "NutritionGovernanceRecordStatus" AS ENUM (
  'ACTIVE',
  'DEPRECATED'
);

CREATE TYPE "NutritionCandidateStatus" AS ENUM (
  'CANDIDATE',
  'CONFIRMED',
  'REJECTED',
  'SKIPPED'
);

CREATE TYPE "NutritionMatchConfidence" AS ENUM (
  'HIGH',
  'MEDIUM',
  'LOW'
);

CREATE TYPE "SupplementNutritionDraftStatus" AS ENUM (
  'DRAFT',
  'CONFIRMED',
  'REJECTED'
);

CREATE TABLE "nutrition_source_record" (
  "id" TEXT NOT NULL,
  "source_type" "NutritionGovernanceSourceType" NOT NULL,
  "source_key" VARCHAR(200) NOT NULL,
  "source_title" VARCHAR(300) NOT NULL,
  "source_detail" JSONB,
  "food_name" VARCHAR(300) NOT NULL,
  "food_name_en" VARCHAR(300),
  "data_type" VARCHAR(100),
  "category" VARCHAR(100),
  "raw_data" JSONB NOT NULL,
  "normalized_nutrition" JSONB,
  "status" "NutritionGovernanceRecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "nutrition_source_record_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ingredient_nutrition_candidate" (
  "id" TEXT NOT NULL,
  "ingredient_id" TEXT NOT NULL,
  "source_record_id" TEXT NOT NULL,
  "source_priority" INTEGER NOT NULL,
  "confidence" "NutritionMatchConfidence" NOT NULL,
  "score" DOUBLE PRECISION NOT NULL,
  "match_reasons" JSONB NOT NULL,
  "normalized_nutrition" JSONB NOT NULL,
  "status" "NutritionCandidateStatus" NOT NULL DEFAULT 'CANDIDATE',
  "confirmation_snapshot" JSONB,
  "confirmed_by" TEXT,
  "confirmed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ingredient_nutrition_candidate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supplement_nutrition_draft" (
  "id" TEXT NOT NULL,
  "ingredient_id" TEXT NOT NULL,
  "source_record_id" TEXT,
  "image_url" TEXT NOT NULL,
  "image_key" VARCHAR(300) NOT NULL,
  "ocr_text" TEXT,
  "ai_extraction" JSONB NOT NULL,
  "normalized_nutrition" JSONB,
  "missing_fields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" "SupplementNutritionDraftStatus" NOT NULL DEFAULT 'DRAFT',
  "created_by" TEXT,
  "confirmed_by" TEXT,
  "confirmed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "supplement_nutrition_draft_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "nutrition_source_record_source_type_source_key_key"
  ON "nutrition_source_record"("source_type", "source_key");

CREATE INDEX "nutrition_source_record_source_type_idx"
  ON "nutrition_source_record"("source_type");

CREATE INDEX "nutrition_source_record_food_name_idx"
  ON "nutrition_source_record"("food_name");

CREATE INDEX "nutrition_source_record_status_idx"
  ON "nutrition_source_record"("status");

CREATE UNIQUE INDEX "ingredient_nutrition_candidate_ingredient_id_source_record_id_key"
  ON "ingredient_nutrition_candidate"("ingredient_id", "source_record_id");

CREATE INDEX "ingredient_nutrition_candidate_ingredient_id_idx"
  ON "ingredient_nutrition_candidate"("ingredient_id");

CREATE INDEX "ingredient_nutrition_candidate_source_record_id_idx"
  ON "ingredient_nutrition_candidate"("source_record_id");

CREATE INDEX "ingredient_nutrition_candidate_status_idx"
  ON "ingredient_nutrition_candidate"("status");

CREATE INDEX "ingredient_nutrition_candidate_confidence_idx"
  ON "ingredient_nutrition_candidate"("confidence");

CREATE INDEX "supplement_nutrition_draft_ingredient_id_idx"
  ON "supplement_nutrition_draft"("ingredient_id");

CREATE INDEX "supplement_nutrition_draft_source_record_id_idx"
  ON "supplement_nutrition_draft"("source_record_id");

CREATE INDEX "supplement_nutrition_draft_status_idx"
  ON "supplement_nutrition_draft"("status");

ALTER TABLE "ingredient_nutrition_candidate"
  ADD CONSTRAINT "ingredient_nutrition_candidate_ingredient_id_fkey"
  FOREIGN KEY ("ingredient_id") REFERENCES "ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ingredient_nutrition_candidate"
  ADD CONSTRAINT "ingredient_nutrition_candidate_source_record_id_fkey"
  FOREIGN KEY ("source_record_id") REFERENCES "nutrition_source_record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supplement_nutrition_draft"
  ADD CONSTRAINT "supplement_nutrition_draft_ingredient_id_fkey"
  FOREIGN KEY ("ingredient_id") REFERENCES "ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supplement_nutrition_draft"
  ADD CONSTRAINT "supplement_nutrition_draft_source_record_id_fkey"
  FOREIGN KEY ("source_record_id") REFERENCES "nutrition_source_record"("id") ON DELETE SET NULL ON UPDATE CASCADE;
