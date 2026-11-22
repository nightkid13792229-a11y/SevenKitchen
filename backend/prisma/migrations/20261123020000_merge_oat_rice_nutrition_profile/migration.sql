-- 2026-11-23 合并燕麦米的两条营养档案（老板确认：只保留 USDA 钢切那条）
--
-- 背景：原料「燕麦米」(fcd93c98-3500-4c89-afe3-1bce83afa092) 下挂了两条营养档案：
--   1) b7c3f8a2-4d1e-4c7a-9f6b-2e8a1c5d7f90
--      燕麦米，钢切/生干（USDA 2346397 + 173904 补全）/ USDA / 当前主档案
--      脂肪 5.8g、碳水 69.75g、纤维 10.1g —— 与沃集鲜产品标签（脂肪 5.0g/100g）一致
--   2) 6852c161-55b9-4b36-a8d3-283ae19315f2
--      燕麦米，生/干（AFCD F006136 + USDA/MEXT 补全）/ AFCD / 次级档案
--      脂肪 9.8g、碳水 55.5g、纤维 8.6g —— 与产品标签不符，偏肥
--
-- 这两条不是完全重复（数据源不同、数值差得不少），但 2026-10-22 换主档案时
-- 已经认定 USDA 那条更贴近实物，AFCD 那条只留作次要映射。现在按老板确认删掉旧的：
-- 把旧档案在用的条目全部改指 USDA 那条。
--
-- 注意：设计稿的 calculated_nutrition 是评估时落的快照，这次不改快照，
-- 所以已发布/已评估的食谱营养数字不会因为本迁移当场变化；等下次重新评估
-- 或重新发布时才会按新档案重算（数值更贴近产品标签）。
--
-- 全部按「id + 名称」双条件：换到没有这些档案的库、或已经执行过一次时都是空操作。

-- ---------------------------------------------------------------------------
-- 1. 把还在用旧 AFCD 档案的条目改指 USDA 钢切档案
-- ---------------------------------------------------------------------------

UPDATE design_recipe_item
   SET nutrition_food_id = 'b7c3f8a2-4d1e-4c7a-9f6b-2e8a1c5d7f90'
 WHERE nutrition_food_id = '6852c161-55b9-4b36-a8d3-283ae19315f2';

UPDATE recipe_item
   SET nutrition_food_id = 'b7c3f8a2-4d1e-4c7a-9f6b-2e8a1c5d7f90'
 WHERE nutrition_food_id = '6852c161-55b9-4b36-a8d3-283ae19315f2';

-- ---------------------------------------------------------------------------
-- 2. 映射：删旧档案的映射，保证 USDA 那条是主档案
-- ---------------------------------------------------------------------------

DELETE FROM nutrition_food_mapping
 WHERE nutrition_food_id = '6852c161-55b9-4b36-a8d3-283ae19315f2'
   AND ingredient_id = 'fcd93c98-3500-4c89-afe3-1bce83afa092'
   AND EXISTS (
     SELECT 1 FROM nutrition_food f
      WHERE f.id = nutrition_food_mapping.nutrition_food_id
        AND f.name = '燕麦米，生/干'
   );

UPDATE nutrition_food_mapping
   SET is_primary = true,
       updated_at = now()
 WHERE nutrition_food_id = 'b7c3f8a2-4d1e-4c7a-9f6b-2e8a1c5d7f90'
   AND ingredient_id = 'fcd93c98-3500-4c89-afe3-1bce83afa092';

-- ---------------------------------------------------------------------------
-- 3. 主档案备注里「旧档案保留为次要映射」这句已经过时，顺手改掉
-- ---------------------------------------------------------------------------

UPDATE nutrition_food
   SET notes = replace(
         notes,
         '原 AFCD hulled oats 档案保留为次要映射。',
         '2026-11-23：AFCD 旧档案（燕麦米，生/干，脂肪 9.8g）已并入本档案后删除，历史引用全部改指本档案。'
       ),
       updated_at = now()
 WHERE id = 'b7c3f8a2-4d1e-4c7a-9f6b-2e8a1c5d7f90'
   AND notes LIKE '%原 AFCD hulled oats 档案保留为次要映射%';

-- ---------------------------------------------------------------------------
-- 4. 删除旧档案本体（先确认已经没有任何地方引用）
-- ---------------------------------------------------------------------------

DELETE FROM nutrition_food
 WHERE id = '6852c161-55b9-4b36-a8d3-283ae19315f2'
   AND name = '燕麦米，生/干'
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
