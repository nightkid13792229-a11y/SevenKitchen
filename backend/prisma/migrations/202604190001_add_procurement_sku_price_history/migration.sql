-- Create enum for procurement SKU effective price history sources.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'ProcurementSkuPriceHistorySource'
  ) THEN
    CREATE TYPE "ProcurementSkuPriceHistorySource" AS ENUM (
      'MANUAL',
      'REIMBURSEMENT',
      'ROLLBACK'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "procurement_sku_price_history" (
  "id" VARCHAR(36) NOT NULL,
  "procurement_sku_id" VARCHAR(36) NOT NULL,
  "ingredient_id" VARCHAR(36) NOT NULL,
  "old_price" DECIMAL(10, 2),
  "new_price" DECIMAL(10, 2) NOT NULL,
  "source" "ProcurementSkuPriceHistorySource" NOT NULL,
  "reimbursement_id" VARCHAR(36),
  "purchase_record_id" VARCHAR(36),
  "rollback_from_history_id" VARCHAR(36),
  "operator_id" VARCHAR(36),
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "procurement_sku_price_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "procurement_sku_price_history_procurement_sku_id_fkey"
    FOREIGN KEY ("procurement_sku_id")
    REFERENCES "procurement_sku"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT "procurement_sku_price_history_ingredient_id_fkey"
    FOREIGN KEY ("ingredient_id")
    REFERENCES "ingredient"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "procurement_sku_price_history_procurement_sku_id_idx"
  ON "procurement_sku_price_history"("procurement_sku_id");
CREATE INDEX IF NOT EXISTS "procurement_sku_price_history_ingredient_id_idx"
  ON "procurement_sku_price_history"("ingredient_id");
CREATE INDEX IF NOT EXISTS "procurement_sku_price_history_source_idx"
  ON "procurement_sku_price_history"("source");
CREATE INDEX IF NOT EXISTS "procurement_sku_price_history_reimbursement_id_idx"
  ON "procurement_sku_price_history"("reimbursement_id");
CREATE INDEX IF NOT EXISTS "procurement_sku_price_history_purchase_record_id_idx"
  ON "procurement_sku_price_history"("purchase_record_id");
CREATE INDEX IF NOT EXISTS "procurement_sku_price_history_created_at_idx"
  ON "procurement_sku_price_history"("created_at");
