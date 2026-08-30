-- Web 食谱设计器：爱犬信息指导板块配套字段
-- 1. dog 增加 preferred_foods（喜欢吃的食材，文本，与 allergy_foods / picky_foods 同风格）
-- 2. recipe_series 增加 reference_dog_id（内部设计系列的可选参考爱犬，仅用于设计辅助，不绑定食谱）

ALTER TABLE "dog"
ADD COLUMN IF NOT EXISTS "preferred_foods" VARCHAR(500);

ALTER TABLE "recipe_series"
ADD COLUMN IF NOT EXISTS "reference_dog_id" TEXT;

CREATE INDEX IF NOT EXISTS "recipe_series_reference_dog_id_idx"
  ON "recipe_series"("reference_dog_id");
