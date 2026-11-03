-- 补剂订单（独立于鲜食订单）
-- 设计文档：docs/plans/2026-09-18-supplement-shop-design.md
--
-- 金额与定价配置在下单时快照，之后调整「补剂商城设置」不会影响历史订单。
-- 一个补剂 = 一袋（按品种分装），分装结果（批号/原瓶到期日/标签效期）直接记在订单行上。

CREATE TYPE "SupplementOrderStatus" AS ENUM (
  'PENDING_PAYMENT',
  'PAID',
  'PACKING',
  'PACKED',
  'SHIPPED',
  'COMPLETED',
  'CANCELLED',
  'AFTERSALE'
);

CREATE TABLE "supplement_order" (
    "id" TEXT NOT NULL,
    "order_no" VARCHAR(32) NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "SupplementOrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "bag_count" INTEGER NOT NULL,
    "amount_supplement" DECIMAL(10,2) NOT NULL,
    "amount_service_fee" DECIMAL(10,2) NOT NULL,
    "amount_packaging" DECIMAL(10,2) NOT NULL,
    "amount_goods" DECIMAL(10,2) NOT NULL,
    "amount_shipping" DECIMAL(10,2) NOT NULL,
    "amount_total" DECIMAL(10,2) NOT NULL,
    "supplement_cost" DECIMAL(10,2) NOT NULL,
    "shipping_description" VARCHAR(200),
    "pricing_snapshot" JSONB,
    "shipping_address_snapshot" JSONB NOT NULL,
    "recipe_id" TEXT,
    "recipe_name" VARCHAR(200),
    "dog_id" TEXT,
    "dog_name" VARCHAR(100),
    "diy_sheet_id" TEXT,
    "cycle_days" INTEGER,
    "remark" VARCHAR(500),
    "payment_method" VARCHAR(20),
    "payment_status" VARCHAR(20),
    "transaction_id" VARCHAR(64),
    "paid_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancellation_reason" VARCHAR(200),
    "tracking_number" VARCHAR(64),
    "carrier_code" VARCHAR(40),
    "shipped_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplement_order_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "supplement_order_order_no_key" ON "supplement_order"("order_no");
CREATE INDEX "supplement_order_user_id_created_at_idx" ON "supplement_order"("user_id", "created_at");
CREATE INDEX "supplement_order_status_created_at_idx" ON "supplement_order"("status", "created_at");

ALTER TABLE "supplement_order"
  ADD CONSTRAINT "supplement_order_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "supplement_order_item" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "ingredient_id" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "brand" VARCHAR(100),
    "product_model" VARCHAR(200),
    "physical_form" "IngredientPhysicalForm",
    "unit" VARCHAR(20) NOT NULL,
    "requested_amount" DOUBLE PRECISION NOT NULL,
    "packed_amount" DOUBLE PRECISION NOT NULL,
    "unit_cost" DECIMAL(12,6) NOT NULL,
    "cost" DECIMAL(10,2) NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "bags" INTEGER NOT NULL DEFAULT 1,
    "shelf_life_months" INTEGER NOT NULL,
    "batch_no" VARCHAR(40),
    "source_expiry_date" TIMESTAMP(3),
    "packed_expiry_date" TIMESTAMP(3),
    "packed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplement_order_item_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "supplement_order_item_order_id_idx" ON "supplement_order_item"("order_id");

ALTER TABLE "supplement_order_item"
  ADD CONSTRAINT "supplement_order_item_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "supplement_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
