ALTER TABLE "order"
ADD COLUMN IF NOT EXISTS shipping_address_snapshot JSONB;
