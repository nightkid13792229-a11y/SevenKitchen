ALTER TABLE "purchase_record"
ALTER COLUMN "actual_quantity" TYPE DECIMAL(10, 3)
USING "actual_quantity"::DECIMAL(10, 3);
