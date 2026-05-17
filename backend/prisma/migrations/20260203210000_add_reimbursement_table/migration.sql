-- Migration: Add Reimbursement Table
-- Date: 2026-02-03
-- Description: Ensure reimbursement indexes and relations exist without
-- duplicating objects already created by earlier backfill migrations.

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReimbursementStatus') THEN
        CREATE TYPE "ReimbursementStatus" AS ENUM (
            'PENDING_REVIEW',
            'REIMBURSED',
            'REJECTED',
            'REQUIRES_RESUBMIT'
        );
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "reimbursement" (
    "id" text NOT NULL,
    "claim_number" text NOT NULL,
    "status" "ReimbursementStatus" NOT NULL,
    "total_actual_cost" numeric(10,2) NOT NULL,
    "total_estimated_cost" numeric(10,2) NOT NULL,
    "receipt_urls" text[] DEFAULT ARRAY[]::text[],
    "submitted_by_id" text NOT NULL,
    "submitted_at" timestamp(3) without time zone NOT NULL,
    "reviewed_by_id" text,
    "reviewed_at" timestamp(3) without time zone,
    "review_comment" text,
    "platform_shipping_fee" numeric(10,2),
    "platform_packaging_fee" numeric(10,2),
    "custom_fees" jsonb,
    "payment_proof_urls" text[] DEFAULT ARRAY[]::text[],
    "payment_proof_keys" text[] DEFAULT ARRAY[]::text[],
    "created_at" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp(3) without time zone NOT NULL,
    CONSTRAINT "reimbursement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "reimbursement_claim_number_key"
    ON "reimbursement" ("claim_number");
CREATE INDEX IF NOT EXISTS "reimbursement_status_idx" ON "reimbursement" ("status");
CREATE INDEX IF NOT EXISTS "reimbursement_submitted_by_id_idx" ON "reimbursement" ("submitted_by_id");
CREATE INDEX IF NOT EXISTS "reimbursement_submitted_at_idx" ON "reimbursement" ("submitted_at");
CREATE INDEX IF NOT EXISTS "reimbursement_reviewed_by_id_idx" ON "reimbursement" ("reviewed_by_id");

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'reimbursement_submitted_by_id_fkey'
    ) THEN
        ALTER TABLE ONLY "reimbursement"
            ADD CONSTRAINT "reimbursement_submitted_by_id_fkey"
            FOREIGN KEY ("submitted_by_id") REFERENCES "user"("id")
            ON UPDATE CASCADE ON DELETE RESTRICT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'reimbursement_reviewed_by_id_fkey'
    ) THEN
        ALTER TABLE ONLY "reimbursement"
            ADD CONSTRAINT "reimbursement_reviewed_by_id_fkey"
            FOREIGN KEY ("reviewed_by_id") REFERENCES "user"("id")
            ON UPDATE CASCADE ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'purchase_list_reimbursement_id_fkey'
    ) THEN
        ALTER TABLE ONLY "purchase_list"
            ADD CONSTRAINT "purchase_list_reimbursement_id_fkey"
            FOREIGN KEY ("reimbursement_id") REFERENCES "reimbursement"("id")
            ON UPDATE CASCADE ON DELETE SET NULL;
    END IF;
END $$;
