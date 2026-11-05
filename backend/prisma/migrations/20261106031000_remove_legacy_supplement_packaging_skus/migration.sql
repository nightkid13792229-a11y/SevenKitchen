-- 清掉补剂 / 包材的「遗留采购商品副本」（2026-11-06「单一来源」改造 · 阶段 E）
--
-- 背景：补剂和包材**没有采购商品这一层** —— 它们的标准原料就是采购商品
-- （一瓶 120 粒就是那一瓶，采购单位直接是瓶 / 罐 / 卷）。
--
-- 但 2026-04-14 ~ 04-23 期间一次性建了 35 条副本（补剂 25 + 包材 10）：
--   · created_source 为空（不是任何正常流程建的）
--   · 名称就是原料全名，价格与换算比和原料档案一模一样
--   · 全部 is_active = false
--   · 0 条采购记录引用
--
-- 它们不参与任何计算（取价只取启用的），留着只会让人误以为补剂也有 SKU 层
-- —— 2026-11-06 的排查就被它们误导过一次。
--
-- 安全条件全部满足才删：停用 + 无来源 + 没有任何采购记录引用。

DELETE FROM "procurement_sku" ps
USING "ingredient" i
WHERE ps."ingredient_id" = i."id"
  AND i."type" IN ('SUPPLEMENT', 'PACKAGING')
  AND ps."is_active" = false
  AND ps."created_source" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "purchase_record" pr WHERE pr."procurement_sku_id" = ps."id"
  );
