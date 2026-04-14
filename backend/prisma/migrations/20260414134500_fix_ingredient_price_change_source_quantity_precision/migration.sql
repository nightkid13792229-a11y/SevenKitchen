ALTER TABLE "ingredient_price_change"
ALTER COLUMN "source_quantity" TYPE DECIMAL(18, 6)
USING "source_quantity"::DECIMAL(18, 6);
