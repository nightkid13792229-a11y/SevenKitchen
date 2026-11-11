-- 2026-11-11 采购单位唯一来源（第一步）
--
-- 背景：采购单位在四个地方各写一份 —— 后端常量、后台常量、后台原料弹窗内联、
-- 小程序识别结果页。四份内容并不相同：「提/件」被员工端当整件单位用，
-- 后端白名单里却没有这两个字；识别结果页还有谁都没有的「组」。
-- 结果是同一个"单位"在不同页面能选到的集合不一样，而换算永远按商品倍数算，
-- 单位对不上就是静默的整倍数错账。
--
-- 这次把清单收进可维护的选项字典 `purchase_unit`：
--   · extra.baseUnits —— 适用于哪些基准单位（G / ML / PCS）
--   · extra.aliases   —— 历史写法与简称（公斤/千克 → kg）
--   · extra.kind      —— PACKAGING（包装单位）/ MEASUREMENT（计量单位）
--   · extra.multipack —— 整件单位：员工端据此提醒"补一层"
--
-- 种子 = 改造前四份清单的并集（宁多勿少）：现有校验对字典外的值是直接 400，
-- 字典比历史数据窄会让老商品连编辑都过不去（渠道字典当年同样处理）。
-- 运营之后可以在后台停用不需要的项，停用不删除。

INSERT INTO "platform_option_set"
  ("code", "name", "description", "source_type", "enum_name", "enabled", "created_at", "updated_at")
VALUES
  ('purchase_unit', '采购单位', '采购商品的计价单位；按原料基准单位分组，带别名与「整件」标记（2026-11-11）', 'DATA', NULL, TRUE, now(), now())
ON CONFLICT ("code") DO UPDATE
SET "name" = EXCLUDED."name",
    "description" = EXCLUDED."description",
    "source_type" = 'DATA',
    "enabled" = TRUE,
    "updated_at" = now();

-- 只在选项集还没有任何项时灌入：已经维护过的环境不覆盖运营的改动
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "platform_option_item" WHERE "set_id" = 'purchase_unit') THEN
    RETURN;
  END IF;

  INSERT INTO "platform_option_item"
    ("id", "set_id", "code", "label", "sort_order", "enabled", "extra", "created_at", "updated_at")
  VALUES
