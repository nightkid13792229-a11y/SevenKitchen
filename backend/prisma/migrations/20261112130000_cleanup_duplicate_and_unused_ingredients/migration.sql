-- 2026-11-12 清理 4 条原料档案（老板逐条确认）
--
-- 1) 柠檬酸镁胶囊（重复档案-待合并） aaaa051a-d685-45de-8822-57f1f6e783f3
--    与 15fdc850-ffb3-4a9b-bea5-741d7a545f9d 是同一款产品：
--    同品牌 NOW FOODS、同规格「133.33mg镁/粒，120粒/瓶」、同价 122 元、
--    营养数据逐字相同。留的是 15fdc850（22 处配方、35 处设计稿、7 条采购在用），
--    删的是 2025-12-28 批量导入留下的这条（0 配方、0 采购）。
--    它还挂着自己的两条「替代设置」（主原料就是 15fdc850）—— 等于自己替代自己，
--    一起删掉，recipes 的主原料不受影响。
--
-- 2) 菠萝  74ab3c12-e25f-464e-a12b-b24e3e9ef2b8
-- 3) 鹅肝  b79627c1-5242-41e4-8995-a3968a9873e7
--    两条都从未进过配方、从未采购过，营养档案也是空的（JSON null）。
--    它们的采购商品（各 2 个规格）随档案级联删除。
--
-- 4) 鸡胸【有机】 87843f88-c311-44a1-b9a9-726430b484e6
--    没有任何配方在用，但有过 3 笔已完成采购（2026-02-11 / 03-07 / 03-29，共 352.32 元）。
--    老板确认「连采购历史一起删」，所以先减掉采购单上的缓存行数/金额，再删明细。
--
-- 全部按「id + 名称」双条件删除：换到别的库（没有这些档案）时是空操作，
-- 万一同 id 被复用来放别的原料，也不会误删。

-- ---------------------------------------------------------------------------
-- 1. 柠檬酸镁胶囊（重复档案-待合并）
-- ---------------------------------------------------------------------------

-- 它作为「替代原料」的两条设置（is_active 都是 t，但指向的就是自己的副本）
DELETE FROM recipe_supplement_alternative
 WHERE alternative_ingredient_id = 'aaaa051a-d685-45de-8822-57f1f6e783f3';

-- 建档时自动生成的营养映射（RESTRICT，不解开就删不掉原料）
DELETE FROM nutrition_food_mapping
 WHERE ingredient_id = 'aaaa051a-d685-45de-8822-57f1f6e783f3';

-- 对应的自动词条：只删「自动命名 + 已经没有映射/配方引用」的那一条
DELETE FROM nutrition_food
 WHERE name = 'Supplement label profile aaaa051a-d685-45de-8822-57f1f6e783f3'
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
   );

DELETE FROM ingredient
 WHERE id = 'aaaa051a-d685-45de-8822-57f1f6e783f3'
   AND name = '柠檬酸镁胶囊（重复档案-待合并）';

-- 等价组描述里那句「待清理」的备注已经过时
UPDATE supplement_equivalence_group
   SET description = replace(description, '；同名重复档案待清理', ''),
       evidence_summary = replace(
         evidence_summary,
         '；两条同名档案（其中一条名字尾部多一个空格）待清理去重',
         ''
       ),
       updated_at = now()
 WHERE id = '714491f7-1a5c-465c-a9b3-89a73335074c';

-- ---------------------------------------------------------------------------
-- 2. 菠萝 / 鹅肝：从未使用过的空档案
-- ---------------------------------------------------------------------------

DELETE FROM ingredient
 WHERE id = '74ab3c12-e25f-464e-a12b-b24e3e9ef2b8'
   AND name = '菠萝';

DELETE FROM ingredient
 WHERE id = 'b79627c1-5242-41e4-8995-a3968a9873e7'
   AND name = '鹅肝';

-- ---------------------------------------------------------------------------
-- 3. 鸡胸【有机】：连 3 条已完成采购明细一起删
-- ---------------------------------------------------------------------------

-- 采购单上缓存了行数和金额（列表页直接读，不回算），先按明细减掉
WITH removed AS (
  SELECT purchase_list_id,
         count(*)::int AS removed_count,
         coalesce(sum(estimated_cost), 0) AS removed_amount
    FROM purchase_item
   WHERE ingredient_id = '87843f88-c311-44a1-b9a9-726430b484e6'
   GROUP BY purchase_list_id
)
UPDATE purchase_list pl
   SET item_count = pl.item_count - removed.removed_count,
       total_estimated_cost = pl.total_estimated_cost - removed.removed_amount,
       updated_at = now()
  FROM removed
 WHERE pl.id = removed.purchase_list_id;

DELETE FROM purchase_item
 WHERE ingredient_id = '87843f88-c311-44a1-b9a9-726430b484e6';

DELETE FROM ingredient
 WHERE id = '87843f88-c311-44a1-b9a9-726430b484e6'
   AND name = '鸡胸【有机】';
