CREATE TYPE "InventoryAllocationStatus" AS ENUM ('ACTIVE', 'RELEASED', 'CONSUMED');

CREATE TABLE "inventory_allocation" (
  "id" TEXT NOT NULL,
  "target_date" TIMESTAMP(3) NOT NULL,
  "status" "InventoryAllocationStatus" NOT NULL DEFAULT 'ACTIVE',
  "purchase_list_id" TEXT,
  "source_order_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "released_at" TIMESTAMP(3),
  "consumed_at" TIMESTAMP(3),
  CONSTRAINT "inventory_allocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory_allocation_line" (
  "id" TEXT NOT NULL,
  "allocation_id" TEXT NOT NULL,
  "ingredient_id" TEXT NOT NULL,
  "procurement_sku_id" VARCHAR(36),
  "quantity_g" DOUBLE PRECISION NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_allocation_line_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "inventory_allocation_target_date_idx"
  ON "inventory_allocation"("target_date");

CREATE INDEX "inventory_allocation_status_idx"
  ON "inventory_allocation"("status");

CREATE INDEX "inventory_allocation_purchase_list_id_idx"
  ON "inventory_allocation"("purchase_list_id");

CREATE UNIQUE INDEX "inventory_allocation_line_allocation_id_ingredient_id_key"
  ON "inventory_allocation_line"("allocation_id", "ingredient_id");

CREATE INDEX "inventory_allocation_line_ingredient_id_idx"
  ON "inventory_allocation_line"("ingredient_id");

CREATE INDEX "inventory_allocation_line_procurement_sku_id_idx"
  ON "inventory_allocation_line"("procurement_sku_id");

ALTER TABLE "inventory_allocation"
  ADD CONSTRAINT "inventory_allocation_purchase_list_id_fkey"
  FOREIGN KEY ("purchase_list_id") REFERENCES "purchase_list"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "inventory_allocation_line"
  ADD CONSTRAINT "inventory_allocation_line_allocation_id_fkey"
  FOREIGN KEY ("allocation_id") REFERENCES "inventory_allocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "inventory_allocation_line"
  ADD CONSTRAINT "inventory_allocation_line_ingredient_id_fkey"
  FOREIGN KEY ("ingredient_id") REFERENCES "ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
