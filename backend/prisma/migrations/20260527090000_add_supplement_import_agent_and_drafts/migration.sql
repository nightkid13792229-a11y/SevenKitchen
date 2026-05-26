CREATE TYPE "AgentType" AS ENUM ('SUPPLEMENT_IMPORT');
CREATE TYPE "AgentProvider" AS ENUM ('OPENAI_COMPATIBLE');
CREATE TYPE "SupplementImportDraftStatus" AS ENUM (
  'CREATED',
  'IMAGE_RISK_DETECTED',
  'RECOGNIZING',
  'NEEDS_REVIEW',
  'READY_TO_CONFIRM',
  'CONFIRMED',
  'FAILED',
  'CANCELLED'
);

CREATE TABLE "agent_config" (
  "id" TEXT NOT NULL,
  "agent_type" "AgentType" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "provider" "AgentProvider" NOT NULL DEFAULT 'OPENAI_COMPATIBLE',
  "base_url" VARCHAR(500),
  "api_key_encrypted" TEXT,
  "vision_model" VARCHAR(120),
  "text_model" VARCHAR(120),
  "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
  "timeout_ms" INTEGER NOT NULL DEFAULT 30000,
  "max_retries" INTEGER NOT NULL DEFAULT 1,
  "prompt_version" VARCHAR(80) NOT NULL DEFAULT 'supplement-import-v1',
  "schema_version" VARCHAR(80) NOT NULL DEFAULT 'supplement-import-schema-v1',
  "last_test_status" VARCHAR(20),
  "last_test_message" TEXT,
  "updated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agent_config_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_config_agent_type_key" ON "agent_config"("agent_type");

CREATE TABLE "supplement_import_draft" (
  "id" TEXT NOT NULL,
  "status" "SupplementImportDraftStatus" NOT NULL DEFAULT 'CREATED',
  "image_urls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "risk_flags" JSONB NOT NULL DEFAULT '[]',
  "raw_ocr_text" TEXT,
  "ai_extracted_data" JSONB,
  "normalized_draft" JSONB,
  "duplicate_candidates" JSONB NOT NULL DEFAULT '[]',
  "validation_errors" JSONB NOT NULL DEFAULT '[]',
  "agent_config_snapshot" JSONB,
  "model_usage" JSONB,
  "confirmed_ingredient_id" TEXT,
  "confirmed_by" TEXT,
  "confirmed_at" TIMESTAMP(3),
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "supplement_import_draft_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "supplement_import_draft_status_idx" ON "supplement_import_draft"("status");
CREATE INDEX "supplement_import_draft_created_by_idx" ON "supplement_import_draft"("created_by");
CREATE INDEX "supplement_import_draft_confirmed_ingredient_id_idx" ON "supplement_import_draft"("confirmed_ingredient_id");
CREATE INDEX "supplement_import_draft_created_at_idx" ON "supplement_import_draft"("created_at");
