-- 删掉两个已废弃的原料价格列（2026-11-06「单一来源」改造 · 阶段 C）
--
-- 背景：改造前原料有三个价格字段（当前价 / 生效价 / 创建价）。
-- 阶段 A/B 之后：
--   · 生效价与当前价全库 170/170 完全相同 → 生效价只是当前价的副本
--   · 创建价退出算价，防呆基准改用「历史采购价中位数」→ 没有任何读者
--
-- 删列先备份，出问题可以直接回填：
--   UPDATE ingredient i
--   SET current_price_per_purchase_unit = b.current_price_per_purchase_unit
--   FROM ingredient_price_backup_20261106 b WHERE i.id = b.id;
--
-- 回滚到旧代码时需先加列（旧代码会 select 这两列）：
--   ALTER TABLE ingredient
--     ADD COLUMN effective_price_per_purchase_unit numeric(14,6),
--     ADD COLUMN initial_price_per_purchase_unit   numeric(14,6);
--   然后按上面的 UPDATE 回填。

CREATE TABLE IF NOT EXISTS "ingredient_price_backup_20261106" AS
SELECT
  i."id",
  i."current_price_per_purchase_unit",
  i."effective_price_per_purchase_unit",
  i."initial_price_per_purchase_unit",
  NOW() AS "backed_up_at"
FROM "ingredient" i;

ALTER TABLE "ingredient_price_backup_20261106"
  ADD CONSTRAINT "ingredient_price_backup_20261106_pkey" PRIMARY KEY ("id");

ALTER TABLE "ingredient"
  DROP COLUMN IF EXISTS "effective_price_per_purchase_unit",
  DROP COLUMN IF EXISTS "initial_price_per_purchase_unit";
