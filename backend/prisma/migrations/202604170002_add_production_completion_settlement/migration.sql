ALTER TYPE "InventorySourceType" ADD VALUE IF NOT EXISTS 'PRODUCTION_ALLOCATION_CONSUMPTION';
ALTER TYPE "InventorySourceType" ADD VALUE IF NOT EXISTS 'PRODUCTION_SURPLUS';

ALTER TABLE "packaging_unit"
  ADD COLUMN "result_status" VARCHAR(20),
  ADD COLUMN "actual_output_g" DOUBLE PRECISION,
  ADD COLUMN "surplus_g" DOUBLE PRECISION,
  ADD COLUMN "shortage_g" DOUBLE PRECISION,
  ADD COLUMN "result_photo_urls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "completed_at" TIMESTAMP(3);

ALTER TABLE "production_batch"
  ADD COLUMN "planned_output_g" DOUBLE PRECISION,
  ADD COLUMN "actual_output_g" DOUBLE PRECISION,
  ADD COLUMN "surplus_g" DOUBLE PRECISION,
  ADD COLUMN "shortage_g" DOUBLE PRECISION,
  ADD COLUMN "actual_cost" DECIMAL(10, 2),
  ADD COLUMN "cost_settlement_snapshot" JSONB,
  ADD COLUMN "completed_at" TIMESTAMP(3);

ALTER TABLE "inventory_ledger_entry"
  ADD COLUMN "cost_amount" DECIMAL(10, 2);

CREATE TABLE "production_batch_cost_settlement" (
  "id" TEXT NOT NULL,
  "production_batch_id" TEXT NOT NULL,
  "planned_output_g" DOUBLE PRECISION NOT NULL,
  "actual_output_g" DOUBLE PRECISION NOT NULL,
  "surplus_g" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "shortage_g" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "inventory_cost" DECIMAL(10, 2) NOT NULL DEFAULT 0,
  "purchase_cost" DECIMAL(10, 2) NOT NULL DEFAULT 0,
  "loss_cost" DECIMAL(10, 2) NOT NULL DEFAULT 0,
  "total_actual_cost" DECIMAL(10, 2) NOT NULL DEFAULT 0,
  "suggested_refund_amount" DECIMAL(10, 2) NOT NULL DEFAULT 0,
  "snapshot" JSONB NOT NULL,
  "settled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "production_batch_cost_settlement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "order_cost_settlement" (
  "id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "production_batch_settlement_id" TEXT NOT NULL,
  "planned_output_g" DOUBLE PRECISION NOT NULL,
  "actual_output_g" DOUBLE PRECISION NOT NULL,
  "shortage_g" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "estimated_cost" DECIMAL(10, 2) NOT NULL DEFAULT 0,
  "actual_cost" DECIMAL(10, 2) NOT NULL DEFAULT 0,
  "revenue" DECIMAL(10, 2) NOT NULL DEFAULT 0,
  "actual_margin" DECIMAL(10, 2) NOT NULL DEFAULT 0,
  "suggested_adjustment_amount" DECIMAL(10, 2) NOT NULL DEFAULT 0,
  "requires_customer_payment" BOOLEAN NOT NULL DEFAULT false,
  "snapshot" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_cost_settlement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "production_batch_cost_settlement_production_batch_id_key"
  ON "production_batch_cost_settlement"("production_batch_id");

CREATE INDEX "production_batch_cost_settlement_settled_at_idx"
  ON "production_batch_cost_settlement"("settled_at");

CREATE UNIQUE INDEX "order_cost_settlement_order_id_production_batch_settlement_id_key"
  ON "order_cost_settlement"("order_id", "production_batch_settlement_id");

CREATE INDEX "order_cost_settlement_order_id_idx"
  ON "order_cost_settlement"("order_id");

CREATE INDEX "order_cost_settlement_production_batch_settlement_id_idx"
  ON "order_cost_settlement"("production_batch_settlement_id");

ALTER TABLE "production_batch_cost_settlement"
  ADD CONSTRAINT "production_batch_cost_settlement_production_batch_id_fkey"
  FOREIGN KEY ("production_batch_id") REFERENCES "production_batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_cost_settlement"
  ADD CONSTRAINT "order_cost_settlement_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_cost_settlement"
  ADD CONSTRAINT "order_cost_settlement_production_batch_settlement_id_fkey"
  FOREIGN KEY ("production_batch_settlement_id") REFERENCES "production_batch_cost_settlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