(md5(random()::text || clock_timestamp()::text || '袋'), 'purchase_unit', '袋', '袋', 10, TRUE, '{"baseUnits":["G","ML","PCS"],"aliases":[],"kind":"PACKAGING","multipack":false}'::jsonb, now(), now()),
    (md5(random()::text || clock_timestamp()::text || '箱'), 'purchase_unit', '箱', '箱', 20, TRUE, '{"baseUnits":["G","ML","PCS"],"aliases":[],"kind":"PACKAGING","multipack":true}'::jsonb, now(), now()),
    (md5(random()::text || clock_timestamp()::text || '包'), 'purchase_unit', '包', '包', 30, TRUE, '{"baseUnits":["G","ML","PCS"],"aliases":[],"kind":"PACKAGING","multipack":false}'::jsonb, now(), now()),
    (md5(random()::text || clock_timestamp()::text || '瓶'), 'purchase_unit', '瓶', '瓶', 40, TRUE, '{"baseUnits":["G","ML","PCS"],"aliases":[],"kind":"PACKAGING","multipack":false}'::jsonb, now(), now()),
    (md5(random()::text || clock_timestamp()::text || '盒'), 'purchase_unit', '盒', '盒', 50, TRUE, '{"baseUnits":["G","ML","PCS"],"aliases":[],"kind":"PACKAGING","multipack":false}'::jsonb, now(), now()),
    (md5(random()::text || clock_timestamp()::text || '桶'), 'purchase_unit', '桶', '桶', 60, TRUE, '{"baseUnits":["G","ML","PCS"],"aliases":[],"kind":"PACKAGING","multipack":true}'::jsonb, now(), now()),
    (md5(random()::text || clock_timestamp()::text || '罐'), 'purchase_unit', '罐', '罐', 70, TRUE, '{"baseUnits":["G","ML","PCS"],"aliases":[],"kind":"PACKAGING","multipack":false}'::jsonb, now(), now()),
    (md5(random()::text || clock_timestamp()::text || '份'), 'purchase_unit', '份', '份', 80, TRUE, '{"baseUnits":["G","ML","PCS"],"aliases":["serving"],"kind":"PACKAGING","multipack":false}'::jsonb, now(), now()),
    (md5(random()::text || clock_timestamp()::text || '提'), 'purchase_unit', '提', '提', 90, TRUE, '{"baseUnits":["G","PCS"],"aliases":[],"kind":"PACKAGING","multipack":true}'::jsonb, now(), now()),
    (md5(random()::text || clock_timestamp()::text || '件'), 'purchase_unit', '件', '件', 100, TRUE, '{"baseUnits":["G","ML","PCS"],"aliases":[],"kind":"PACKAGING","multipack":true}'::jsonb, now(), now()),
    (md5(random()::text || clock_timestamp()::text || '组'), 'purchase_unit', '组', '组', 110, TRUE, '{"baseUnits":["G","ML","PCS"],"aliases":[],"kind":"PACKAGING","multipack":true}'::jsonb, now(), now()),
    (md5(random()::text || clock_timestamp()::text || '卷'), 'purchase_unit', '卷', '卷', 120, TRUE, '{"baseUnits":["PCS","ML"],"aliases":[],"kind":"PACKAGING","multipack":false}'::jsonb, now(), now()),
    (md5(random()::text || clock_timestamp()::text || '个'), 'purchase_unit', '个', '个', 130, TRUE, '{"baseUnits":["G","PCS"],"aliases":["只"],"kind":"PACKAGING","multipack":false}'::jsonb, now(), now()),
    (md5(random()::text || clock_timestamp()::text || '条'), 'purchase_unit', '条', '条', 140, TRUE, '{"baseUnits":["G","PCS"],"aliases":[],"kind":"PACKAGING","multipack":false}'::jsonb, now(), now()),
    (md5(random()::text || clock_timestamp()::text || '块'), 'purchase_unit', '块', '块', 150, TRUE, '{"baseUnits":["G","PCS"],"aliases":[],"kind":"PACKAGING","multipack":false}'::jsonb, now(), now()),
    (md5(random()::text || clock_timestamp()::text || '片'), 'purchase_unit', '片', '片', 160, TRUE, '{"baseUnits":["G","PCS"],"aliases":[],"kind":"PACKAGING","multipack":false}'::jsonb, now(), now()),
    (md5(random()::text || clock_timestamp()::text || '颗'), 'purchase_unit', '颗', '颗', 170, TRUE, '{"baseUnits":["G","PCS"],"aliases":[],"kind":"PACKAGING","multipack":false}'::jsonb, now(), now()),
    (md5(random()::text || clock_timestamp()::text || '粒'), 'purchase_unit', '粒', '粒', 180, TRUE, '{"baseUnits":["G","PCS"],"aliases":[],"kind":"PACKAGING","multipack":false}'::jsonb, now(), now()),
    (md5(random()::text || clock_timestamp()::text || '斤'), 'purchase_unit', '斤', '斤', 200, TRUE, '{"baseUnits":["G"],"aliases":["市斤"],"kind":"MEASUREMENT","multipack":false}'::jsonb, now(), now()),
    (md5(random()::text || clock_timestamp()::text || '两'), 'purchase_unit', '两', '两', 210, TRUE, '{"baseUnits":["G"],"aliases":[],"kind":"MEASUREMENT","multipack":false}'::jsonb, now(), now()),
    (md5(random()::text || clock_timestamp()::text || 'kg'), 'purchase_unit', 'kg', 'kg', 220, TRUE, '{"baseUnits":["G"],"aliases":["公斤","千克","KG","Kg","kilogram"],"kind":"MEASUREMENT","multipack":false}'::jsonb, now(), now()),
    (md5(random()::text || clock_timestamp()::text || 'g'), 'purchase_unit', 'g', 'g', 230, TRUE, '{"baseUnits":["G"],"aliases":["克","G","gram"],"kind":"MEASUREMENT","multipack":false}'::jsonb, now(), now()),
    (md5(random()::text || clock_timestamp()::text || '吨'), 'purchase_unit', '吨', '吨', 240, TRUE, '{"baseUnits":["G"],"aliases":["t","ton"],"kind":"MEASUREMENT","multipack":false}'::jsonb, now(), now()),
    (md5(random()::text || clock_timestamp()::text || 'L'), 'purchase_unit', 'L', 'L', 250, TRUE, '{"baseUnits":["ML"],"aliases":["升","l","liter","litre"],"kind":"MEASUREMENT","multipack":false}'::jsonb, now(), now()),
    (md5(random()::text || clock_timestamp()::text || 'ml'), 'purchase_unit', 'ml', 'ml', 260, TRUE, '{"baseUnits":["ML"],"aliases":["毫升","ML","mL"],"kind":"MEASUREMENT","multipack":false}'::jsonb, now(), now());
END $$;
