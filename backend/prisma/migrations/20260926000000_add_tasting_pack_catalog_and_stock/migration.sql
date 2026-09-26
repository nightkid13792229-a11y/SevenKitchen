-- 试吃装商品 + 成品库存
--
-- 背景：试吃装是"提前做好、现货发售"的产品线 —— 顾客下单只扣库存，不排产。
-- 系统原先**只有原料库存**（inventory_ledger_entry，按克），
-- 没有任何"做好的成品"库存概念，所以这里要新建一整套。
--
-- 三张新表：
--   tasting_pack              商品（挑哪几道菜、规格、上架状态、手动定价覆盖）
--   tasting_pack_item         商品里的菜品（存业务键 recipe_id + 展示快照）
--   tasting_pack_stock_batch  成品库存批次（生产日期、到期日、入库/剩余套数、单套成本）
--   tasting_pack_stock_ledger 库存流水（入库/下单占用/释放/人工调整/过期）
--
-- 扣减规则：先到期先出（FIFO by expires_at）；每笔变动都写流水，可对账可追溯。
--
-- 只新增表与枚举，不改动既有数据，可安全重跑。

-- ---- 枚举 ----
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TastingPackStatus') THEN
        CREATE TYPE "TastingPackStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TastingPackStockStatus') THEN
        CREATE TYPE "TastingPackStockStatus" AS ENUM ('AVAILABLE', 'DEPLETED', 'EXPIRED', 'VOID');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TastingPackStockReason') THEN
        CREATE TYPE "TastingPackStockReason" AS ENUM ('STOCK_IN', 'ORDER_RESERVE', 'ORDER_RELEASE', 'MANUAL_ADJUST', 'EXPIRE');
    END IF;
END
$$;

-- ---- 商品 ----
CREATE TABLE IF NOT EXISTS "tasting_pack" (
    "id" VARCHAR(255) NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "subtitle" VARCHAR(200),
    "cover_image_url" TEXT,
    "detail_images" JSONB,
    "status" "TastingPackStatus" NOT NULL DEFAULT 'DRAFT',
    "bags_per_recipe" INTEGER NOT NULL DEFAULT 2,
    "pack_spec_g" INTEGER NOT NULL DEFAULT 80,
    "manual_price" DECIMAL(10,2),
    "max_sets_override" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasting_pack_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tasting_pack_code_key" ON "tasting_pack"("code");
CREATE INDEX IF NOT EXISTS "tasting_pack_status_idx" ON "tasting_pack"("status");
CREATE INDEX IF NOT EXISTS "tasting_pack_sort_order_idx" ON "tasting_pack"("sort_order");

-- ---- 商品里的菜品 ----
CREATE TABLE IF NOT EXISTS "tasting_pack_item" (
    "id" VARCHAR(255) NOT NULL,
    "tasting_pack_id" TEXT NOT NULL,
    "recipe_id" TEXT NOT NULL,
    "recipe_snapshot" JSONB NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tasting_pack_item_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tasting_pack_item_tasting_pack_id_recipe_id_key"
    ON "tasting_pack_item"("tasting_pack_id", "recipe_id");
CREATE INDEX IF NOT EXISTS "tasting_pack_item_recipe_id_idx" ON "tasting_pack_item"("recipe_id");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasting_pack_item_tasting_pack_id_fkey') THEN
        ALTER TABLE "tasting_pack_item"
            ADD CONSTRAINT "tasting_pack_item_tasting_pack_id_fkey"
            FOREIGN KEY ("tasting_pack_id") REFERENCES "tasting_pack"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$$;

-- ---- 成品库存批次 ----
CREATE TABLE IF NOT EXISTS "tasting_pack_stock_batch" (
    "id" VARCHAR(255) NOT NULL,
    "batch_no" VARCHAR(32) NOT NULL,
    "tasting_pack_id" TEXT NOT NULL,
    "produced_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "quantity_total" INTEGER NOT NULL,
    "quantity_remaining" INTEGER NOT NULL,
    "unit_cost" DECIMAL(10,2),
    "status" "TastingPackStockStatus" NOT NULL DEFAULT 'AVAILABLE',
    "note" VARCHAR(200),
    "production_plan_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasting_pack_stock_batch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tasting_pack_stock_batch_batch_no_key"
    ON "tasting_pack_stock_batch"("batch_no");
CREATE INDEX IF NOT EXISTS "tasting_pack_stock_batch_pack_status_expires_idx"
    ON "tasting_pack_stock_batch"("tasting_pack_id", "status", "expires_at");
CREATE INDEX IF NOT EXISTS "tasting_pack_stock_batch_production_plan_id_idx"
    ON "tasting_pack_stock_batch"("production_plan_id");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasting_pack_stock_batch_tasting_pack_id_fkey') THEN
        ALTER TABLE "tasting_pack_stock_batch"
            ADD CONSTRAINT "tasting_pack_stock_batch_tasting_pack_id_fkey"
            FOREIGN KEY ("tasting_pack_id") REFERENCES "tasting_pack"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$$;

-- ---- 库存流水 ----
CREATE TABLE IF NOT EXISTS "tasting_pack_stock_ledger" (
    "id" VARCHAR(255) NOT NULL,
    "tasting_pack_id" TEXT NOT NULL,
    "batch_id" TEXT,
    "delta" INTEGER NOT NULL,
    "reason" "TastingPackStockReason" NOT NULL,
    "order_id" TEXT,
    "note" VARCHAR(200),
    "operator_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tasting_pack_stock_ledger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "tasting_pack_stock_ledger_pack_created_idx"
    ON "tasting_pack_stock_ledger"("tasting_pack_id", "created_at");
CREATE INDEX IF NOT EXISTS "tasting_pack_stock_ledger_batch_id_idx"
    ON "tasting_pack_stock_ledger"("batch_id");
CREATE INDEX IF NOT EXISTS "tasting_pack_stock_ledger_order_id_idx"
    ON "tasting_pack_stock_ledger"("order_id");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasting_pack_stock_ledger_tasting_pack_id_fkey') THEN
        ALTER TABLE "tasting_pack_stock_ledger"
            ADD CONSTRAINT "tasting_pack_stock_ledger_tasting_pack_id_fkey"
            FOREIGN KEY ("tasting_pack_id") REFERENCES "tasting_pack"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasting_pack_stock_ledger_batch_id_fkey') THEN
        ALTER TABLE "tasting_pack_stock_ledger"
            ADD CONSTRAINT "tasting_pack_stock_ledger_batch_id_fkey"
            FOREIGN KEY ("batch_id") REFERENCES "tasting_pack_stock_batch"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END
$$;
