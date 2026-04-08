-- Hotfix: add missing recommended_product table for environments that never received it
-- This keeps DIY recommended products available without affecting environments
-- where the table already exists.

CREATE TABLE IF NOT EXISTS "recommended_product" (
    "id" VARCHAR(36) NOT NULL,
    "ingredient_id" VARCHAR(36) NOT NULL,
    "name" TEXT NOT NULL,
    "brand" VARCHAR(100),
    "product_model" VARCHAR(100),
    "purchase_channel" VARCHAR(200),
    "purchase_link" JSONB,
    "image_url" TEXT,
    "active_nutrients" JSONB,
    "display_unit" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommended_product_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "recommended_product_ingredient_id_idx"
ON "recommended_product"("ingredient_id");

CREATE INDEX IF NOT EXISTS "recommended_product_is_active_idx"
ON "recommended_product"("is_active");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'recommended_product_ingredient_id_fkey'
    ) THEN
        ALTER TABLE "recommended_product"
        ADD CONSTRAINT "recommended_product_ingredient_id_fkey"
        FOREIGN KEY ("ingredient_id")
        REFERENCES "ingredient"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE;
    END IF;
END $$;
