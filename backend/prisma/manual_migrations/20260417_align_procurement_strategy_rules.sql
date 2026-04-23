\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE procurement_strategy_rules (
  ingredient_id text PRIMARY KEY,
  expected_name text NOT NULL,
  procurement_strategy text NOT NULL
) ON COMMIT DROP;

INSERT INTO procurement_strategy_rules (
  ingredient_id,
  expected_name,
  procurement_strategy
) VALUES
  ('c0ca032c-7a96-49ba-bd6d-4bd7a15f95ee', '牛里脊', 'HYBRID'),
  ('952cc178-8ce5-4bd6-b11b-b25a6b3ce604', '牛肝', 'HYBRID'),
  ('f07026e6-0d3f-47c2-954a-917b0ac754f3', '青花鱼', 'HYBRID'),
  ('59f0ca5c-5e6e-448b-baf0-8d7e82e92750', '鸡蛋', 'HYBRID'),
  ('7dff8839-3134-48e4-b46f-f34792b7e13e', '糙米', 'STOCK_REPLENISHMENT'),
  ('ee32dc1f-17cf-4d26-ad04-626d3077836b', '燕麦', 'STOCK_REPLENISHMENT'),
  ('ffce8ced-7875-4365-b2aa-7ba9aa84fc91', '生葵花籽仁', 'STOCK_REPLENISHMENT'),
  ('99f266ff-eeee-4439-9386-ee076f509ed9', '食用盐', 'STOCK_REPLENISHMENT'),
  ('e5fd3256-a1a4-4a89-b486-6eaed63b5624', '维生素E', 'STOCK_REPLENISHMENT'),
  ('b03403f5-e1ff-4551-9b16-b0d126a50afa', '葡萄糖酸锌', 'STOCK_REPLENISHMENT'),
  ('a168de23-2687-464b-b93f-4b0bdeca496a', '碳酸钙', 'STOCK_REPLENISHMENT'),
  ('e40acd37-fe46-4082-82dd-649696810554', '海带粉', 'STOCK_REPLENISHMENT'),
  ('d3a6f6ec-3083-4d72-a06a-9baed242226c', '鱼油', 'STOCK_REPLENISHMENT'),
  ('b337ed6b-629a-4c4c-b818-45fff49b46b4', '南瓜', 'DAILY_PURCHASE'),
  ('2b2d66a5-f276-443a-b898-7d5ec6a4efb2', '绿豆芽', 'DAILY_PURCHASE'),
  ('9214e1fe-dbb5-4f13-b461-4b2bcf115469', '苹果', 'DAILY_PURCHASE');

DO $$
DECLARE
  missing_count integer;
  name_mismatch_count integer;
BEGIN
  SELECT count(*)
  INTO missing_count
  FROM procurement_strategy_rules rule
  LEFT JOIN ingredient ingredient ON ingredient.id = rule.ingredient_id
  WHERE ingredient.id IS NULL;

  IF missing_count > 0 THEN
    RAISE EXCEPTION 'Missing expected ingredients: %', (
      SELECT json_agg(rule.*)
      FROM procurement_strategy_rules rule
      LEFT JOIN ingredient ingredient ON ingredient.id = rule.ingredient_id
      WHERE ingredient.id IS NULL
    );
  END IF;

  SELECT count(*)
  INTO name_mismatch_count
  FROM procurement_strategy_rules rule
  JOIN ingredient ingredient ON ingredient.id = rule.ingredient_id
  WHERE ingredient.name IS DISTINCT FROM rule.expected_name;

  IF name_mismatch_count > 0 THEN
    RAISE EXCEPTION 'Ingredient id/name mismatch: %', (
      SELECT json_agg(json_build_object(
        'ingredient_id', rule.ingredient_id,
        'expected_name', rule.expected_name,
        'actual_name', ingredient.name
      ))
      FROM procurement_strategy_rules rule
      JOIN ingredient ingredient ON ingredient.id = rule.ingredient_id
      WHERE ingredient.name IS DISTINCT FROM rule.expected_name
    );
  END IF;
END $$;

WITH updated AS (
  UPDATE ingredient ingredient
  SET
    procurement_strategy =
      rule.procurement_strategy::"IngredientProcurementStrategy",
    updated_at = now()
  FROM procurement_strategy_rules rule
  WHERE ingredient.id = rule.ingredient_id
    AND ingredient.procurement_strategy IS DISTINCT FROM
      rule.procurement_strategy::"IngredientProcurementStrategy"
  RETURNING ingredient.id
)
SELECT 'updated_rows' AS check_name, count(*) AS check_value
FROM updated;

SELECT
  rule.expected_name,
  ingredient.id,
  ingredient.procurement_strategy
FROM procurement_strategy_rules rule
JOIN ingredient ingredient ON ingredient.id = rule.ingredient_id
ORDER BY
  CASE ingredient.procurement_strategy
    WHEN 'HYBRID' THEN 1
    WHEN 'STOCK_REPLENISHMENT' THEN 2
    ELSE 3
  END,
  rule.expected_name;

COMMIT;
