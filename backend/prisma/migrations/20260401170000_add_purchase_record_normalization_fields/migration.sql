ALTER TABLE "purchase_record"
ALTER COLUMN "actual_quantity" TYPE DECIMAL(18, 6);

ALTER TABLE "purchase_record"
ADD COLUMN "actual_package_count" DECIMAL(18, 3),
ADD COLUMN "actual_package_size" DECIMAL(18, 3),
ADD COLUMN "actual_package_unit" VARCHAR(20),
ADD COLUMN "actual_base_quantity" DECIMAL(18, 6),
ADD COLUMN "actual_base_unit" VARCHAR(20);

UPDATE "purchase_record" AS pr
SET
  "actual_base_quantity" = ROUND((pr."actual_quantity" * i."purchase_to_base_ratio")::numeric, 6),
  "actual_base_unit" = i."base_unit"
FROM "ingredient" AS i
WHERE pr."ingredient_id" = i."id";
