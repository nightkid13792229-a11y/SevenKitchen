-- 盘点行支持"未盘" + 计数时刻（C1）
ALTER TABLE "inventory_stocktake_line"
  ALTER COLUMN "counted_quantity_g" DROP NOT NULL,
  ALTER COLUMN "delta_g" DROP NOT NULL,
  ADD COLUMN "counted_at" TIMESTAMP(3);

-- 四态：草稿 / 待复核 / 已入账 / 已驳回
ALTER TYPE "InventoryStocktakeStatus" ADD VALUE 'SUBMITTED';
ALTER TYPE "InventoryStocktakeStatus" ADD VALUE 'REJECTED';

ALTER TABLE "inventory_stocktake"
  ADD COLUMN "submitted_at" TIMESTAMP(3),
  ADD COLUMN "reviewed_by" VARCHAR(36),
  ADD COLUMN "reviewed_at" TIMESTAMP(3),
  ADD COLUMN "review_note" TEXT;
