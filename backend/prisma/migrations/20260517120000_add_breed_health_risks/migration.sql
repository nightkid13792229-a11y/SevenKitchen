CREATE TYPE "BreedHealthAttentionPriority" AS ENUM (
  'KEY_ATTENTION',
  'RECOMMENDED_AWARENESS',
  'SUPPLEMENTAL_AWARENESS'
);

CREATE TYPE "BreedHealthRiskSourceType" AS ENUM (
  'CIDD',
  'OFA_CHIC',
  'OMIA',
  'WSAVA',
  'VETERINARY_LITERATURE',
  'BREED_CLUB',
  'OTHER'
);

CREATE TABLE "breed_health_condition" (
  "id" TEXT NOT NULL,
  "name_cn" VARCHAR(120) NOT NULL,
  "name_en" VARCHAR(160),
  "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "category" VARCHAR(80) NOT NULL,
  "summary" TEXT NOT NULL,
  "common_signs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "screening_advice" TEXT,
  "care_advice" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "breed_health_condition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "breed_health_risk" (
  "id" TEXT NOT NULL,
  "breed_id" TEXT NOT NULL,
  "condition_id" TEXT NOT NULL,
  "attention_priority" "BreedHealthAttentionPriority" NOT NULL,
  "one_line_summary" TEXT NOT NULL,
  "breed_specific_reason" TEXT,
  "display_order" INTEGER NOT NULL DEFAULT 0,
  "is_published" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "breed_health_risk_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "breed_health_risk_source" (
  "id" TEXT NOT NULL,
  "risk_id" TEXT NOT NULL,
  "source_type" "BreedHealthRiskSourceType" NOT NULL,
  "source_name" VARCHAR(120) NOT NULL,
  "publisher" VARCHAR(160),
  "title" VARCHAR(240) NOT NULL,
  "url" TEXT NOT NULL,
  "accessed_at" TIMESTAMP(3) NOT NULL,
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "breed_health_risk_source_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "breed_health_condition_category_idx" ON "breed_health_condition"("category");
CREATE INDEX "breed_health_condition_is_active_idx" ON "breed_health_condition"("is_active");
CREATE UNIQUE INDEX "breed_health_risk_breed_id_condition_id_key" ON "breed_health_risk"("breed_id", "condition_id");
CREATE INDEX "breed_health_risk_breed_id_is_published_display_order_idx" ON "breed_health_risk"("breed_id", "is_published", "display_order");
CREATE INDEX "breed_health_risk_condition_id_idx" ON "breed_health_risk"("condition_id");
CREATE INDEX "breed_health_risk_source_risk_id_idx" ON "breed_health_risk_source"("risk_id");
CREATE INDEX "breed_health_risk_source_source_type_idx" ON "breed_health_risk_source"("source_type");

ALTER TABLE "breed_health_risk"
ADD CONSTRAINT "breed_health_risk_breed_id_fkey"
FOREIGN KEY ("breed_id") REFERENCES "dog_breed"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "breed_health_risk"
ADD CONSTRAINT "breed_health_risk_condition_id_fkey"
FOREIGN KEY ("condition_id") REFERENCES "breed_health_condition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "breed_health_risk_source"
ADD CONSTRAINT "breed_health_risk_source_risk_id_fkey"
FOREIGN KEY ("risk_id") REFERENCES "breed_health_risk"("id") ON DELETE CASCADE ON UPDATE CASCADE;
