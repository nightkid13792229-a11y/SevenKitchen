-- 给「建档时已经有采购价、但没有价格流水」的采购商品补一条初始价记录（2026-11-08）
--
-- 背景：AI 添加原料的提交事务直接建 procurement_sku，漏了
-- procurement_sku_price_history 的初始价那条；手工新增 SKU 的路径会写。
-- 结果是这类原料的 SKU 卡片「价格历史」是空表，看不出 9.99 元/袋
-- 这条初始价是什么时候、以什么方式定的。
--
-- 只补「一条流水都没有、且当前采购价不为空」的 SKU；
-- 时间用 SKU 的建档时间，note 写清楚是补记的，避免和真实调价混淆。

INSERT INTO "procurement_sku_price_history" (
  "id", "procurement_sku_id", "ingredient_id", "old_price", "new_price",
  "source", "note", "created_at"
)
SELECT
  gen_random_uuid()::text,
  s."id",
  s."ingredient_id",
  NULL,
  s."current_purchase_price",
  'MANUAL',
  '2026-11-08 补记：建档时初始采购价（此前未写流水）',
  s."created_at"
FROM "procurement_sku" s
WHERE s."current_purchase_price" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "procurement_sku_price_history" h
    WHERE h."procurement_sku_id" = s."id"
  );
