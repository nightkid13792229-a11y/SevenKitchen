-- 2026-11-05 采购渠道唯一来源（第一步）
--
-- 背景：渠道以前在四个地方各写一份 —— AI 提示词写死「山姆/盒马/沃尔玛/其他」、
-- 解析层再写死一次、匹配门禁只对这三家做归一、员工端用「历史上谁打过什么字」。
-- 于是「其他」永远匹配不到具体渠道的商品，员工只能一行行手选。
--
-- 这次改两件事：
--   1. 识别记录允许 channel = NULL，表示「AI 没认出来、等员工确认」，
--      不再用「其他」冒充一个真实渠道；
--   2. 把字典 purchase_channel 对齐到老板 2026-11-05 定的 17 项标准清单，
--      其余历史项**停用不删除**（历史记录里的文字不受影响，管理员可随时重新启用）。
--
-- 全新库没有这个选项集时不做事：初始内容由 prisma/seed-platform-options.ts
-- 按 option-sets.registry.ts 灌入（部署顺序是 migrate → seed）。

-- 1) 允许「渠道未确认」
ALTER TABLE "purchase_order_import" ALTER COLUMN "channel" DROP NOT NULL;

-- 2) 字典对齐（只在选项集已存在时执行）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "platform_option_set" WHERE "code" = 'purchase_channel'
  ) THEN
    RETURN;
  END IF;

  INSERT INTO "platform_option_item"
    ("id", "set_id", "code", "label", "sort_order", "enabled", "extra", "created_at", "updated_at")
  VALUES
    (md5(random()::text || clock_timestamp()::text), 'purchase_channel', '山姆会员店', '山姆会员店', 10, TRUE,
     '{"aliases":["山姆","山姆会员商店","Sam''s Club","Sams Club"]}'::jsonb, now(), now()),
    (md5(random()::text || clock_timestamp()::text), 'purchase_channel', '盒马鲜生', '盒马鲜生', 20, TRUE,
     '{"aliases":["盒马","盒马NB","盒马mini"]}'::jsonb, now(), now()),
    (md5(random()::text || clock_timestamp()::text), 'purchase_channel', '沃尔玛', '沃尔玛', 30, TRUE,
     '{"aliases":["沃尔玛超市","Walmart"]}'::jsonb, now(), now()),
    (md5(random()::text || clock_timestamp()::text), 'purchase_channel', '永辉', '永辉', 40, TRUE,
     '{"aliases":["永辉超市","Bravo永辉"]}'::jsonb, now(), now()),
    (md5(random()::text || clock_timestamp()::text), 'purchase_channel', '伊藤洋华堂', '伊藤洋华堂', 50, TRUE,
     '{"aliases":["伊藤","伊藤洋华堂超市"]}'::jsonb, now(), now()),
    (md5(random()::text || clock_timestamp()::text), 'purchase_channel', '农贸市场', '农贸市场', 60, TRUE,
     '{"aliases":["菜市场","菜场","生鲜市场","本地市场"]}'::jsonb, now(), now()),
    (md5(random()::text || clock_timestamp()::text), 'purchase_channel', '成都海吉星', '成都海吉星', 70, TRUE,
     '{"aliases":["海吉星","海吉星市场"]}'::jsonb, now(), now()),
    (md5(random()::text || clock_timestamp()::text), 'purchase_channel', '红旗连锁', '红旗连锁', 80, TRUE,
     '{"aliases":["红旗","红旗超市"]}'::jsonb, now(), now()),
    (md5(random()::text || clock_timestamp()::text), 'purchase_channel', '舞东风', '舞东风', 90, TRUE,
     '{"aliases":["舞东风超市"]}'::jsonb, now(), now()),
    (md5(random()::text || clock_timestamp()::text), 'purchase_channel', '满彭超市', '满彭超市', 100, TRUE,
     '{"aliases":["满彭"]}'::jsonb, now(), now()),
    (md5(random()::text || clock_timestamp()::text), 'purchase_channel', 'iHerb', 'iHerb', 110, TRUE,
     '{"aliases":["iherb","i-herb"]}'::jsonb, now(), now()),
    (md5(random()::text || clock_timestamp()::text), 'purchase_channel', '亚马逊国际', '亚马逊国际', 120, TRUE,
     '{"aliases":["亚马逊","Amazon","美亚"]}'::jsonb, now(), now()),
    (md5(random()::text || clock_timestamp()::text), 'purchase_channel', '淘宝/天猫', '淘宝/天猫', 130, TRUE,
     '{"aliases":["淘宝","天猫","天猫超市","淘宝网","taobao","tmall"]}'::jsonb, now(), now()),
    (md5(random()::text || clock_timestamp()::text), 'purchase_channel', '京东', '京东', 140, TRUE,
     '{"aliases":["京东商城","京东超市"]}'::jsonb, now(), now()),
    (md5(random()::text || clock_timestamp()::text), 'purchase_channel', '拼多多', '拼多多', 150, TRUE,
     '{"aliases":["拼夕夕","PDD"]}'::jsonb, now(), now()),
    (md5(random()::text || clock_timestamp()::text), 'purchase_channel', '抖音商城', '抖音商城', 160, TRUE,
     '{"aliases":["抖音","抖音超市"]}'::jsonb, now(), now()),
    (md5(random()::text || clock_timestamp()::text), 'purchase_channel', '微信小店', '微信小店', 170, TRUE,
     '{"aliases":["微信","视频号小店"]}'::jsonb, now(), now())
  ON CONFLICT ("set_id", "code") DO UPDATE
  SET "label" = EXCLUDED."label",
      "sort_order" = EXCLUDED."sort_order",
      "enabled" = TRUE,
      "extra" = EXCLUDED."extra",
      "updated_at" = now();

  -- 标准清单之外的旧项（例如历史遗留的「盒马」「线下批发市场」「宠物店」）停用。
  -- 不删除：删了以后历史记录里的这个码就查不到中文了，停用更稳。
  UPDATE "platform_option_item"
  SET "enabled" = FALSE,
      "updated_at" = now()
  WHERE "set_id" = 'purchase_channel'
    AND "code" NOT IN (
      '山姆会员店', '盒马鲜生', '沃尔玛', '永辉', '伊藤洋华堂', '农贸市场',
      '成都海吉星', '红旗连锁', '舞东风', '满彭超市', 'iHerb', '亚马逊国际',
      '淘宝/天猫', '京东', '拼多多', '抖音商城', '微信小店'
    );
END $$;
