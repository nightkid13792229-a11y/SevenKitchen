-- 历史数据修复：Agent/外部入口只传 nutrition_food_id 时，ingredient_id 为空。
-- 只回填「该营养档案只对应一个标准原料」的情况；多映射不猜，留给业务显式选择。
WITH unique_mapping AS (
  SELECT m.nutrition_food_id, m.ingredient_id
  FROM nutrition_food_mapping m
  JOIN (
    SELECT nutrition_food_id
    FROM nutrition_food_mapping
    GROUP BY nutrition_food_id
    HAVING COUNT(*) = 1
  ) only_one ON only_one.nutrition_food_id = m.nutrition_food_id
)
UPDATE design_recipe_item AS item
SET ingredient_id = unique_mapping.ingredient_id
FROM unique_mapping
WHERE item.ingredient_id IS NULL
  AND item.nutrition_food_id = unique_mapping.nutrition_food_id;
