ALTER TABLE "purchase_item"
ADD COLUMN "procurement_sku_id" VARCHAR(36),
ADD COLUMN "procurement_sku_name" VARCHAR(200),
ADD COLUMN "suggested_product_id" VARCHAR(36),
ADD COLUMN "suggested_product_name" VARCHAR(200);

ALTER TABLE "purchase_record"
ADD COLUMN "procurement_sku_id" VARCHAR(36),
ADD COLUMN "procurement_sku_name" VARCHAR(200);
