-- 2026-11-05 为「停用」的历史渠道补上字典项（第二步）
--
-- 老板 2026-11-05 确认：美菜网、批发市场、阿里健康大药房不再作为采购渠道，
-- 但历史单据里还有这些写法。按设计（D8）它们必须能在字典里查到，
-- 只是 enabled = false：历史照常显示，员工以后选不到。
--
-- 生产库第一步迁移时已经有过这几项（历史值导入），这里用 ON CONFLICT 保证幂等；
-- 全新库靠这条迁移补齐。

INSERT INTO "platform_option_item"
  ("id", "set_id", "code", "label", "sort_order", "enabled", "extra", "created_at", "updated_at")
VALUES
  (md5(random()::text || clock_timestamp()::text), 'purchase_channel', '美菜网', '美菜网', 300, FALSE, NULL, now(), now()),
  (md5(random()::text || clock_timestamp()::text), 'purchase_channel', '批发市场', '批发市场', 310, FALSE, NULL, now(), now()),
  (md5(random()::text || clock_timestamp()::text), 'purchase_channel', '阿里健康大药房', '阿里健康大药房', 320, FALSE, NULL, now(), now())
ON CONFLICT ("set_id", "code") DO UPDATE
SET "enabled" = FALSE,
    "updated_at" = now();
