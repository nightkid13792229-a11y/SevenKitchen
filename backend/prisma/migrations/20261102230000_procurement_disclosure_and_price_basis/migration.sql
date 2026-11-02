-- 1) 原料「创建时采购单价」：无采购历史时的算价兜底
--
-- 精度用 6 位：很多原料的采购单位就是 1g（purchase_to_base_ratio = 1），
-- 单价只有 0.0037 这种量级，2 位小数会被抹成 0。
ALTER TABLE "ingredient" ADD COLUMN "initial_price_per_purchase_unit" DECIMAL(14,6);

-- 回填口径（只针对存量数据）：
--   用「迁移前正在使用的算价口径」钉一个基准价：来源等级优先 MARKET_PREMIUM →
--   ORGANIC → WHOLESALE，同档里取单价最高的采购商品，再折算到原料的采购单位。
--   这样上线当天售价不会因为算价口径切换而跳动；之后由采购记录自然接管。
--   没有可用商品（补剂 / 未维护 SKU）→ 用当前价；仍为 0 就留 0，由后台提示补录。
UPDATE "ingredient" i
SET "initial_price_per_purchase_unit" = COALESCE(
  (
    SELECT ROUND(
      (s."current_purchase_price" / s."purchase_to_base_ratio" * i."purchase_to_base_ratio")::numeric,
      6
    )
    FROM "procurement_sku" s
    WHERE s."ingredient_id" = i."id"
      AND s."is_active" = true
      AND s."source_tier" IS NOT NULL
      AND s."current_purchase_price" > 0
      AND s."purchase_to_base_ratio" > 0
    ORDER BY
      CASE s."source_tier"
        WHEN 'MARKET_PREMIUM' THEN 0
        WHEN 'ORGANIC' THEN 1
        ELSE 2
      END,
      (s."current_purchase_price" / s."purchase_to_base_ratio") DESC
    LIMIT 1
  ),
  NULLIF(i."current_price_per_purchase_unit", 0),
  0
);

-- 2) 来源方案下线：采购 SKU 的来源等级
DROP INDEX IF EXISTS "procurement_sku_source_tier_idx";
ALTER TABLE "procurement_sku" DROP COLUMN IF EXISTS "source_tier";
DROP TYPE IF EXISTS "ProcurementSkuSourceTier";

-- 3) 订单条目不再记录采购方案
ALTER TABLE "order_item" DROP COLUMN IF EXISTS "ingredient_source_plan";
