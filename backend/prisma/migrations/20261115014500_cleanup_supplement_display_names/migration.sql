-- 2026-11-15 补剂原料显示名清理（老板确认）
--
-- 规则：补剂原料名只保留"物质名"，不再带胶囊/片/滴剂这类剂型词
-- （这些剂型在页面上已经由"粒/片/滴"的用量单位表达）。
-- 老板特别确认：海带片保留原名，避免和"海带粉"混淆。
--
-- 说明：
-- 1. 咖啡因/骨粉/菊粉这类"粉"是物料本名，本轮保留。
-- 2. 历史订单里的名称是下单快照（supplement_order_item.name），不改。
-- 3. 全部按「id + 旧名」双条件更新：换到别的库或已改过时是空操作，
--    万一同 id 被复用也不会误改。
-- 4. 改完后允许同名（鱼油 ×2、维生素D3 ×2、骨粉 ×3），
--    由品牌 + 规格区分；唯一键是 (name, brand, product_model)，不会冲突。

-- ---------------------------------------------------------------------------
-- 1. 剂型词清理
-- ---------------------------------------------------------------------------

-- B族维生素复合胶囊 → 复合B族维生素（Jarrow B-Right，语序顺过来）
UPDATE ingredient
   SET name = '复合B族维生素', updated_at = now()
 WHERE id = '814a9199-f944-4c8f-b651-61f6e4eea765'
   AND name = 'B族维生素复合胶囊';

-- B族维生素胶囊 → B族维生素（NOW FOODS）
UPDATE ingredient
   SET name = 'B族维生素', updated_at = now()
 WHERE id = '3ddce500-b52e-48e0-a567-fbd6cd6bb367'
   AND name = 'B族维生素胶囊';

-- 双甘氨酸亚铁胶囊 → 双甘氨酸亚铁
UPDATE ingredient
   SET name = '双甘氨酸亚铁', updated_at = now()
 WHERE id = 'ade3cfbc-90a3-4111-9816-cbf728e3c334'
   AND name = '双甘氨酸亚铁胶囊';

-- 双甘氨酸铜片 → 双甘氨酸铜
UPDATE ingredient
   SET name = '双甘氨酸铜', updated_at = now()
 WHERE id = '564636c7-6d6c-4b1a-8b18-5b24a898906a'
   AND name = '双甘氨酸铜片';

-- 柠檬酸钾胶囊 → 柠檬酸钾
UPDATE ingredient
   SET name = '柠檬酸钾', updated_at = now()
 WHERE id = '3187ad98-6688-4daf-a6db-30e54ccf7f3b'
   AND name = '柠檬酸钾胶囊';

-- 柠檬酸镁胶囊 → 柠檬酸镁
UPDATE ingredient
   SET name = '柠檬酸镁', updated_at = now()
 WHERE id = '15fdc850-ffb3-4a9b-bea5-741d7a545f9d'
   AND name = '柠檬酸镁胶囊';

-- 海带粉胶囊 → 海带粉（海带片按老板要求保留原名）
UPDATE ingredient
   SET name = '海带粉', updated_at = now()
 WHERE id = 'e40acd37-fe46-4082-82dd-649696810554'
   AND name = '海带粉胶囊';

-- 牛磺酸胶囊 → 牛磺酸
UPDATE ingredient
   SET name = '牛磺酸', updated_at = now()
 WHERE id = 'a2cd1e77-93d9-4b44-b460-84bcf27c0474'
   AND name = '牛磺酸胶囊';

-- 甘氨酸锰片 → 甘氨酸锰
UPDATE ingredient
   SET name = '甘氨酸锰', updated_at = now()
 WHERE id = '23e30732-e7af-4b44-8f5e-622d0ceacd00'
   AND name = '甘氨酸锰片';

-- 碘钾片 → 碘化钾（产品实际是碘化钾，顺手把名称写准）
UPDATE ingredient
   SET name = '碘化钾', updated_at = now()
 WHERE id = 'dcc9ba4b-84f8-418b-95fc-fc667c44eb1f'
   AND name = '碘钾片';

-- 维生素D3滴剂 → 维生素D3
UPDATE ingredient
   SET name = '维生素D3', updated_at = now()
 WHERE id = '6394738e-8986-47bc-bd1c-17bd64922fc2'
   AND name = '维生素D3滴剂';

-- 维生素D3胶囊 → 维生素D3
UPDATE ingredient
   SET name = '维生素D3', updated_at = now()
 WHERE id = 'c2a70c77-b0de-4168-acb5-1956c990a3ff'
   AND name = '维生素D3胶囊';

-- 维生素E胶囊 → 维生素E
UPDATE ingredient
   SET name = '维生素E', updated_at = now()
 WHERE id = 'e5fd3256-a1a4-4a89-b486-6eaed63b5624'
   AND name = '维生素E胶囊';

-- 胆碱片 → 胆碱
UPDATE ingredient
   SET name = '胆碱', updated_at = now()
 WHERE id = 'a086e0d6-2765-4376-afac-b05483ba9ae9'
   AND name = '胆碱片';

