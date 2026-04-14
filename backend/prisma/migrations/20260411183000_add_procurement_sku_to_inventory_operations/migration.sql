ALTER TABLE "inventory_adjustment"
ADD COLUMN "procurement_sku_id" VARCHAR(36);

CREATE INDEX "inventory_adjustment_procurement_sku_id_idx"
ON "inventory_adjustment"("procurement_sku_id");

ALTER TABLE "inventory_stocktake_line"
ADD COLUMN "procurement_sku_id" VARCHAR(36);

CREATE INDEX "inventory_stocktake_line_procurement_sku_id_idx"
ON "inventory_stocktake_line"("procurement_sku_id");
