-- 2026-11-17 合并 5 组「同一系列、同一生命阶段下重复的食谱编号」
--
-- 背景（2026-11-17 顾客反馈「补剂候选整块看不见」查出来的）：
-- 同一道橱窗食谱历史上被导入 / 重建过多次，一个系列的同一个生命阶段挂着两个 recipe_id。
-- 详情页按系列只认「发布时间最新的那一个编号」，另一个就成了幽灵：
-- 旧制作单还引用它，却存下「旧编号 + 新版本号」，补剂接口查不到这个组合 → 整块补剂消失。
--
-- 重复组（保留 ← 合并；判断口径与 selectLatestPublishedSeriesLifeStageVersions 一致：
-- 同阶段按 created_at 取最新，同一时刻再比 version、再比 id）：
--   十字花科全谷物三文鱼鸡肉 · HIGH_ACTIVITY_ADULT
--     30f83406-d2e9-44f7-aebf-7d5c438c72d8 (v9, 2026-06-15) ← 0644e096-2074-4c67-8764-a7e8580023fd (v17, 2026-03-07)
--   十字花科全谷物三文鱼鸡肉 · LOW_ACTIVITY_ADULT_OR_SENIOR
--     403c4d60-51a5-4f51-80e8-2e6471dc553d (v9, 2026-06-21) ← 99184a28-a297-4279-b7df-138fcc3826e3 (v13, 2026-03-07)
--   小米鳕鱼鸡胸 · LOW_ACTIVITY_ADULT_OR_SENIOR
--     ce128379-de56-4416-99e1-1e48dd5a1956 (v1, 2026-06-09) ← 0d049e33-a450-4300-b2fe-439089cdecef (v4, 2026-01-22)
--   燕麦鳕鱼猪肉 · LOW_ACTIVITY_ADULT_OR_SENIOR
--     0fdc6d24-fddc-4ec6-9790-3e05f724587b (v3, 2026-06-09) ← 1d802350-3bcb-4c42-b40f-38185e539d52 (v5, 2026-01-23)
--   糙米三文鱼鸭胸鹿腿 · LOW_ACTIVITY_ADULT_OR_SENIOR
--     1bd86ee4-fef9-40a5-8c5f-dd867eab5c56 (v6, 2026-06-10) ← a149634a-ead1-4a25-98ea-ee2b423b3175 (v4, 2026-01-21)
--
-- 做什么：
--   1) 把「引用旧编号」的地方改指向保留编号：制作单 244 张、漏斗埋点 13 条。
--      旧制作单的 recipe_version 清空 —— 那个版本号属于另一条版本链，留着一定对不上；
--      清空后按保留编号的最新版解析（与现有 59 张无版本号的老单同一条路）。
--   2) 浏览 / 收藏 / 点赞 / 销量 / 生成次数并入保留编号的最新版，不丢历史数据。
--   3) 删除 5 个重复编号的食谱行（配方行、健康标签、分享凭证、评价随之级联）。
--      design_recipe_publish_snapshot 是发布审计（带当时的快照数据），保持原样不改写。
--   4) 今天的实际引用只有上面那些；favorite_recipe / supplement_order / tasting_pack_item /
--      life_stage_acknowledgement / recipe_review / order_recipe_design / custom_recipe_*
--      都是 0 行，一旦出现就报错中止，绝不"猜着处理"。已下单冻结的制作单也会中止。
--   5) 换到没有这些编号的库（本地 / 新环境）时是空操作。

-- ---------------------------------------------------------------------------
-- 0. 前置校验：出现意料之外的引用就中止，先人工确认再谈迁移
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  dup_ids text[] := ARRAY[
    '0644e096-2074-4c67-8764-a7e8580023fd',
    '99184a28-a297-4279-b7df-138fcc3826e3',
    '0d049e33-a450-4300-b2fe-439089cdecef',
    '1d802350-3bcb-4c42-b40f-38185e539d52',
    'a149634a-ead1-4a25-98ea-ee2b423b3175'
  ];
  unexpected text;
