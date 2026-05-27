-- Migration: Add Reimbursement Cost Details
-- Date: 2026-01-25
-- Description: Add platform_fee and custom cost detail fields to reimbursement table

-- Add platform shipping fee
ALTER TABLE "reimbursement"
ADD COLUMN "platform_shipping_fee" numeric(10,2);

-- Add platform packaging fee
ALTER TABLE "reimbursement"
ADD COLUMN "platform_packaging_fee" numeric(10,2);

-- Add custom_fees column for flexible fee structure
ALTER TABLE "reimbursement"
ADD COLUMN "custom_fees" jsonb;

-- Add payment proof columns with defaults
ALTER TABLE "reimbursement"
ADD COLUMN "payment_proof_urls" text[] DEFAULT '{}'::text[];
ALTER TABLE "reimbursement"
ADD COLUMN "payment_proof_keys" text[] DEFAULT '{}'::text[];

-- Create index for payment proof queries
CREATE INDEX "reimbursement_payment_proof_urls_idx"
ON "reimbursement" USING GIN ("payment_proof_urls");
