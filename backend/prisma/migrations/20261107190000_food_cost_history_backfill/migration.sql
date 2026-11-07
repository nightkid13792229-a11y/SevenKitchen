-- 为「本来就有价、但迁移时没有流水」的食材补一条起始记录（2026-11-07）
--
-- 背景：上一个迁移只给「换算 ≠ 1、需要折算」的食材写了流水。
-- 但生产上绝大多数食材的换算早就是 1（11-06 之后由采购报销刷出来的价），
-- 它们一条流水都没有 —— 后台成本卡会显示「每克 0.0798 元 · 来源：未定价」，
-- 自相矛盾，也没法解释这个价是哪来的。
--
-- 这里补一条 MIGRATION 记录：来源写成「历史数据折算」，
-- 老成本留空（不知道上一次是多少），note 里写清楚是补记的。

INSERT INTO "ingredient_price_history" (
  "id", "ingredient_id", "old_cost_per_base_unit", "new_cost_per_base_unit",
  "source", "note", "created_at"
)
SELECT
  gen_random_uuid()::text,
  i."id",
  NULL,
  i."current_price_per_purchase_unit",
  'MIGRATION',
  '2026-11-07 口径归位：这条原料在改造前已有价格，补记起始记录（来源未知）',
  NOW()
FROM "ingredient" i
WHERE i."type" = 'FOOD'
  AND i."current_price_per_purchase_unit" > 0
  AND NOT EXISTS (
    SELECT 1 FROM "ingredient_price_history" h WHERE h."ingredient_id" = i."id"
  );
