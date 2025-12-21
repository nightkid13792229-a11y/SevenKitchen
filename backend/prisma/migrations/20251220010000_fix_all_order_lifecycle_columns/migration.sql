-- Fix: ensure all order lifecycle columns exist

ALTER TABLE "order"
  ADD COLUMN IF NOT EXISTS "tracking_number" TEXT;

ALTER TABLE "order"
  ADD COLUMN IF NOT EXISTS "carrier_code" TEXT;

ALTER TABLE "order"
  ADD COLUMN IF NOT EXISTS "shipped_at" TIMESTAMP(3);

ALTER TABLE "order"
  ADD COLUMN IF NOT EXISTS "completed_at" TIMESTAMP(3);

ALTER TABLE "order"
  ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP(3);

ALTER TABLE "order"
  ADD COLUMN IF NOT EXISTS "paid_at" TIMESTAMP(3);