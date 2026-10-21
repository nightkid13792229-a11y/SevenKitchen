-- 2026-10-22: 修正上一版迁移写错的营养档案 id。
-- 纤维素粉的 nutrition_food.id 是 2209f737-d953-4134-be4d-69ea8b682c0e；
-- 25fad765... 是 ingredient.id，不是 nutrition_food.id。
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
WHERE id = '2209f737-d953-4134-be4d-69ea8b682c0e'
  AND nutrition_data->'macros'->>'fiber' IS NULL;
