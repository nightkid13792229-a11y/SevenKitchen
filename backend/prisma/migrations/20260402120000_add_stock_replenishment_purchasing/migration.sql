CREATE TYPE "IngredientProcurementStrategy" AS ENUM ('DAILY_PURCHASE', 'STOCK_REPLENISHMENT', 'HYBRID');

CREATE TYPE "PurchaseListKind" AS ENUM ('ORDER_DEMAND', 'STOCK_REPLENISHMENT');

ALTER TYPE "InventorySourceType" ADD VALUE 'PURCHASE_RECORD';

ALTER TABLE "ingredient"
ADD COLUMN "procurement_strategy" "IngredientProcurementStrategy" NOT NULL DEFAULT 'DAILY_PURCHASE';

ALTER TABLE "purchase_list"
ADD COLUMN "kind" "PurchaseListKind" NOT NULL DEFAULT 'ORDER_DEMAND';

CREATE INDEX "ingredient_procurement_strategy_idx" ON "ingredient"("procurement_strategy");

CREATE INDEX "purchase_list_kind_idx" ON "purchase_list"("kind");
