-- Fix order payment and cancellation columns (idempotent)
-- Phase 8.17: Payment transaction tracking fields
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "payment_method" TEXT;
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "transaction_id" TEXT;
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "paid_at" TIMESTAMP(3);
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "payment_status" TEXT;
-- Phase 8.16: Order cancellation fields
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP(3);
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "cancellation_reason" TEXT;
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "cancelled_by" TEXT;
