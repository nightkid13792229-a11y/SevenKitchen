-- 盘点明细点（2026-11-11）：一个原料行下按商品/位置拆开录入，服务端汇总到行。
CREATE TABLE "inventory_stocktake_portion" (
  "id" TEXT NOT NULL,
  "line_id" TEXT NOT NULL,
  "procurement_sku_id" VARCHAR(36),
  "location_label" VARCHAR(100),
  "counted_quantity_g" DOUBLE PRECISION,
  "counted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "inventory_stocktake_portion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "inventory_stocktake_portion_line_id_idx" ON "inventory_stocktake_portion"("line_id");
CREATE INDEX "inventory_stocktake_portion_procurement_sku_id_idx" ON "inventory_stocktake_portion"("procurement_sku_id");

ALTER TABLE "inventory_stocktake_portion"
  ADD CONSTRAINT "inventory_stocktake_portion_line_id_fkey"
  FOREIGN KEY ("line_id") REFERENCES "inventory_stocktake_line"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