BEGIN
  -- 这些编号在当前库里已经不存在 = 空操作
  IF NOT EXISTS (
    SELECT 1 FROM recipe WHERE recipe_id = ANY(dup_ids)
  ) THEN
    RAISE NOTICE '没有待合并的重复食谱编号，跳过';
    RETURN;
  END IF;

  SELECT string_agg(x.label, '、')
    INTO unexpected
    FROM (
      SELECT '收藏（favorite_recipe）' AS label
        FROM favorite_recipe WHERE recipe_id = ANY(dup_ids)
      UNION ALL
      SELECT '补剂订单（supplement_order）'
        FROM supplement_order WHERE recipe_id = ANY(dup_ids)
      UNION ALL
      SELECT '试吃包（tasting_pack_item）'
        FROM tasting_pack_item WHERE recipe_id = ANY(dup_ids)
      UNION ALL
      SELECT '生命阶段确认（life_stage_acknowledgement）'
        FROM life_stage_acknowledgement WHERE recipe_id = ANY(dup_ids)
      UNION ALL
      SELECT '已下单冻结的制作单'
        FROM diy_sheet
       WHERE recipe_id = ANY(dup_ids) AND snapshot IS NOT NULL
      UNION ALL
      SELECT '评价（recipe_review）'
        FROM recipe_review rv
        JOIN recipe r ON r.id = rv.recipe_id
       WHERE r.recipe_id = ANY(dup_ids)
      UNION ALL
      SELECT '设计槽位（order_recipe_design）'
        FROM order_recipe_design od
        JOIN recipe r ON r.id = od.recipe_id
       WHERE r.recipe_id = ANY(dup_ids)
      UNION ALL
      SELECT '定制单（custom_recipe_order）'
        FROM custom_recipe_order co
        JOIN recipe r ON r.id = co.recipe_id
       WHERE r.recipe_id = ANY(dup_ids)
      UNION ALL
      SELECT '定制交付（custom_recipe_delivery）'
        FROM custom_recipe_delivery cd
        JOIN recipe r ON r.id = cd.recipe_id
       WHERE r.recipe_id = ANY(dup_ids)
      UNION ALL
      SELECT '定制交付明细（custom_recipe_delivery_item）'
        FROM custom_recipe_delivery_item cdi
        JOIN recipe r ON r.id = cdi.recipe_id
       WHERE r.recipe_id = ANY(dup_ids)
    ) x;

  IF unexpected IS NOT NULL THEN
    RAISE EXCEPTION '重复食谱编号还有未处理的引用（%），已中止，先人工确认', unexpected;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. 引用改指向保留编号
-- ---------------------------------------------------------------------------

-- 制作单：改编号 + 清掉跨链的版本号（这批单都没冻结，前置校验已确认）
UPDATE diy_sheet s
   SET recipe_id = m.keep_id,
       recipe_version = NULL
  FROM (VALUES
    ('0644e096-2074-4c67-8764-a7e8580023fd', '30f83406-d2e9-44f7-aebf-7d5c438c72d8'),
    ('99184a28-a297-4279-b7df-138fcc3826e3', '403c4d60-51a5-4f51-80e8-2e6471dc553d'),
    ('0d049e33-a450-4300-b2fe-439089cdecef', 'ce128379-de56-4416-99e1-1e48dd5a1956'),
    ('1d802350-3bcb-4c42-b40f-38185e539d52', '0fdc6d24-fddc-4ec6-9790-3e05f724587b'),
    ('a149634a-ead1-4a25-98ea-ee2b423b3175', '1bd86ee4-fef9-40a5-8c5f-dd867eab5c56')
  ) AS m(dup_id, keep_id)
 WHERE s.recipe_id = m.dup_id;

