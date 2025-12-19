-- AlterTable
-- Phase 8.17: Add payment transaction tracking fields
-- Idempotent: uses IF NOT EXISTS to allow safe re-runs
-- Fixed: Use lowercase "order" table name to match actual database
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "payment_method" TEXT;
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "transaction_id" TEXT;
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "paid_at" TIMESTAMP(3);
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "payment_status" TEXT;
