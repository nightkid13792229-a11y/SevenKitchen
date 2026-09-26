-- 试吃装设置（单例）
--
-- 背景：试吃装是"提前做好、现货发售"的第二条鲜食产品线。它的价格由
-- 「5 道菜合并成本 × 试吃倍率」自动算出（见 PricingService.calculateTastingPackPrice），
-- 而不是人工填价。倍率、限购、补货阈值这些参数会随成本与销量反复调整，
-- 必须解耦到后台「试吃装设置」，否则每次调价都要改代码发版。
--
-- 沿用 supplement_shop_config 的单例模式：id 固定为 'singleton'。
--
-- 只新增表与枚举，不改动既有数据，可安全重跑（migrate deploy 幂等）。

-- 售价圆整规则。与 supplement_price_rounding_mode 分开命名：
-- 两条线的定价口径不同（补剂是加价倍率，试吃装是成本倍率），
-- 未来任何一方增加档位不应影响另一方。
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PriceRoundingMode') THEN
        CREATE TYPE "PriceRoundingMode" AS ENUM ('NONE', 'CEIL_TO_0_1', 'CEIL_TO_0_5', 'CEIL_TO_1');
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "tasting_pack_config" (
    "id" VARCHAR(255) NOT NULL DEFAULT 'singleton',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "tasting_multiplier" DECIMAL(6,3) NOT NULL DEFAULT 1.25,
    "price_rounding_mode" "PriceRoundingMode" NOT NULL DEFAULT 'CEIL_TO_1',
    "max_sets_per_order" INTEGER NOT NULL DEFAULT 5,
    "low_stock_threshold" INTEGER NOT NULL DEFAULT 10,
    "default_restock_sets" INTEGER NOT NULL DEFAULT 20,
    "shelf_life_months" INTEGER NOT NULL DEFAULT 6,
    "default_bags_per_recipe" INTEGER NOT NULL DEFAULT 2,
    "default_pack_spec_g" INTEGER NOT NULL DEFAULT 80,
    "allow_force_schedule" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasting_pack_config_pkey" PRIMARY KEY ("id")
);

-- 预置单例行，默认关闭总开关（与补剂商城同一策略：代码就绪但不影响线上）
INSERT INTO "tasting_pack_config" ("id", "updated_at")
VALUES ('singleton', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
