-- 2026-10-22: 修复补剂营养档案缺失的“每份单位”标记。
-- 现有 PER_SERVING 档案在补剂评估时若没有 servingUnitLabel/amountUnitLabel，
-- 读取器会退化为按 100g 计算；而补剂没有 100g 重量，导致整项营养被标为缺数据。
-- 按该档案绑定的采购原料显示单位补齐（粒 / 片 / 平勺 等）。

WITH supplement_units AS (
  SELECT DISTINCT ON (m.nutrition_food_id)
    m.nutrition_food_id,
    i.unit_display_label
  FROM nutrition_food_mapping m
  JOIN ingredient i ON i.id = m.ingredient_id
  WHERE i.type = 'SUPPLEMENT'
    AND NULLIF(TRIM(i.unit_display_label), '') IS NOT NULL
  ORDER BY m.nutrition_food_id, m.is_primary DESC, m.id ASC
)
UPDATE nutrition_food nf
SET nutrition_data = jsonb_set(
  jsonb_set(
    jsonb_set(
      nf.nutrition_data,
      '{meta,servingUnitLabel}',
      to_jsonb(su.unit_display_label),
      true
    ),
    '{meta,amountUnitLabel}',
    to_jsonb(su.unit_display_label),
    true
  ),
  '{meta,usageUnit}',
  to_jsonb(su.unit_display_label),
  true
)
FROM supplement_units su
WHERE nf.id = su.nutrition_food_id
  AND nf.nutrition_data->'meta'->>'rawBasisType' = 'PER_SERVING'
  AND (
    nf.nutrition_data->'meta'->>'servingUnitLabel' IS NULL
    OR nf.nutrition_data->'meta'->>'amountUnitLabel' IS NULL
    OR nf.nutrition_data->'meta'->>'usageUnit' IS NULL
  );

-- 纤维素粉：已有不可溶性纤维 1g/g，但缺少总膳食纤维，
-- 导致配方中的“膳食纤维”行永远显示缺数据。总纤维 = 可溶性 + 不可溶性。
UPDATE nutrition_food
SET nutrition_data = jsonb_set(
  nutrition_data,
  '{macros,fiber}',
  to_jsonb(
    COALESCE((nutrition_data->'macros'->>'solubleFiber')::numeric, 0)
    + COALESCE((nutrition_data->'macros'->>'insolubleFiber')::numeric, 0)
  ),
  true
)
WHERE id = '25fad765-c33b-4550-90e2-63c739eb763c'
  AND nutrition_data->'macros'->>'fiber' IS NULL
  AND (
    nutrition_data->'macros'->>'solubleFiber' IS NOT NULL
    OR nutrition_data->'macros'->>'insolubleFiber' IS NOT NULL
  );
