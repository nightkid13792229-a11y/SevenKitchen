-- 2026-11-28 营养标准统一到 FEDIAF 2025（老板定）
--
-- 背景：小程序/后台的背书卡现在只认 FEDIAF_2025（其他代码不再翻译，
-- 也不再回显原码）。存量食谱里还留着 FEDIAF_2021 / FEDIAF_2024 等历史值，
-- 不统一的话顾客看不到「符合 FEDIAF 2025」背书卡。
--
-- 影响面：只改 recipe 表（食谱真源）与该列默认值。
-- 历史交付快照、订单快照保持原样 —— 已经交付/下单的单据不追溯改写。
--
-- 回滚（需先按部署记录做 pg_dump 备份）：
--   把曾经的值从备份里恢复，或逐条改回（本迁移不可逆地覆盖了原值）。

ALTER TABLE "recipe"
  ALTER COLUMN "nutrition_standard" SET DEFAULT 'FEDIAF_2025';

UPDATE "recipe"
SET "nutrition_standard" = 'FEDIAF_2025'
WHERE "nutrition_standard" IS DISTINCT FROM 'FEDIAF_2025';
