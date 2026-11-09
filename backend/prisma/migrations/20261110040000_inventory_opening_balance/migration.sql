-- 期初盘点（A4）：单独的来源类型，便于报表排除期初
ALTER TYPE "InventorySourceType" ADD VALUE 'OPENING_BALANCE';

-- 盘点单区分期初 / 常规，并记录创建人
CREATE TYPE "InventoryStocktakeType" AS ENUM ('OPENING', 'ROUTINE');

ALTER TABLE "inventory_stocktake"
  ADD COLUMN "type" "InventoryStocktakeType" NOT NULL DEFAULT 'ROUTINE',
  ADD COLUMN "created_by" VARCHAR(36);
