CREATE TYPE "ProcurementSkuSourceTier" AS ENUM (
  'ORGANIC',
  'MARKET_PREMIUM',
  'WHOLESALE'
);

ALTER TABLE "procurement_sku"
ADD COLUMN "source_tier" "ProcurementSkuSourceTier";

CREATE INDEX "procurement_sku_source_tier_idx"
ON "procurement_sku"("source_tier");
