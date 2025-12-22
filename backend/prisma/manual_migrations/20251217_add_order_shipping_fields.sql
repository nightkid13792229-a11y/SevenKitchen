-- Phase 8.14: Add shipping tracking fields to Order table
-- Migration: 20251217_add_order_shipping_fields
-- Description: Adds trackingNumber, carrierCode, and shippedAt fields to support shipping fulfillment

-- Forward migration: Add columns
ALTER TABLE "order"
  ADD COLUMN IF NOT EXISTS tracking_number TEXT,
  ADD COLUMN IF NOT EXISTS carrier_code TEXT,
  ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMP;

-- Add comments for documentation
COMMENT ON COLUMN "order".tracking_number IS 'Shipping tracking number (Phase 8.14)';
COMMENT ON COLUMN "order".carrier_code IS 'Shipping carrier code, e.g., SF, YTO, ZTO (Phase 8.14)';
COMMENT ON COLUMN "order".shipped_at IS 'Timestamp when order was marked as shipped (Phase 8.14)';

-- Rollback migration (for reference, do not execute unless rolling back)
-- ALTER TABLE "order"
--   DROP COLUMN IF EXISTS tracking_number,
--   DROP COLUMN IF EXISTS carrier_code,
--   DROP COLUMN IF EXISTS shipped_at;
