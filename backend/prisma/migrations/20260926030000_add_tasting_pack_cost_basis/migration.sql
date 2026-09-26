-- 试吃装定价的成本基数（后台可切换）
--
-- 现货有个绕不开的选择：货是前几天按当时的价格做好的，
-- 售价可以按「今天的原料价」算，也可以按「这批货实际花了多少钱」算。
--
--   LIVE        按今天的原料价实时算 —— 原料涨价，售价跟着涨
--   STOCK_BATCH 按库存里那批货的实际成本算 —— 原料涨跌不影响已做好的库存
--
-- 两种口径各有各的道理（前者跟得上成本，后者毛利稳定），
-- 所以做成后台可切换，而不是写死在代码里 —— 改口径不该发版。
--
-- 默认 LIVE（按今天的原料价），与"改口径时业务方当前的选择"一致。
--
-- 只新增枚举值与列，不改动既有数据，可安全重跑。

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TastingPackCostBasis') THEN
        CREATE TYPE "TastingPackCostBasis" AS ENUM ('LIVE', 'STOCK_BATCH');
    END IF;
END
$$;

ALTER TABLE "tasting_pack_config"
    ADD COLUMN IF NOT EXISTS "cost_basis_mode" "TastingPackCostBasis" NOT NULL DEFAULT 'LIVE';
