CREATE TYPE "IngredientCreationJobStatus" AS ENUM (
  'DRAFTING',
  'SEARCHING_SOURCES',
  'WAITING_USER',
  'BUILDING_REPORT',
  'READY_FOR_REVIEW',
  'CONFIRMED',
  'FAILED',
  'CANCELED'
);

CREATE TYPE "IngredientCreationMessageRole" AS ENUM (
  'USER',
  'AGENT',
  'PROGRESS',
  'QUESTION',
  'SYSTEM'
);

CREATE TYPE "IngredientCreationDraftStatus" AS ENUM (
  'DRAFT',
  'READY_FOR_REVIEW',
  'CONFIRMED',
  'REJECTED'
);

CREATE TYPE "IngredientCreationDraftProfileRole" AS ENUM (
  'PRIMARY',
  'SECONDARY'
);

CREATE TABLE "ingredient_creation_job" (
  "id" TEXT NOT NULL,
  "created_by" TEXT NOT NULL,
  "status" "IngredientCreationJobStatus" NOT NULL DEFAULT 'DRAFTING',
  "request_text" TEXT NOT NULL,
  "current_stage" VARCHAR(100),
  "progress" INTEGER NOT NULL DEFAULT 0,
  "waiting_question" TEXT,
  "error_message" TEXT,
  "agent_provider" VARCHAR(80),
  "agent_model" VARCHAR(120),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "ingredient_creation_job_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ingredient_creation_message" (
  "id" TEXT NOT NULL,
  "job_id" TEXT NOT NULL,
  "role" "IngredientCreationMessageRole" NOT NULL,
  "content" TEXT NOT NULL,
  "payload" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ingredient_creation_message_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ingredient_creation_draft" (
  "id" TEXT NOT NULL,
  "job_id" TEXT NOT NULL,
  "status" "IngredientCreationDraftStatus" NOT NULL DEFAULT 'DRAFT',
  "suggested_name" VARCHAR(120) NOT NULL,
  "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "type" "IngredientType" NOT NULL DEFAULT 'FOOD',
  "base_unit" "BaseUnit" NOT NULL DEFAULT 'G',
  "unit_display_label" VARCHAR(50),
  "procurement_strategy" "IngredientProcurementStrategy" NOT NULL DEFAULT 'DAILY_PURCHASE',
  "diy_enabled" BOOLEAN NOT NULL DEFAULT true,
  "procurement_enabled" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "agent_summary" TEXT,
  "review_report" JSONB,
  "confirmed_ingredient_id" TEXT,
  "confirmed_by" TEXT,
  "confirmed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ingredient_creation_draft_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ingredient_creation_draft_profile" (
  "id" TEXT NOT NULL,
  "draft_id" TEXT NOT NULL,
  "role" "IngredientCreationDraftProfileRole" NOT NULL,
  "source_record_id" TEXT,
  "source_type" "NutritionGovernanceSourceType",
  "source_key" VARCHAR(200),
  "source_food_name" VARCHAR(300) NOT NULL,
  "source_food_name_en" VARCHAR(300),
  "suggested_display_name_zh" VARCHAR(200),
  "preparation_state" VARCHAR(50),
  "preparation_state_label" VARCHAR(100),
  "edible_portion_label" VARCHAR(100),
  "processing_label" VARCHAR(100),
  "nutrition_data" JSONB NOT NULL,
  "completeness_summary" JSONB NOT NULL,
  "field_source_summary" JSONB,
  "supplement_risk_summary" JSONB,
  "agent_rationale" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ingredient_creation_draft_profile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ingredient_creation_draft_job_id_key" ON "ingredient_creation_draft"("job_id");
CREATE INDEX "ingredient_creation_job_created_by_idx" ON "ingredient_creation_job"("created_by");
CREATE INDEX "ingredient_creation_job_status_idx" ON "ingredient_creation_job"("status");
CREATE INDEX "ingredient_creation_job_created_at_idx" ON "ingredient_creation_job"("created_at");
CREATE INDEX "ingredient_creation_message_job_id_idx" ON "ingredient_creation_message"("job_id");
CREATE INDEX "ingredient_creation_message_role_idx" ON "ingredient_creation_message"("role");
CREATE INDEX "ingredient_creation_message_created_at_idx" ON "ingredient_creation_message"("created_at");
CREATE INDEX "ingredient_creation_draft_status_idx" ON "ingredient_creation_draft"("status");
CREATE INDEX "ingredient_creation_draft_suggested_name_idx" ON "ingredient_creation_draft"("suggested_name");
CREATE INDEX "ingredient_creation_draft_confirmed_ingredient_id_idx" ON "ingredient_creation_draft"("confirmed_ingredient_id");
CREATE INDEX "ingredient_creation_draft_profile_draft_id_idx" ON "ingredient_creation_draft_profile"("draft_id");
CREATE INDEX "ingredient_creation_draft_profile_source_record_id_idx" ON "ingredient_creation_draft_profile"("source_record_id");
CREATE INDEX "ingredient_creation_draft_profile_source_type_idx" ON "ingredient_creation_draft_profile"("source_type");
CREATE INDEX "ingredient_creation_draft_profile_role_idx" ON "ingredient_creation_draft_profile"("role");

ALTER TABLE "ingredient_creation_message"
  ADD CONSTRAINT "ingredient_creation_message_job_id_fkey"
  FOREIGN KEY ("job_id") REFERENCES "ingredient_creation_job"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ingredient_creation_draft"
  ADD CONSTRAINT "ingredient_creation_draft_job_id_fkey"
  FOREIGN KEY ("job_id") REFERENCES "ingredient_creation_job"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ingredient_creation_draft_profile"
  ADD CONSTRAINT "ingredient_creation_draft_profile_draft_id_fkey"
  FOREIGN KEY ("draft_id") REFERENCES "ingredient_creation_draft"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ingredient_creation_draft_profile"
  ADD CONSTRAINT "ingredient_creation_draft_profile_source_record_id_fkey"
  FOREIGN KEY ("source_record_id") REFERENCES "nutrition_source_record"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
