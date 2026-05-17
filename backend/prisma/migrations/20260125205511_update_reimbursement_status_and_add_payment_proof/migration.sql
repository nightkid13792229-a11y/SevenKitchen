DO $$
BEGIN
    IF to_regclass('public.reimbursement') IS NOT NULL THEN
        ALTER TABLE "reimbursement"
            ADD COLUMN IF NOT EXISTS "platform_shipping_fee" DECIMAL(10,2),
            ADD COLUMN IF NOT EXISTS "platform_packaging_fee" DECIMAL(10,2),
            ADD COLUMN IF NOT EXISTS "custom_fees" JSONB,
            ADD COLUMN IF NOT EXISTS "payment_proof_urls" TEXT[] DEFAULT '{}';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReimbursementStatus')
       AND EXISTS (
           SELECT 1
           FROM pg_enum e
           JOIN pg_type t ON t.oid = e.enumtypid
           WHERE t.typname = 'ReimbursementStatus'
             AND e.enumlabel = 'APPROVED'
       )
       AND NOT EXISTS (
           SELECT 1
           FROM pg_enum e
           JOIN pg_type t ON t.oid = e.enumtypid
           WHERE t.typname = 'ReimbursementStatus'
             AND e.enumlabel = 'REIMBURSED'
       ) THEN
        ALTER TYPE "ReimbursementStatus" RENAME VALUE 'APPROVED' TO 'REIMBURSED';
    END IF;

    IF to_regclass('public.reimbursement') IS NOT NULL THEN
        UPDATE "reimbursement"
        SET "status" = 'REIMBURSED'
        WHERE "status"::text = 'APPROVED';
    END IF;
END $$;
