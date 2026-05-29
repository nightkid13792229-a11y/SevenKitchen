ALTER TABLE "nutrition_food"
ADD COLUMN IF NOT EXISTS "display_name_zh" VARCHAR(200),
ADD COLUMN IF NOT EXISTS "display_name_zh_source" VARCHAR(50),
ADD COLUMN IF NOT EXISTS "display_name_zh_reviewed_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "display_name_zh_reviewed_by" TEXT;

CREATE INDEX IF NOT EXISTS "nutrition_food_display_name_zh_idx"
ON "nutrition_food"("display_name_zh");
