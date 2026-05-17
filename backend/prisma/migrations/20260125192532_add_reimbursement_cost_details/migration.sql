-- Migration: Add Reimbursement Cost Details
-- Date: 2026-01-25
-- Description: Add platform_fee and custom cost detail fields to reimbursement table

DO $$
BEGIN
    IF to_regclass('public.reimbursement') IS NOT NULL THEN
        ALTER TABLE "reimbursement"
            ADD COLUMN IF NOT EXISTS "platform_shipping_fee" numeric(10,2),
            ADD COLUMN IF NOT EXISTS "platform_packaging_fee" numeric(10,2),
            ADD COLUMN IF NOT EXISTS "custom_fees" jsonb,
            ADD COLUMN IF NOT EXISTS "payment_proof_urls" text[] DEFAULT '{}'::text[],
            ADD COLUMN IF NOT EXISTS "payment_proof_keys" text[] DEFAULT '{}'::text[];

        CREATE INDEX IF NOT EXISTS "reimbursement_payment_proof_urls_idx"
            ON "reimbursement" USING GIN ("payment_proof_urls");
    END IF;
END $$;
