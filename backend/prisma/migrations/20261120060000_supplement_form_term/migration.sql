-- 补剂形态词典：不同写法归一 + 人工确认
CREATE TABLE IF NOT EXISTS "supplement_form_term" (
  "id" TEXT NOT NULL,
  "dimension" VARCHAR(16) NOT NULL,
  "canonical_key" VARCHAR(120) NOT NULL,
  "label_zh" VARCHAR(120),
  "label_en" VARCHAR(120),
  "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "nutrient_keys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" VARCHAR(16) NOT NULL DEFAULT 'AUTO',
  "source" VARCHAR(16) NOT NULL DEFAULT 'MARKET',
  "reviewed_by" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplement_form_term_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "supplement_form_term_dimension_canonical_key_key"
  ON "supplement_form_term" ("dimension", "canonical_key");
CREATE INDEX IF NOT EXISTS "supplement_form_term_status_idx"
  ON "supplement_form_term" ("status");
