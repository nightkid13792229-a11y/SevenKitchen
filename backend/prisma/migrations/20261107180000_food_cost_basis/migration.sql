-- 食材成本口径归位（2026-11-07）
--
-- 背景：食材的「采购口径」（采购单位 / 换算 / 单价）一直有两份 ——
-- 一份挂在标准原料档案上，一份挂在采购商品上。算价只读档案那份，
-- 采购只读商品那份，而档案那份在后台**没有任何编辑入口**，
-- AI 建档时被强制写成 g / 1 / 0。结果：新建的食材原料成本恒为 0，
-- 一旦进入食谱，成本按 0 算，售价跟着偏低，且不报错、不提示。
--
-- 本次把档案那份收成**一个数**：每基准单位成本（元/g，毫升类 元/ml）。
-- 做法是令换算恒为 1，于是 `current_price_per_purchase_unit` 本身就是
-- 每基准单位成本；折算前后 `价 ÷ 换算` 完全相等，所以已发布食谱成本不变。
--
-- 折算先备份，出问题可以原样回填：
--   UPDATE ingredient i
--   SET current_price_per_purchase_unit = b.current_price_per_purchase_unit,
--       purchase_to_base_ratio = b.purchase_to_base_ratio,
--       purchase_unit = b.purchase_unit
--   FROM ingredient_food_cost_backup_20261107 b WHERE i.id = b.id;
--
-- 回滚到旧代码：代码回滚即可（旧代码不读新表），再按上面的 UPDATE 回填两列。

-- ① 备份（只备份食材：补剂与包材的采购口径不变）
CREATE TABLE IF NOT EXISTS "ingredient_food_cost_backup_20261107" AS
SELECT
  i."id",
  i."current_price_per_purchase_unit",
  i."purchase_to_base_ratio",
  i."purchase_unit",
  NOW() AS "backed_up_at"
FROM "ingredient" i
WHERE i."type" = 'FOOD';

ALTER TABLE "ingredient_food_cost_backup_20261107"
  ADD CONSTRAINT "ingredient_food_cost_backup_20261107_pkey" PRIMARY KEY ("id");

-- ② 成本流水表
CREATE TYPE "IngredientPriceHistorySource" AS ENUM ('INIT_FROM_SKU', 'REIMBURSEMENT', 'MANUAL', 'MIGRATION');

CREATE TABLE "ingredient_price_history" (
  "id" VARCHAR(36) NOT NULL,
  "ingredient_id" VARCHAR(36) NOT NULL,
  "old_cost_per_base_unit" DECIMAL(14,6),
  "new_cost_per_base_unit" DECIMAL(14,6) NOT NULL,
  "source" "IngredientPriceHistorySource" NOT NULL,
  "procurement_sku_id" VARCHAR(36),
  "reimbursement_id" VARCHAR(36),
  "purchase_record_id" VARCHAR(36),
  "operator_id" VARCHAR(36),
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ingredient_price_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ingredient_price_history_ingredient_id_created_at_idx"
  ON "ingredient_price_history"("ingredient_id", "created_at");
CREATE INDEX "ingredient_price_history_source_idx"
  ON "ingredient_price_history"("source");

ALTER TABLE "ingredient_price_history"
  ADD CONSTRAINT "ingredient_price_history_ingredient_id_fkey"
  FOREIGN KEY ("ingredient_id") REFERENCES "ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ingredient_price_history"
  ADD CONSTRAINT "ingredient_price_history_operator_id_fkey"
  FOREIGN KEY ("operator_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ③ 折算：旧成本 ÷ 旧换算 → 新成本；换算归 1，采购单位回填基准单位展示名
UPDATE "ingredient"
SET
  "current_price_per_purchase_unit" =
    ROUND(("current_price_per_purchase_unit" / "purchase_to_base_ratio")::numeric, 6),
  "purchase_to_base_ratio" = 1,
  "purchase_unit" = COALESCE(NULLIF("unit_display_label", ''), LOWER("base_unit"::text))
WHERE "type" = 'FOOD'
  AND "purchase_to_base_ratio" IS DISTINCT FROM 1;

-- ④ 留痕：每一次折算都记一条 MIGRATION 流水，日后解释得清
INSERT INTO "ingredient_price_history" (
  "id", "ingredient_id", "old_cost_per_base_unit", "new_cost_per_base_unit",
  "source", "note", "created_at"
)
SELECT
  gen_random_uuid()::text,
  b."id",
  ROUND((b."current_price_per_purchase_unit" / b."purchase_to_base_ratio")::numeric, 6),
  i."current_price_per_purchase_unit",
  'MIGRATION',
  '2026-11-07 口径归位折算：每采购单位价 → 每基准单位成本，换算归 1',
  NOW()
FROM "ingredient_food_cost_backup_20261107" b
JOIN "ingredient" i ON i."id" = b."id"
WHERE b."purchase_to_base_ratio" IS DISTINCT FROM 1;
