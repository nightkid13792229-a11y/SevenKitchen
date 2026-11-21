-- 补剂草稿式建档（2026-11-21）：AI 先起草、人审核，最终写入前零正式原料记录
CREATE TYPE "SupplementCreationDraftStatus" AS ENUM ('DRAFT', 'FINALIZED', 'DISCARDED');

CREATE TABLE "supplement_creation_draft" (
  "id" TEXT NOT NULL,
  "created_by" TEXT NOT NULL,
  "status" "SupplementCreationDraftStatus" NOT NULL DEFAULT 'DRAFT',
  "schema_version" INTEGER NOT NULL DEFAULT 1,
  "name" VARCHAR(200) NOT NULL DEFAULT '',
  "payload" JSONB NOT NULL,
  "ai_snapshot" JSONB,
  "manual_fields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "verification" JSONB,
  "finalized_ingredient_id" TEXT,
  "finalized_nutrition_food_id" TEXT,
  "finalized_evidence_id" TEXT,
  "finalized_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "supplement_creation_draft_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "supplement_creation_draft_created_by_status_updated_at_idx"
  ON "supplement_creation_draft" ("created_by", "status", "updated_at");
CREATE INDEX "supplement_creation_draft_status_updated_at_idx"
  ON "supplement_creation_draft" ("status", "updated_at");

-- 证据表每份量改小数：粉/液体每份 0.9 g / 2.5 ml，整数列会截断
ALTER TABLE "supplement_label_evidence"
  ALTER COLUMN "serving_units_per_dose" TYPE DOUBLE PRECISION
  USING "serving_units_per_dose"::DOUBLE PRECISION;
