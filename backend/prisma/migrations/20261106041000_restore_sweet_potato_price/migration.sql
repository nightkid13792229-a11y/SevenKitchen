-- 修复「红薯」被误写成 0 元（2026-11-06）
--
-- 事故：2026-11-06 01:31:32，后台一次「原料保存」把红薯的当前价写成了 0。
--   · 同时段全库只有这一条原料被保存 → 单次编辑，不是批处理
--   · 没有对应的调价记录 → 不是采购报销链路写的，是编辑表单直接写档案价
--   · 原料编辑没有操作人留痕，查不到是谁点的
--
-- 正确值取「最后一次被批准的价格变更」的生效值（2026-11-01，¥0.02/g），
-- 与近期采购记录（¥0.0118~0.0171/g）同一量级。
--
-- 只在「当前仍是 0」时修复，绝不覆盖之后的人工改价。

UPDATE "ingredient" i
SET "current_price_per_purchase_unit" = src."applied_current_price_per_purchase_unit",
    "updated_at" = NOW()
FROM (
  SELECT DISTINCT ON ("ingredient_id")
    "ingredient_id",
    "applied_current_price_per_purchase_unit"
  FROM "ingredient_price_change"
  WHERE "status" = 'APPROVED'
    AND "applied_current_price_per_purchase_unit" IS NOT NULL
    AND "applied_current_price_per_purchase_unit" > 0
  ORDER BY "ingredient_id", "reviewed_at" DESC NULLS LAST, "created_at" DESC
) src
WHERE i."id" = src."ingredient_id"
  AND i."name" = '红薯'
  AND i."current_price_per_purchase_unit" <= 0;
