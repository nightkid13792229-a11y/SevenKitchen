ALTER TABLE "inventory_ledger_entry"
ADD COLUMN "procurement_sku_id" VARCHAR(36);

CREATE INDEX "inventory_ledger_entry_procurement_sku_id_idx"
ON "inventory_ledger_entry"("procurement_sku_id");
