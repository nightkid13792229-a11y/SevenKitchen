-- Fix: ensure order shipping columns exist

ALTER TABLE "order"
  ADD COLUMN IF NOT EXISTS "tracking_number" TEXT;

ALTER TABLE "order"
  ADD COLUMN IF NOT EXISTS "carrier_code" TEXT;

ALTER TABLE "order"
  ADD COLUMN IF NOT EXISTS "shipped_at" TIMESTAMP(3);