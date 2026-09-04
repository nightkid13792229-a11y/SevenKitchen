-- Web 食谱设计器：发布配方时记录当时设计系列的参考爱犬（历史记录，用于后台按爱犬搜索）
-- 1. recipe 增加 reference_dog_id（可选，仅作历史记录，不绑定食谱与犬）
-- 2. 回填历史数据：已发布配方沿用其所属系列当前的参考爱犬（历史换犬无法追溯，尽力回填）

ALTER TABLE "recipe"
ADD COLUMN IF NOT EXISTS "reference_dog_id" TEXT;

CREATE INDEX IF NOT EXISTS "recipe_reference_dog_id_idx"
  ON "recipe"("reference_dog_id");

UPDATE "recipe"
SET "reference_dog_id" = rs."reference_dog_id"
FROM "recipe_series" rs
WHERE "recipe"."series_id" = rs."id"
  AND "recipe"."reference_dog_id" IS NULL
  AND rs."reference_dog_id" IS NOT NULL;
