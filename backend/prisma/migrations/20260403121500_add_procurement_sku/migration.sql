-- CreateTable
CREATE TABLE "procurement_sku" (
    "id" TEXT NOT NULL,
    "ingredient_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" VARCHAR(100),
    "product_model" VARCHAR(100),
    "purchase_channel" VARCHAR(200),
    "reference_price_per_purchase_unit" DECIMAL(10,2),
    "display_unit" VARCHAR(50),
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "procurement_sku_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "procurement_sku_ingredient_id_idx" ON "procurement_sku"("ingredient_id");

-- CreateIndex
CREATE INDEX "procurement_sku_is_active_idx" ON "procurement_sku"("is_active");

-- AddForeignKey
ALTER TABLE "procurement_sku" ADD CONSTRAINT "procurement_sku_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
