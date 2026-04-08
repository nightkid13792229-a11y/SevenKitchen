-- Migration: Add ingredient pricing groups and reimbursement-driven price changes
-- Date: 2026-03-31

ALTER TABLE "ingredient"
    ADD COLUMN IF NOT EXISTS "pricing_group_code" VARCHAR(100),
    ADD COLUMN IF NOT EXISTS "effective_price_per_purchase_unit" DECIMAL(10,2);

ALTER TABLE "global_config"
    ADD COLUMN IF NOT EXISTS "ingredient_price_auto_approve_threshold" DECIMAL(5,4) DEFAULT 0.08;

UPDATE "ingredient"
SET "effective_price_per_purchase_unit" = "current_price_per_purchase_unit"
WHERE "effective_price_per_purchase_unit" IS NULL;

CREATE INDEX IF NOT EXISTS "ingredient_pricing_group_code_idx"
    ON "ingredient" ("pricing_group_code");

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'IngredientPriceChangeStatus') THEN
        CREATE TYPE "IngredientPriceChangeStatus" AS ENUM (
            'PENDING',
            'APPROVED',
            'REJECTED'
        );
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "ingredient_price_change" (
    "id" TEXT NOT NULL,
    "ingredient_id" TEXT NOT NULL,
    "reimbursement_id" TEXT NOT NULL,
    "purchase_record_id" TEXT NOT NULL,
    "ingredient_name" VARCHAR(200) NOT NULL,
    "pricing_group_code" VARCHAR(100),
    "source_quantity" INTEGER NOT NULL,
    "source_price_per_purchase_unit" DECIMAL(10,2) NOT NULL,
    "previous_current_price_per_purchase_unit" DECIMAL(10,2) NOT NULL,
    "previous_effective_price" DECIMAL(10,2) NOT NULL,
    "proposed_effective_price" DECIMAL(10,2) NOT NULL,
    "applied_current_price_per_purchase_unit" DECIMAL(10,2),
    "applied_effective_price_per_purchase_unit" DECIMAL(10,2),
    "delta_rate" DECIMAL(10,4),
    "status" "IngredientPriceChangeStatus" NOT NULL DEFAULT 'PENDING',
    "review_comment" TEXT,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ingredient_price_change_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ingredient_price_change"
    ADD COLUMN IF NOT EXISTS "previous_current_price_per_purchase_unit" DECIMAL(10,2),
    ADD COLUMN IF NOT EXISTS "applied_current_price_per_purchase_unit" DECIMAL(10,2),
    ADD COLUMN IF NOT EXISTS "applied_effective_price_per_purchase_unit" DECIMAL(10,2);

CREATE UNIQUE INDEX IF NOT EXISTS "ingredient_price_change_purchase_record_id_key"
    ON "ingredient_price_change" ("purchase_record_id");

CREATE INDEX IF NOT EXISTS "ingredient_price_change_ingredient_id_idx"
    ON "ingredient_price_change" ("ingredient_id");

CREATE INDEX IF NOT EXISTS "ingredient_price_change_reimbursement_id_idx"
    ON "ingredient_price_change" ("reimbursement_id");

CREATE INDEX IF NOT EXISTS "ingredient_price_change_pricing_group_code_idx"
    ON "ingredient_price_change" ("pricing_group_code");

CREATE INDEX IF NOT EXISTS "ingredient_price_change_status_idx"
    ON "ingredient_price_change" ("status");

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ingredient_price_change_ingredient_id_fkey'
    ) THEN
        ALTER TABLE "ingredient_price_change"
            ADD CONSTRAINT "ingredient_price_change_ingredient_id_fkey"
            FOREIGN KEY ("ingredient_id") REFERENCES "ingredient"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ingredient_price_change_reimbursement_id_fkey'
    ) THEN
        ALTER TABLE "ingredient_price_change"
            ADD CONSTRAINT "ingredient_price_change_reimbursement_id_fkey"
            FOREIGN KEY ("reimbursement_id") REFERENCES "reimbursement"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
