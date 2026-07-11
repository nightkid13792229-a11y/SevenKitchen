-- SevenKitchen local development database schema reconciliation
-- Scope: local development database only.
-- Purpose: align live local schema with the current Prisma schema and production schema
-- after the DB alignment check began hashing live database catalog metadata.

UPDATE dog_breed
SET aliases = ARRAY[]::text[]
WHERE aliases IS NULL;

ALTER TABLE dog_breed
  ALTER COLUMN aliases SET DEFAULT ARRAY[]::text[],
  ALTER COLUMN aliases SET NOT NULL;

UPDATE expense_bill_payment
SET payment_proof_urls = ARRAY[]::text[]
WHERE payment_proof_urls IS NULL;

ALTER TABLE expense_bill_payment
  ALTER COLUMN payment_proof_urls SET DEFAULT ARRAY[]::text[],
  ALTER COLUMN payment_proof_urls SET NOT NULL;

UPDATE inventory_allocation
SET source_order_ids = ARRAY[]::text[]
WHERE source_order_ids IS NULL;

ALTER TABLE inventory_allocation
  ALTER COLUMN source_order_ids SET DEFAULT ARRAY[]::text[],
  ALTER COLUMN source_order_ids SET NOT NULL;

ALTER TABLE nutrition_nutrient_definition
  ALTER COLUMN updated_at DROP DEFAULT;

ALTER TABLE nutrition_standard_entry
  ALTER COLUMN updated_at DROP DEFAULT;

ALTER TABLE nutrition_standard_version
  ALTER COLUMN updated_at DROP DEFAULT;

ALTER TABLE purchase_record
  ALTER COLUMN actual_quantity TYPE DECIMAL(18, 6)
  USING actual_quantity::DECIMAL(18, 6);

ALTER TABLE reimbursement
  ALTER COLUMN payment_proof_keys SET DEFAULT ARRAY[]::text[],
  ALTER COLUMN payment_proof_urls SET DEFAULT ARRAY[]::text[];
