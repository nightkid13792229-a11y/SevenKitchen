CREATE TABLE "order_settlement_adjustment" (
  "id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "source_type" VARCHAR(40) NOT NULL,
  "source_id" VARCHAR(80),
  "adjustment_type" VARCHAR(40) NOT NULL,
  "amount" DECIMAL(10, 2) NOT NULL,
  "reason" VARCHAR(200) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  "requires_customer_payment" BOOLEAN NOT NULL DEFAULT false,
  "visible_to_customer" BOOLEAN NOT NULL DEFAULT true,
  "created_by" VARCHAR(20) NOT NULL DEFAULT 'system',
  "created_by_id" VARCHAR(80),
  "metadata" JSONB,
  "settled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_settlement_adjustment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "order_settlement_adjustment_order_id_source_type_source_id_key"
  ON "order_settlement_adjustment"("order_id", "source_type", "source_id");

CREATE INDEX "order_settlement_adjustment_order_id_status_idx"
  ON "order_settlement_adjustment"("order_id", "status");

CREATE INDEX "order_settlement_adjustment_created_at_idx"
  ON "order_settlement_adjustment"("created_at");

ALTER TABLE "order_settlement_adjustment"
  ADD CONSTRAINT "order_settlement_adjustment_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
