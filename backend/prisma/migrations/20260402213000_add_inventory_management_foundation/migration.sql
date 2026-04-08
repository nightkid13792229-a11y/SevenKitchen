ALTER TYPE "InventorySourceType" ADD VALUE 'MANUAL_ADJUSTMENT';
ALTER TYPE "InventorySourceType" ADD VALUE 'STOCKTAKE';

CREATE TYPE "InventoryAdjustmentMode" AS ENUM ('DELTA', 'SET');

CREATE TYPE "InventoryStocktakeStatus" AS ENUM ('DRAFT', 'APPLIED');

CREATE TABLE "inventory_adjustment" (
  "id" TEXT NOT NULL,
  "ingredient_id" TEXT NOT NULL,
  "adjustment_mode" "InventoryAdjustmentMode" NOT NULL,
  "quantity_before_g" DOUBLE PRECISION NOT NULL,
  "quantity_after_g" DOUBLE PRECISION NOT NULL,
  "delta_g" DOUBLE PRECISION NOT NULL,
  "reason" VARCHAR(200) NOT NULL,
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "inventory_adjustment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory_stocktake" (
  "id" TEXT NOT NULL,
  "status" "InventoryStocktakeStatus" NOT NULL DEFAULT 'DRAFT',
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "applied_at" TIMESTAMP(3),

  CONSTRAINT "inventory_stocktake_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory_stocktake_line" (
  "id" TEXT NOT NULL,
  "stocktake_id" TEXT NOT NULL,
  "ingredient_id" TEXT NOT NULL,
  "expected_quantity_g" DOUBLE PRECISION NOT NULL,
  "counted_quantity_g" DOUBLE PRECISION NOT NULL,
  "delta_g" DOUBLE PRECISION NOT NULL,

  CONSTRAINT "inventory_stocktake_line_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "inventory_adjustment_ingredient_id_idx" ON "inventory_adjustment"("ingredient_id");
CREATE INDEX "inventory_adjustment_created_at_idx" ON "inventory_adjustment"("created_at");
CREATE INDEX "inventory_stocktake_status_created_at_idx" ON "inventory_stocktake"("status", "created_at");
CREATE UNIQUE INDEX "inventory_stocktake_line_stocktake_id_ingredient_id_key" ON "inventory_stocktake_line"("stocktake_id", "ingredient_id");
CREATE INDEX "inventory_stocktake_line_ingredient_id_idx" ON "inventory_stocktake_line"("ingredient_id");

ALTER TABLE "inventory_adjustment"
ADD CONSTRAINT "inventory_adjustment_ingredient_id_fkey"
FOREIGN KEY ("ingredient_id") REFERENCES "ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "inventory_stocktake_line"
ADD CONSTRAINT "inventory_stocktake_line_stocktake_id_fkey"
FOREIGN KEY ("stocktake_id") REFERENCES "inventory_stocktake"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "inventory_stocktake_line"
ADD CONSTRAINT "inventory_stocktake_line_ingredient_id_fkey"
FOREIGN KEY ("ingredient_id") REFERENCES "ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
