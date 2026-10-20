-- 2026-10-20 多份购买 · 第一阶段：价格与配置
--
-- 全部为新增列，不改既有列：
--   · custom_recipe_config：多份开关、份数上限、优惠档位、设计工时
--   · custom_recipe_order：份数、主蛋白偏好、价格/折扣快照
-- 老订单的份数默认 1、折扣默认 0，金额与状态不变。

-- AlterTable
ALTER TABLE "custom_recipe_order" ADD COLUMN     "discount_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "discount_rate" DECIMAL(5,4) NOT NULL DEFAULT 0,
ADD COLUMN     "original_amount" DECIMAL(10,2) NOT NULL DEFAULT 300,
ADD COLUMN     "pricing_snapshot" JSONB,
ADD COLUMN     "recipe_quantity" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "requested_protein_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "unit_amount" DECIMAL(10,2) NOT NULL DEFAULT 300;

-- AlterTable
ALTER TABLE "custom_recipe_config" ADD COLUMN     "daily_design_minutes" INTEGER NOT NULL DEFAULT 480,
ADD COLUMN     "max_recipe_quantity" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "minutes_per_recipe" INTEGER NOT NULL DEFAULT 96,
ADD COLUMN     "multi_recipe_discounts" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "multi_recipe_enabled" BOOLEAN NOT NULL DEFAULT false;
