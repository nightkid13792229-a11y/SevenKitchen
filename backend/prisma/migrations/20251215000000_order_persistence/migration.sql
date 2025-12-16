-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('INIT', 'PENDING_PAYMENT', 'PAID', 'WAITING_FOR_PRODUCTION', 'IN_PRODUCTION', 'READY_FOR_PACKAGING', 'READY_FOR_SHIPMENT', 'SHIPPED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('FRESH_FOOD', 'CUSTOM_SERVICE');

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "type" "OrderType" NOT NULL,
    "target_production_date" TIMESTAMP(3),
    "amount_product" DECIMAL(65,30) NOT NULL,
    "amount_shipping" DECIMAL(65,30) NOT NULL,
    "amount_total" DECIMAL(65,30) NOT NULL,
    "total_amount" DECIMAL(65,30),
    "pricing_breakdown_snapshot" JSONB,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "recipe_snapshot" JSONB NOT NULL,
    "quantity_g" DOUBLE PRECISION NOT NULL,
    "package_count" INTEGER NOT NULL,
    "package_spec_g" INTEGER NOT NULL,
    "custom_requirements" TEXT,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Order_customer_id_idx" ON "Order"("customer_id");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "OrderItem_order_id_idx" ON "OrderItem"("order_id");

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

