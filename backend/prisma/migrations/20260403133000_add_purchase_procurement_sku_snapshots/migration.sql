ALTER TABLE "purchase_item"
ADD COLUMN IF NOT EXISTS "procurement_sku_id" VARCHAR(36),
ADD COLUMN IF NOT EXISTS "procurement_sku_name" VARCHAR(200),
ADD COLUMN IF NOT EXISTS "suggested_product_id" VARCHAR(36),
ADD COLUMN IF NOT EXISTS "suggested_product_name" VARCHAR(200);

ALTER TABLE "purchase_record"
ADD COLUMN IF NOT EXISTS "procurement_sku_id" VARCHAR(36),
ADD COLUMN IF NOT EXISTS "procurement_sku_name" VARCHAR(200);
