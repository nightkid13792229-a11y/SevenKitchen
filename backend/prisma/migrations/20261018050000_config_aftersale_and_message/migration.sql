-- 配置页「5 加」里缺的 3 个字段（2026-10-18）
--
-- 依据：
--   V24「交付前可以无理由全额退，交付后就只能调整食谱」（不设天数 → 用开关）
--   V44「售后单超过 48 小时未处理，后台待办标红（时长可配）」
--   2.8.4「消息中心开关」
--
-- 全部是**加列 + 给默认值**，不动已有数据、不改已有列类型。
ALTER TABLE "custom_recipe_config"
  ADD COLUMN "aftersale_overdue_hours" INTEGER NOT NULL DEFAULT 48,
  ADD COLUMN "allow_refund_before_delivery" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "message_center_enabled" BOOLEAN NOT NULL DEFAULT true;
