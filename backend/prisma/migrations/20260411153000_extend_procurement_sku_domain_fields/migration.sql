-- AlterTable
ALTER TABLE "procurement_sku"
ADD COLUMN "supplier_name" VARCHAR(200),
ADD COLUMN "purchase_unit" VARCHAR(50),
ADD COLUMN "purchase_to_base_ratio" DOUBLE PRECISION,
ADD COLUMN "current_purchase_price" DECIMAL(10, 2),
ADD COLUMN "reference_purchase_price" DECIMAL(10, 2),
ADD COLUMN "is_default" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "safety_stock" DOUBLE PRECISION,
ADD COLUMN "reorder_point" DOUBLE PRECISION,
ADD COLUMN "target_stock" DOUBLE PRECISION;
