-- 补剂商城配置（单例表）
-- 设计文档：docs/plans/2026-09-18-supplement-shop-design.md
--
-- 刻意与鲜食的 global_config 解耦：补剂的加价倍率、分装服务费、运费策略独立可调。
-- enabled 默认 false —— 配置好之前商城不对外开放。

CREATE TYPE "SupplementServiceFeeMode" AS ENUM ('PER_ORDER', 'PER_BAG');
CREATE TYPE "SupplementPriceRoundingMode" AS ENUM ('NONE', 'CEIL_TO_0_1', 'CEIL_TO_0_5', 'CEIL_TO_1');
CREATE TYPE "SupplementShippingMode" AS ENUM ('FLAT_RATE', 'TEMPLATE');

CREATE TABLE "supplement_shop_config" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "markup_multiplier" DECIMAL(6,2) NOT NULL DEFAULT 2.0,
    "service_fee_mode" "SupplementServiceFeeMode" NOT NULL DEFAULT 'PER_ORDER',
    "service_fee_amount" DECIMAL(10,2) NOT NULL DEFAULT 9.9,
    "packaging_fee_per_bag" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "price_rounding_mode" "SupplementPriceRoundingMode" NOT NULL DEFAULT 'CEIL_TO_0_1',
    "min_order_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "round_up_usage" BOOLEAN NOT NULL DEFAULT true,
    "shipping_mode" "SupplementShippingMode" NOT NULL DEFAULT 'FLAT_RATE',
    "flat_shipping_fee" DECIMAL(10,2) NOT NULL DEFAULT 8.0,
    "shipping_template_id" TEXT,
    "free_shipping_threshold" DECIMAL(10,2),
    "powder_shelf_life_months" INTEGER NOT NULL DEFAULT 6,
    "solid_shelf_life_months" INTEGER NOT NULL DEFAULT 9,
    "min_remaining_shelf_life_days" INTEGER NOT NULL DEFAULT 90,
    "aftersale_policy" VARCHAR(200),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplement_shop_config_pkey" PRIMARY KEY ("id")
);