-- 葡萄糖酸锌片 → 葡萄糖酸锌
UPDATE ingredient
   SET name = '葡萄糖酸锌', updated_at = now()
 WHERE id = 'b03403f5-e1ff-4551-9b16-b0d126a50afa'
   AND name = '葡萄糖酸锌片';

-- 蛋氨酸锌胶囊 → 蛋氨酸锌
UPDATE ingredient
   SET name = '蛋氨酸锌', updated_at = now()
 WHERE id = '65c2b45f-bae2-47e8-a7e1-7aa3c347dd4b'
   AND name = '蛋氨酸锌胶囊';

-- 骨粉片 → 骨粉（和另外两条骨粉同名，靠品牌/规格区分）
UPDATE ingredient
   SET name = '骨粉', updated_at = now()
 WHERE id = '8a6d64b8-26c6-4b47-a5ea-125406157096'
   AND name = '骨粉片';

-- 鱼油胶囊（200 粒款）→ 鱼油
UPDATE ingredient
   SET name = '鱼油', updated_at = now()
 WHERE id = 'b50a3852-61b3-43f7-a599-486c055bf806'
   AND name = '鱼油胶囊';

-- 鱼油胶囊（180 粒款）→ 鱼油
UPDATE ingredient
   SET name = '鱼油', updated_at = now()
 WHERE id = 'd3a6f6ec-3083-4d72-a06a-9baed242226c'
   AND name = '鱼油胶囊';

-- ---------------------------------------------------------------------------
-- 2. 等价组说明里的旧名字同步（只改说明文案，不动分组关系）
-- ---------------------------------------------------------------------------

-- 碘 · 复方盐
UPDATE supplement_equivalence_group
   SET description = replace(description, '碘钾片', '碘化钾'),
       updated_at = now()
 WHERE id = '1c63526c-3cc2-4947-a748-d243bdc3b5bc'
   AND description LIKE '%碘钾片%';

-- 钾 · 盐类
UPDATE supplement_equivalence_group
   SET description = replace(description, '碘钾片', '碘化钾'),
       updated_at = now()
 WHERE id = '6d8aac3f-7c0e-4e0e-a9c9-3112868597b7'
   AND description LIKE '%碘钾片%';

-- 锰 · 螯合
UPDATE supplement_equivalence_group
   SET description = replace(description, '甘氨酸锰片', '甘氨酸锰'),
       updated_at = now()
 WHERE id = '0e9cbfeb-5eb0-4de6-8894-301bb74f650e'
   AND description LIKE '%甘氨酸锰片%';

-- 维生素 D3 · 液体：保留“液体”说明，只去掉“滴剂”
UPDATE supplement_equivalence_group
   SET description = replace(description, '维生素D3滴剂（液体）', '维生素D3（液体）'),
       updated_at = now()
 WHERE id = 'dc24c27b-7956-48cb-81a6-c440029837e4'
   AND description LIKE '%维生素D3滴剂（液体）%';

-- 维生素 E
UPDATE supplement_equivalence_group
   SET description = replace(description, '维生素E胶囊', '维生素E'),
       updated_at = now()
 WHERE id = 'bc00509f-1f75-4d8c-94e5-d0db1b18b560'
   AND description LIKE '%维生素E胶囊%';

-- 碘 · 天然（海带片保留原名）
UPDATE supplement_equivalence_group
   SET description = replace(description, '海带粉胶囊', '海带粉'),
       updated_at = now()
 WHERE id = '79ced46a-8469-4402-aac3-41545a93098e'
   AND description LIKE '%海带粉胶囊%';

-- 牛磺酸
UPDATE supplement_equivalence_group
   SET description = replace(description, '牛磺酸胶囊', '牛磺酸'),
       updated_at = now()
 WHERE id = 'f59d9c40-450e-4508-91af-975128056d60'
   AND description LIKE '%牛磺酸胶囊%';

-- 钙 · 骨源（现在三条都叫骨粉）
UPDATE supplement_equivalence_group
   SET description = replace(description, '骨粉/骨粉片', '骨粉'),
       updated_at = now()
 WHERE id = '22733a19-7f77-4962-971b-d78ab3868ce9'
   AND description LIKE '%骨粉/骨粉片%';

-- 铁 · 螯合
UPDATE supplement_equivalence_group
   SET description = replace(description, '双甘氨酸亚铁胶囊', '双甘氨酸亚铁'),
       updated_at = now()
 WHERE id = '0613a0d6-3694-4ca4-8cfb-ee812bc8cd04'
   AND description LIKE '%双甘氨酸亚铁胶囊%';

-- 维生素 D3（胶囊款）：和液体款同名，说明里补“胶囊”以便区分
UPDATE supplement_equivalence_group
   SET description = replace(description, '维生素D3胶囊；', '维生素D3（胶囊）；'),
       updated_at = now()
 WHERE id = '3c9ee5c3-db1a-45fe-a973-ba6e7bbe5d2f'
   AND description LIKE '%维生素D3胶囊；%';

-- Omega-3 · 鱼油
UPDATE supplement_equivalence_group
   SET description = replace(description, '鱼油胶囊', '鱼油'),
       updated_at = now()
 WHERE id = '7d072ed8-7cb4-49d3-a7be-4cd22eed0ae8'
   AND description LIKE '%鱼油胶囊%';
