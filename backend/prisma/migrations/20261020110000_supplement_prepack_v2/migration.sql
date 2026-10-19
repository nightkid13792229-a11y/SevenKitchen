-- 预分装补剂 v2：排期/事件/售后/包材/库存来源

-- CreateEnum
CREATE TYPE "InventoryAllocationSourceType" AS ENUM ('PRODUCTION', 'SUPPLEMENT_PACK');

-- CreateEnum
CREATE TYPE "SupplementPackingDateSource" AS ENUM ('AUTO', 'ADMIN');

-- CreateEnum
CREATE TYPE "SupplementOrderEventType" AS ENUM ('SCHEDULED', 'RESCHEDULED', 'PACKED', 'FORCE_PACKED', 'SHIPPED', 'COMPLETED', 'CANCELLED', 'ADDRESS_CHANGED', 'REORDERED', 'AFTERSALE_CREATED', 'REFUNDED', 'RESHIPPED', 'SCHEDULE_FAILED');

-- CreateEnum
CREATE TYPE "AftersaleOrderType" AS ENUM ('FOOD', 'CUSTOM_RECIPE', 'SUPPLEMENT');

-- CreateEnum
CREATE TYPE "AftersaleCaseStatus" AS ENUM ('PENDING', 'PROCESSING', 'RESOLVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AftersaleRequestType" AS ENUM ('REFUND', 'RESHIP', 'OTHER');

-- CreateEnum
CREATE TYPE "AftersaleResolutionType" AS ENUM ('REFUND', 'RESHIP', 'REGISTER_ONLY', 'REJECT');

-- CreateEnum
CREATE TYPE "SupplementPackagingRole" AS ENUM ('POUCH', 'DESICCANT', 'LABEL');

-- AlterEnum
ALTER TYPE "InventorySourceType" ADD VALUE 'SUPPLEMENT_PACK_CONSUMPTION';

-- AlterTable
ALTER TABLE "inventory_allocation" ADD COLUMN     "source_type" "InventoryAllocationSourceType" NOT NULL DEFAULT 'PRODUCTION';

-- AlterTable
ALTER TABLE "diy_sheet" ADD COLUMN     "recipe_version" INTEGER,
ADD COLUMN     "snapshot" JSONB,
ADD COLUMN     "snapshot_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "supplement_shop_config" ADD COLUMN     "aftersale_window_days" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "auto_complete_days" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "auto_schedule_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "daily_cutoff_time" VARCHAR(5) NOT NULL DEFAULT '17:00',
ADD COLUMN     "daily_packing_capacity" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "free_service_threshold" DECIMAL(10,2) DEFAULT 99.00;

-- AlterTable
ALTER TABLE "supplement_order" ADD COLUMN     "packing_date" DATE,
ADD COLUMN     "packing_date_source" "SupplementPackingDateSource" NOT NULL DEFAULT 'AUTO',
ADD COLUMN     "reorder_from_order_no" VARCHAR(32);

-- CreateTable
CREATE TABLE "supplement_order_event" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "type" "SupplementOrderEventType" NOT NULL,
    "from_value" VARCHAR(64),
    "to_value" VARCHAR(64),
    "actor_type" VARCHAR(20) NOT NULL,
    "actor_id" TEXT,
    "reason" VARCHAR(500),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplement_order_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aftersale_case" (
    "id" TEXT NOT NULL,
    "case_no" VARCHAR(32) NOT NULL,
    "order_type" "AftersaleOrderType" NOT NULL,
    "order_id" VARCHAR(36) NOT NULL,
    "order_no" VARCHAR(32),
    "customer_id" TEXT NOT NULL,
    "status" "AftersaleCaseStatus" NOT NULL DEFAULT 'PENDING',
    "request_type" "AftersaleRequestType" NOT NULL,
    "requested_reason" VARCHAR(500) NOT NULL,
    "requested_photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" VARCHAR(20) NOT NULL DEFAULT 'CUSTOMER',
    "handler_id" TEXT,
    "handling_note" VARCHAR(1000),
    "resolution_type" "AftersaleResolutionType",
    "refund_amount" DECIMAL(10,2),
    "refund_status" VARCHAR(20),
    "refund_out_no" VARCHAR(64),
    "refund_id" VARCHAR(64),
    "refund_requested_at" TIMESTAMP(3),
    "refunded_at" TIMESTAMP(3),
    "reship_order_id" VARCHAR(36),
    "reship_order_no" VARCHAR(32),
    "accepted_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aftersale_case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplement_packaging_rule" (
    "id" TEXT NOT NULL,
    "role" "SupplementPackagingRole" NOT NULL,
    "ingredient_id" TEXT NOT NULL,
    "physical_form" "IngredientPhysicalForm",
    "unit_pattern" VARCHAR(20),
    "min_amount" DOUBLE PRECISION,
    "max_amount" DOUBLE PRECISION,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "note" VARCHAR(200),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplement_packaging_rule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplement_order_event_order_id_created_at_idx" ON "supplement_order_event"("order_id", "created_at");

-- CreateIndex
CREATE INDEX "supplement_order_event_type_created_at_idx" ON "supplement_order_event"("type", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "aftersale_case_case_no_key" ON "aftersale_case"("case_no");

-- CreateIndex
CREATE UNIQUE INDEX "aftersale_case_refund_out_no_key" ON "aftersale_case"("refund_out_no");

-- CreateIndex
CREATE INDEX "aftersale_case_order_type_order_id_idx" ON "aftersale_case"("order_type", "order_id");

-- CreateIndex
CREATE INDEX "aftersale_case_customer_id_created_at_idx" ON "aftersale_case"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "aftersale_case_status_created_at_idx" ON "aftersale_case"("status", "created_at");

-- CreateIndex
CREATE INDEX "supplement_packaging_rule_role_enabled_priority_idx" ON "supplement_packaging_rule"("role", "enabled", "priority");

-- CreateIndex
CREATE INDEX "supplement_packaging_rule_ingredient_id_idx" ON "supplement_packaging_rule"("ingredient_id");

-- CreateIndex
CREATE INDEX "inventory_allocation_source_type_status_idx" ON "inventory_allocation"("source_type", "status");

-- CreateIndex
CREATE INDEX "supplement_order_packing_date_status_idx" ON "supplement_order"("packing_date", "status");

-- CreateIndex
CREATE INDEX "supplement_order_reorder_from_order_no_idx" ON "supplement_order"("reorder_from_order_no");

-- AddForeignKey
ALTER TABLE "supplement_order_event" ADD CONSTRAINT "supplement_order_event_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "supplement_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplement_packaging_rule" ADD CONSTRAINT "supplement_packaging_rule_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- 同一订单只允许一条未完结售后（Prisma schema 无法表达部分唯一索引）
CREATE UNIQUE INDEX "aftersale_case_one_open_per_order"
ON "aftersale_case" ("order_type", "order_id")
WHERE "status" IN ('PENDING'::"AftersaleCaseStatus", 'PROCESSING'::"AftersaleCaseStatus");
