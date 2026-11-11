-- 2026-11-11 采购商品的「包装层级」落库
--
-- 背景：规格链（一箱 = 10 捆 × 500 克）以前只活在页面和 AI 草稿里，
-- 保存时被折叠成一个 purchase_to_base_ratio，中间层从此消失。
-- 后台编辑只能手拍一个倍数，和单位、规格文本三者互不校验。
--
-- 这次把层级存下来：
--   { "links": [{"count":10,"unit":"捆"}], "amount": 500, "amountUnit": "G",
--     "amountLabel": "克", "printedText": "10捆×500g" }
--
-- `amount` 恒为原料基准单位（克/毫升/个）；倍数 = links 连乘 × amount，
-- 由服务端派生后写回 purchase_to_base_ratio，任何接口不得单独改倍数。
--
-- 回填是**无损**的：老商品写成「只有末层」（links 为空、amount = 原倍数），
-- 倍数、金额、库存一律不变，只是从此可以在后台按层编辑。

ALTER TABLE "procurement_sku" ADD COLUMN IF NOT EXISTS "packaging" JSONB;

UPDATE "procurement_sku" s
SET "packaging" = jsonb_build_object(
  'links', '[]'::jsonb,
  'amount', s."purchase_to_base_ratio",
  'amountUnit', i."base_unit"::text,
  'printedText', s."product_model"
)
FROM "ingredient" i
WHERE i."id" = s."ingredient_id"
  AND s."packaging" IS NULL
  AND s."purchase_to_base_ratio" > 0;
