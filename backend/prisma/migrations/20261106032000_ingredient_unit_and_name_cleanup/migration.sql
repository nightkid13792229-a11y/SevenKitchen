-- 原料口径小清理（2026-11-06「单一来源」改造 · 阶段 E）
--
-- 1) 采购单位写法统一
--    '克' 与 'g' 是同一个单位，混用会让后台筛选、导出、对账都得写两遍。
--    换算比不变、单价不变，只改显示口径。
--
-- 2) 去掉名称首尾空格
--    「柠檬酸镁胶囊 」和「维生素E胶囊 」带尾空格，按名字精确匹配会漏。
--
-- 3) 带尾空格的重复档案改名标记，**不删除**
--    「柠檬酸镁胶囊 」全库 0 引用（食谱明细 / 采购项 / 推荐商品都是 0），
--    是「柠檬酸镁胶囊」的重复档案。这里只改名标记，不做删除：
--    删除要跨全库确认 0 引用，风险大于收益，交给后台人工合并更稳妥。
--    改名后不再带尾空格，也不会撞唯一约束。

-- 1) 采购单位写法
UPDATE "ingredient"
SET "purchase_unit" = 'g'
WHERE "type" = 'FOOD'
  AND "purchase_unit" = '克';

-- 3) 重复档案改名标记（放在去空格之前，避免撞唯一约束）
UPDATE "ingredient" i
SET "name" = '柠檬酸镁胶囊（重复档案-待合并）'
WHERE i."name" = '柠檬酸镁胶囊 '
  AND NOT EXISTS (
    SELECT 1 FROM "ingredient" o
    WHERE o."id" <> i."id" AND o."name" = '柠檬酸镁胶囊（重复档案-待合并）'
  );

-- 2) 去首尾空格（有同名档案时跳过，绝不撞唯一约束）
UPDATE "ingredient" i
SET "name" = btrim(i."name")
WHERE i."name" <> btrim(i."name")
  AND NOT EXISTS (
    SELECT 1 FROM "ingredient" o
    WHERE o."id" <> i."id"
      AND o."name" = btrim(i."name")
      AND COALESCE(o."brand", '') = COALESCE(i."brand", '')
      AND COALESCE(o."product_model", '') = COALESCE(i."product_model", '')
  );
