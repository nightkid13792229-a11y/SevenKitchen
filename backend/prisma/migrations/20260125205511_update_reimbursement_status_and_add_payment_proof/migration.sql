-- First, ensure the table exists (this is needed for production databases)
-- Create ReimbursementStatus enum type if not exists
DO $$
BEGIN
    CREATE TYPE IF NOT EXISTS "ReimbursementStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REIMBURSED');
EXCEPT
    -- If enum creation fails (type already exists with different values), continue
END $$;

-- Create reimbursement table if not exists (for production databases)
CREATE TABLE IF NOT EXISTS "reimbursement" (
    "id" TEXT PRIMARY KEY,
    "claim_number" VARCHAR(20) UNIQUE NOT NULL,
    "status" "ReimbursementStatus" NOT NULL DEFAULT 'PENDING',
    "total_actual_cost" DECIMAL(10,2) NOT NULL,
    "total_estimated_cost" DECIMAL(10,2) NOT NULL,
    "receipt_urls" TEXT[] NOT NULL DEFAULT '{}',
    "submitted_by_id" TEXT NOT NULL,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMPTZ(6),
    "review_comment" TEXT,
    "platform_shipping_fee" DECIMAL(10,2),
    "platform_packaging_fee" DECIMAL(10,2),
    "custom_fees" JSONB,
    "payment_proof_urls" TEXT[] NOT NULL DEFAULT '{}',
    "payment_proof_keys" TEXT[] NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS "reimbursement_status_idx" ON "reimbursement"("status");
CREATE INDEX IF NOT EXISTS "reimbursement_submitted_by_id_idx" ON "reimbursement"("submitted_by_id");
CREATE INDEX IF NOT EXISTS "reimbursement_claim_number_idx" ON "reimbursement"("claim_number");

-- Add foreign key constraints if they don't exist
DO $$
BEGIN
    ALTER TABLE "reimbursement" ADD CONSTRAINT IF NOT EXISTS "reimbursement_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

    ALTER TABLE "reimbursement" ADD CONSTRAINT IF NOT EXISTS "reimbursement_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPT
    -- If foreign keys already exist or references don't exist, continue
END $$;

-- Now add new columns (table should exist now)
-- Add cost detail columns
ALTER TABLE "reimbursement" ADD COLUMN IF NOT EXISTS "platform_shipping_fee" DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS "platform_packaging_fee" DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS "custom_fees" JSONB;

-- Add payment proof URLs column
ALTER TABLE "reimbursement" ADD COLUMN IF NOT EXISTS "payment_proof_urls" TEXT[] DEFAULT '{}';

-- Update enum type: Remove APPROVED, Add REIMBURSED
DO $$
BEGIN
    ALTER TYPE "ReimbursementStatus" RENAME VALUE 'APPROVED' TO 'REIMBURSED';
EXCEPTION
    -- If the rename fails (APPROVED doesn't exist or already renamed), continue
END $$;

-- Update existing APPROVED status to REIMBURSED (in case any exist)
UPDATE "reimbursement" SET "status" = 'REIMBURSED' WHERE "status" = 'APPROVED';
