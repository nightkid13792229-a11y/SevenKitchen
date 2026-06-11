WITH target_ingredients AS (
  SELECT
    "id",
    "name",
    COALESCE(("properties" #>> '{production_loss_rate}')::double precision, 1.05) AS supplement_loss_rate,
    COALESCE(("properties" #>> '{edible_yield_rate}')::double precision, 1.0) AS edible_yield_rate,
    "nutrition_profile"
  FROM "ingredient"
  WHERE "id" IN (
    'b641d28d-107f-4a82-9fe5-fc0cefb67c0a',
    '25fad765-c33b-4550-90e2-63c739eb763c',
    '2903e952-2b34-4b19-8910-c0d724e9980d'
  )
),
targeted_recipe_items AS (
  SELECT
    ri."id" AS recipe_item_id,
    r."production_loss_rate",
    ti.supplement_loss_rate,
    ti.edible_yield_rate,
    (ri."supplement_targets" -> 0 ->> 'targetValuePerKg')::double precision AS target_value_per_kg,
    CASE ri."supplement_targets" -> 0 ->> 'fieldPath'
      WHEN 'macros.solubleFiber' THEN (ti."nutrition_profile" #>> '{macros,solubleFiber}')::double precision
      WHEN 'macros.insolubleFiber' THEN (ti."nutrition_profile" #>> '{macros,insolubleFiber}')::double precision
      ELSE NULL
    END AS concentration_per_g
  FROM "recipe_item" ri
  JOIN "recipe" r
    ON r."recipe_id" = ri."recipe_id"
   AND r."version" = ri."recipe_version"
  JOIN target_ingredients ti
    ON ti."id" = ri."ingredient_id"
  WHERE ri."ratio_percent" IS NULL
    AND CASE
      WHEN jsonb_typeof(ri."supplement_targets") = 'array'
      THEN jsonb_array_length(ri."supplement_targets") > 0
      ELSE false
    END
),
calculated_recipe_items AS (
  SELECT
    recipe_item_id,
    target_value_per_kg
      * supplement_loss_rate
      * edible_yield_rate
      / concentration_per_g
      / production_loss_rate
      / 10 AS ratio_percent
  FROM targeted_recipe_items
  WHERE target_value_per_kg IS NOT NULL
    AND concentration_per_g IS NOT NULL
    AND concentration_per_g > 0
    AND production_loss_rate > 0
)
UPDATE "recipe_item" ri
SET
  "ratio_percent" = calculated.ratio_percent,
  "nutrient_target_key" = NULL,
  "nutrient_target_value" = NULL,
  "supplement_targets" = NULL
FROM calculated_recipe_items calculated
WHERE ri."id" = calculated.recipe_item_id;

UPDATE "recipe_item"
SET
  "ratio_percent" = CASE "id"
    WHEN '41be5f82-f2a5-4529-ad83-866a0134dcee' THEN 0.9775171065493646
    WHEN '56e88095-5859-42d6-b093-d7c42c64d78d' THEN 0.9680542110358179
  END,
  "nutrient_target_key" = NULL,
  "nutrient_target_value" = NULL,
  "supplement_targets" = NULL
WHERE "id" IN (
  '41be5f82-f2a5-4529-ad83-866a0134dcee',
  '56e88095-5859-42d6-b093-d7c42c64d78d'
);
