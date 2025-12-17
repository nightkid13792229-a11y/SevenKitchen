-- CreateEnum
CREATE TYPE "InventorySourceType" AS ENUM ('KITCHEN_TASK');

-- CreateTable
CREATE TABLE "inventory_ledger_entry" (
    "id" TEXT NOT NULL,
    "ingredient_id" TEXT NOT NULL,
    "delta_g" DOUBLE PRECISION NOT NULL,
    "source_type" "InventorySourceType" NOT NULL,
    "source_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_ledger_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_ledger_entry_ingredient_id_idx" ON "inventory_ledger_entry"("ingredient_id");

-- CreateIndex
CREATE INDEX "inventory_ledger_entry_source_type_source_id_idx" ON "inventory_ledger_entry"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "inventory_ledger_entry_created_at_idx" ON "inventory_ledger_entry"("created_at");

-- CreateUniqueConstraint
-- Phase 8.13: DB-level idempotency guarantee
CREATE UNIQUE INDEX "inventory_ledger_entry_source_type_source_id_ingredient_id_key" ON "inventory_ledger_entry"("source_type", "source_id", "ingredient_id");
