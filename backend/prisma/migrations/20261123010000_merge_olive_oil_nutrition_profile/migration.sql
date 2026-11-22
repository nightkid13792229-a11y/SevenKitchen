-- 2026-11-23 合并橄榄油的两条营养档案（老板确认：只保留「特级初榨橄榄油」）
--
-- 背景：原料「橄榄油」(11109405-71c3-4aec-81f9-7fa57941c77f) 下挂了两条营养档案：
--   1) 65497536-cd03-46dc-88e2-e03f96b788ff
--      Oil, olive, salad or cooking / 橄榄油（通用，沙拉/烹调用）/ USDA 171413 —— 当前是主档案
--   2) 122066b8-a290-4d44-984a-ac1e5fa7d845
--      Oil, olive, extra virgin / 特级初榨橄榄油 / USDA 748608 —— 当前是次级档案
--
-- 两条的营养数据逐项相同（884 kcal、脂肪 100 g、维E 21.4261 mg、维K 60.2 μg、
-- 铁 0.56 mg …），只是 USDA 来源条目不同。留特级初榨，通用那条删掉。
--
-- 因为营养值一样，把引用改到特级初榨后，配方/设计稿的营养计算结果不会变。
--
-- 处理顺序：
--   1) 设计稿条目 7 条、配方条目 2 条 改指特级初榨
--   2) 删掉通用档案在「橄榄油」上的映射，并把特级初榨的映射设为主档案
--   3) 删掉通用档案本体
--
-- 全部按「id + 名称」双条件：换到没有这些档案的库、或已经执行过一次时都是空操作，
-- 不会误删同 id 被复用的别的数据。

-- ---------------------------------------------------------------------------
-- 1. 把还在用通用档案的条目改指特级初榨
-- ---------------------------------------------------------------------------

UPDATE design_recipe_item
   SET nutrition_food_id = '122066b8-a290-4d44-984a-ac1e5fa7d845'
 WHERE nutrition_food_id = '65497536-cd03-46dc-88e2-e03f96b788ff';

UPDATE recipe_item
   SET nutrition_food_id = '122066b8-a290-4d44-984a-ac1e5fa7d845'
 WHERE nutrition_food_id = '65497536-cd03-46dc-88e2-e03f96b788ff';

-- ---------------------------------------------------------------------------
-- 2. 映射：删通用的、把特级初榨设为主档案
-- ---------------------------------------------------------------------------

DELETE FROM nutrition_food_mapping
 WHERE nutrition_food_id = '65497536-cd03-46dc-88e2-e03f96b788ff'
   AND ingredient_id = '11109405-71c3-4aec-81f9-7fa57941c77f'
   AND EXISTS (
     SELECT 1 FROM nutrition_food f
      WHERE f.id = nutrition_food_mapping.nutrition_food_id
        AND f.name = 'Oil, olive, salad or cooking'
   );

UPDATE nutrition_food_mapping
   SET is_primary = true,
       updated_at = now()
 WHERE nutrition_food_id = '122066b8-a290-4d44-984a-ac1e5fa7d845'
   AND ingredient_id = '11109405-71c3-4aec-81f9-7fa57941c77f';

-- ---------------------------------------------------------------------------
-- 3. 删除通用档案本体（先确认已经没有任何地方引用）
-- ---------------------------------------------------------------------------

DELETE FROM nutrition_food
 WHERE id = '65497536-cd03-46dc-88e2-e03f96b788ff'
   AND name = 'Oil, olive, salad or cooking'
   AND NOT EXISTS (
     SELECT 1 FROM nutrition_food_mapping m
      WHERE m.nutrition_food_id = nutrition_food.id
   )
   AND NOT EXISTS (
     SELECT 1 FROM recipe_item r
      WHERE r.nutrition_food_id = nutrition_food.id
   )
   AND NOT EXISTS (
     SELECT 1 FROM design_recipe_item d
      WHERE d.nutrition_food_id = nutrition_food.id
   )
   AND NOT EXISTS (
     SELECT 1 FROM supplement_label_evidence e
      WHERE e.nutrition_food_id = nutrition_food.id
   );
