-- 价格字段精度：2 位小数 → 6 位小数（2026-11-04）
--
-- 背景：
--   算价按「元/克（元/ml、元/个）」计算，而 115 个原料的采购单位就是 g
--   （purchase_to_base_ratio = 1），档案里存的就是每克单价。
--   2 位小数只能表达 0.01 元/克 = 10 元/公斤，于是：
--     糙米 0.01499 → 0.01（少算 33%）
--     鸡胸 0.015346 → 0.02（多算 30%）
--     很便宜的原料 → 0.00（直接变免费）
--   本次把两个价格字段扩到 6 位，并按「当前算价口径」回填，
--   让后台档案、采购预估、成品算价用同一个数。
--
-- 口径（与 IngredientPriceBasisService 一致）：
--   最近一次已完成采购价（与创建价相差 5 倍以上则跳过）
--   → 创建价 → 商品参考价（启用 SKU 中位价 × 换算比例）→ 当前价。
--
-- 只回填 FOOD：补剂商城的零售价另有一套口径，本次不动。
-- 预期：顾客端食谱价格不变（算价引擎本来就用 6 位小数在算）。
--
-- 改价单（ingredient_price_change）的价格字段一并扩到 6 位：
-- 否则下次报销审批回写时，6 位价格又会被 2 位字段截断，
-- 刚修好的精度会被下一次采购悄悄抹掉。

ALTER TABLE ingredient
  ALTER COLUMN current_price_per_purchase_unit TYPE numeric(14, 6),
  ALTER COLUMN effective_price_per_purchase_unit TYPE numeric(14, 6);

ALTER TABLE ingredient_price_change
  ALTER COLUMN source_price_per_purchase_unit TYPE numeric(14, 6),
  ALTER COLUMN previous_current_price_per_purchase_unit TYPE numeric(14, 6),
  ALTER COLUMN previous_effective_price TYPE numeric(14, 6),
  ALTER COLUMN proposed_effective_price TYPE numeric(14, 6),
  ALTER COLUMN applied_current_price_per_purchase_unit TYPE numeric(14, 6),
  ALTER COLUMN applied_effective_price_per_purchase_unit TYPE numeric(14, 6);

WITH latest AS (
  SELECT DISTINCT ON (pr.ingredient_id)
    pr.ingredient_id,
    pr.actual_cost::numeric AS cost,
    pr.actual_base_quantity::numeric AS base_qty,
    pr.actual_quantity::numeric AS qty
  FROM purchase_record pr
  JOIN purchase_list pl ON pl.id = pr.purchase_list_id
  WHERE pl.status = 'COMPLETED'
  ORDER BY pr.ingredient_id, pr.purchased_at DESC, pr.created_at DESC
),
sku AS (
  SELECT
    s.ingredient_id,
    percentile_cont(0.5) WITHIN GROUP (
      ORDER BY s.current_purchase_price / NULLIF(s.purchase_to_base_ratio, 0)
    )::numeric AS unit_cost
  FROM procurement_sku s
  WHERE s.is_active = true
    AND s.purchase_to_base_ratio > 0
    AND s.current_purchase_price > 0
  GROUP BY s.ingredient_id
),
calc AS (
  SELECT
    i.id,
    CASE
      WHEN i.purchase_to_base_ratio > 0 THEN i.purchase_to_base_ratio::numeric
      ELSE 1
    END AS ratio,
    COALESCE(i.initial_price_per_purchase_unit, 0)::numeric AS init,
    i.current_price_per_purchase_unit::numeric AS cur,
    COALESCE(sku.unit_cost, 0) AS sku_unit,
    l.cost,
    l.base_qty,
    l.qty
  FROM ingredient i
  LEFT JOIN latest l ON l.ingredient_id = i.id
  LEFT JOIN sku ON sku.ingredient_id = i.id
  WHERE i.type = 'FOOD'
),
basis AS (
  SELECT
    *,
    COALESCE(NULLIF(base_qty, 0), qty * ratio) AS base,
    ROUND(sku_unit * ratio, 6) AS sku_ref,
    CASE
      WHEN init > 0 THEN init
      WHEN ROUND(sku_unit * ratio, 6) > 0 THEN ROUND(sku_unit * ratio, 6)
      ELSE cur
    END AS ref
  FROM calc
),
final AS (
  SELECT
    *,
    CASE
      WHEN cost > 0 AND base > 0 THEN ROUND(cost / base * ratio, 6)
    END AS from_purchase
  FROM basis
),
picked AS (
  SELECT
    id,
    CASE
      WHEN from_purchase IS NOT NULL
        AND (ref <= 0 OR (from_purchase BETWEEN ref / 5 AND ref * 5))
        THEN from_purchase
      WHEN init > 0 THEN ROUND(init, 6)
      WHEN sku_ref > 0 THEN sku_ref
      WHEN cur > 0 THEN ROUND(cur, 6)
      ELSE 0
    END AS price
  FROM final
)
UPDATE ingredient i
SET
  current_price_per_purchase_unit = p.price,
  effective_price_per_purchase_unit = p.price,
  updated_at = CURRENT_TIMESTAMP
FROM picked p
WHERE i.id = p.id
  AND (
    i.current_price_per_purchase_unit IS DISTINCT FROM p.price
    OR i.effective_price_per_purchase_unit IS DISTINCT FROM p.price
  );
