-- Phase 8.14: Add shipping tracking fields to order table
-- Idempotent: uses IF NOT EXISTS to allow safe re-runs
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "tracking_number" TEXT;
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "carrier_code" TEXT;
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "shipped_at" TIMESTAMP(3);
