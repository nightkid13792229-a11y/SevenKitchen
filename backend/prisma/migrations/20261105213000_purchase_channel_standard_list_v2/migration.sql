-- 2026-11-05 采购渠道标准清单调整（第二步 · 字典部分）
--
-- 老板 2026-11-05 定稿：
--   1. 保留「自制」「朴朴超市」为正式渠道（原来只是历史值，处于停用状态）；
--   2. 「满彭超市」改名「满彭菜场」（该渠道在业务表里还没有任何一行用过，改名不影响数据）。
--
-- 全新库由 registry 的 seed 直接生成 19 项；这里只处理已有库。

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "platform_option_set" WHERE "code" = 'purchase_channel'
  ) THEN
    RETURN;
  END IF;

  -- 1) 满彭超市 → 满彭菜场（码与显示名一起改；无历史数据引用）
  UPDATE "platform_option_item"
  SET "code" = '满彭菜场',
      "label" = '满彭菜场',
      "extra" = '{"aliases":["满彭","满彭超市"]}'::jsonb,
      "enabled" = TRUE,
      "updated_at" = now()
  WHERE "set_id" = 'purchase_channel' AND "code" = '满彭超市';

  -- 2) 自制 / 朴朴超市 转为正式渠道
  INSERT INTO "platform_option_item"
    ("id", "set_id", "code", "label", "sort_order", "enabled", "extra", "created_at", "updated_at")
  VALUES
    (md5(random()::text || clock_timestamp()::text), 'purchase_channel', '自制', '自制', 180, TRUE,
     '{"aliases":["自家做","自己做的"]}'::jsonb, now(), now()),
    (md5(random()::text || clock_timestamp()::text), 'purchase_channel', '朴朴超市', '朴朴超市', 190, TRUE,
     '{"aliases":["朴朴"]}'::jsonb, now(), now())
  ON CONFLICT ("set_id", "code") DO UPDATE
  SET "label" = EXCLUDED."label",
      "sort_order" = EXCLUDED."sort_order",
      "enabled" = TRUE,
      "extra" = EXCLUDED."extra",
      "updated_at" = now();
END $$;
