-- 试吃装备货生产
--
-- 背景：现货要提前做一批放库存里，但系统原先**只有订单驱动的生产** ——
-- 没有顾客订单就生成不了生产批次、也生成不了采购清单。
-- 本次补上那条"没有订单也能生产"的通路：
--
--   备货生产单 → 原料需求 → 采购清单 → 排产 → 生产分装 → 完工入库
--
-- 新增：
--   tasting_pack_production_plan   备货生产单（含用料快照与每道菜的产量计划）
--   production_batch.source        区分"订单批次"与"备货批次"
--   packaging_unit.stock_portion_plan  备货批次的分装计划（订单批次仍看订单）
--   purchase_list.source_tasting_pack_plan_id  备货采购单的来源回溯
--
-- 只新增表、枚举值与可空列，不改动既有数据，可安全重跑。

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TastingPackProductionPlanStatus') THEN
        CREATE TYPE "TastingPackProductionPlanStatus" AS ENUM ('PLANNED', 'PURCHASING', 'SCHEDULED', 'COMPLETED', 'STOCKED', 'CANCELLED');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProductionBatchSource') THEN
        CREATE TYPE "ProductionBatchSource" AS ENUM ('ORDER', 'STOCK');
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "tasting_pack_production_plan" (
    "id" VARCHAR(255) NOT NULL,
    "plan_no" VARCHAR(32) NOT NULL,
    "tasting_pack_id" TEXT NOT NULL,
    "sets" INTEGER NOT NULL,
    "planned_date" TIMESTAMP(3) NOT NULL,
    "status" "TastingPackProductionPlanStatus" NOT NULL DEFAULT 'PLANNED',
    "ingredient_requirement_snapshot" JSONB NOT NULL,
    "dish_plan_snapshot" JSONB NOT NULL,
    "purchase_list_id" TEXT,
    "production_batch_id" TEXT,
    "stocked_sets" INTEGER,
    "stocked_at" TIMESTAMP(3),
    "cancelled_reason" VARCHAR(200),
    "note" VARCHAR(200),
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasting_pack_production_plan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tasting_pack_production_plan_plan_no_key"
    ON "tasting_pack_production_plan"("plan_no");
CREATE INDEX IF NOT EXISTS "tasting_pack_production_plan_pack_status_idx"
    ON "tasting_pack_production_plan"("tasting_pack_id", "status");
CREATE INDEX IF NOT EXISTS "tasting_pack_production_plan_planned_date_idx"
    ON "tasting_pack_production_plan"("planned_date");
CREATE INDEX IF NOT EXISTS "tasting_pack_production_plan_status_idx"
    ON "tasting_pack_production_plan"("status");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasting_pack_production_plan_tasting_pack_id_fkey') THEN
        ALTER TABLE "tasting_pack_production_plan"
            ADD CONSTRAINT "tasting_pack_production_plan_tasting_pack_id_fkey"
            FOREIGN KEY ("tasting_pack_id") REFERENCES "tasting_pack"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$$;

-- 批次来源：老数据一律视为订单批次
ALTER TABLE "production_batch"
    ADD COLUMN IF NOT EXISTS "source" "ProductionBatchSource" NOT NULL DEFAULT 'ORDER',
    ADD COLUMN IF NOT EXISTS "tasting_pack_production_plan_id" TEXT;

CREATE INDEX IF NOT EXISTS "production_batch_source_idx" ON "production_batch"("source");
CREATE INDEX IF NOT EXISTS "production_batch_tasting_pack_production_plan_id_idx"
    ON "production_batch"("tasting_pack_production_plan_id");

-- 备货批次的分装计划（订单批次为 null）
ALTER TABLE "packaging_unit"
    ADD COLUMN IF NOT EXISTS "stock_portion_plan" JSONB;

-- 采购清单来源
ALTER TABLE "purchase_list"
    ADD COLUMN IF NOT EXISTS "source_tasting_pack_plan_id" TEXT;

CREATE INDEX IF NOT EXISTS "purchase_list_source_tasting_pack_plan_id_idx"
    ON "purchase_list"("source_tasting_pack_plan_id");
