-- 2026-11-08：价格闸基准从「历史采购价中位数」改为「原料档案当前生效价」，
-- 阈值从 8% 放宽到 10%（与页面展示的涨跌口径一致）。
ALTER TABLE "global_config" ALTER COLUMN "ingredient_price_auto_approve_threshold" SET DEFAULT 0.10;

-- 生产库里这条配置是显式存的 0.08，改默认值不会生效，这里直接把 8% 迁到 10%。
UPDATE "global_config"
SET "ingredient_price_auto_approve_threshold" = 0.10
WHERE "ingredient_price_auto_approve_threshold" = 0.08;
