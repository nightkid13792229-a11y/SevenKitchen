-- Add cost detail columns
ALTER TABLE "reimbursement" ADD COLUMN IF NOT EXISTS "platform_shipping_fee" DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS "platform_packaging_fee" DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS "custom_fees" JSONB;

-- Add payment proof URLs column
ALTER TABLE "reimbursement" ADD COLUMN IF NOT EXISTS "payment_proof_urls" TEXT[] DEFAULT '{}';

-- Update enum type: Remove APPROVED, Add REIMBURSED
ALTER TYPE "ReimbursementStatus" RENAME VALUE 'APPROVED' TO 'REIMBURSED';

-- Update existing APPROVED status to REIMBURSED (in case any exist)
UPDATE "reimbursement" SET "status" = 'REIMBURSED' WHERE "status" = 'APPROVED';