-- 漏斗埋点：把旧编号下的浏览/加购事件并到保留编号，历史漏斗不断档
UPDATE product_funnel_event e
   SET recipe_id = m.keep_id
  FROM (VALUES
    ('0644e096-2074-4c67-8764-a7e8580023fd', '30f83406-d2e9-44f7-aebf-7d5c438c72d8'),
    ('99184a28-a297-4279-b7df-138fcc3826e3', '403c4d60-51a5-4f51-80e8-2e6471dc553d'),
    ('0d049e33-a450-4300-b2fe-439089cdecef', 'ce128379-de56-4416-99e1-1e48dd5a1956'),
    ('1d802350-3bcb-4c42-b40f-38185e539d52', '0fdc6d24-fddc-4ec6-9790-3e05f724587b'),
    ('a149634a-ead1-4a25-98ea-ee2b423b3175', '1bd86ee4-fef9-40a5-8c5f-dd867eab5c56')
  ) AS m(dup_id, keep_id)
 WHERE e.recipe_id = m.dup_id;

-- ---------------------------------------------------------------------------
-- 2. 互动计数并入保留编号的最新版（所有旧版本一起汇总）
-- ---------------------------------------------------------------------------
WITH merged(dup_id, keep_id) AS (
  VALUES
    ('0644e096-2074-4c67-8764-a7e8580023fd', '30f83406-d2e9-44f7-aebf-7d5c438c72d8'),
    ('99184a28-a297-4279-b7df-138fcc3826e3', '403c4d60-51a5-4f51-80e8-2e6471dc553d'),
    ('0d049e33-a450-4300-b2fe-439089cdecef', 'ce128379-de56-4416-99e1-1e48dd5a1956'),
    ('1d802350-3bcb-4c42-b40f-38185e539d52', '0fdc6d24-fddc-4ec6-9790-3e05f724587b'),
    ('a149634a-ead1-4a25-98ea-ee2b423b3175', '1bd86ee4-fef9-40a5-8c5f-dd867eab5c56')
),
totals AS (
  SELECT merged.keep_id,
         sum(r.view_count)::int     AS add_view,
         sum(r.favorite_count)::int AS add_favorite,
         sum(r.like_count)::int     AS add_like,
         sum(r.sales_count)::int    AS add_sales,
         sum(r.diy_gen_count)::int  AS add_diy
    FROM recipe r
    JOIN merged ON merged.dup_id = r.recipe_id
   GROUP BY merged.keep_id
),
latest AS (
  SELECT recipe_id, max(version) AS version
    FROM recipe
   WHERE recipe_id IN (SELECT keep_id FROM merged)
   GROUP BY recipe_id
)
UPDATE recipe keep
   SET view_count     = keep.view_count + totals.add_view,
       favorite_count = keep.favorite_count + totals.add_favorite,
       like_count     = keep.like_count + totals.add_like,
       sales_count    = keep.sales_count + totals.add_sales,
       diy_gen_count  = keep.diy_gen_count + totals.add_diy
  FROM totals
  JOIN latest ON latest.recipe_id = totals.keep_id
 WHERE keep.recipe_id = latest.recipe_id
   AND keep.version = latest.version;

-- ---------------------------------------------------------------------------
-- 3. 删除重复编号的食谱行（id + 名称 双条件，避免 id 被复用时误删）
-- ---------------------------------------------------------------------------
DELETE FROM recipe r
 USING (VALUES
    ('0644e096-2074-4c67-8764-a7e8580023fd', '十字花科全谷物三文鱼鸡肉'),
    ('99184a28-a297-4279-b7df-138fcc3826e3', '十字花科全谷物三文鱼鸡肉'),
    ('0d049e33-a450-4300-b2fe-439089cdecef', '小米鳕鱼鸡胸'),
    ('1d802350-3bcb-4c42-b40f-38185e539d52', '燕麦鳕鱼猪肉'),
    ('a149634a-ead1-4a25-98ea-ee2b423b3175', '糙米三文鱼鸭胸鹿腿')
 ) AS d(recipe_id, name)
 WHERE r.recipe_id = d.recipe_id
   AND r.name = d.name;
