-- 2026-11-05 采购记录保留「当时的渠道名称」（第二步 · 快照）
--
-- 老板 2026-11-05 定：渠道以后如果改名（只改 label），历史单据、报销明细、
-- 顾客看到的「实际采购」都应该还是当时的名字。
-- 所以记录上存两个东西：渠道码（对账/分组用）+ 当时的名称（展示用）。

ALTER TABLE "purchase_record"
  ADD COLUMN IF NOT EXISTS "purchase_channel_name" VARCHAR(64);

-- 历史行：用字典当前的名称回填（这一步之前没有改过名，等价于当时的名字）
UPDATE "purchase_record" r
SET "purchase_channel_name" = o."label"
FROM "platform_option_item" o
WHERE o."set_id" = 'purchase_channel'
  AND o."code" = r."purchase_channel"
  AND r."purchase_channel_name" IS NULL;
