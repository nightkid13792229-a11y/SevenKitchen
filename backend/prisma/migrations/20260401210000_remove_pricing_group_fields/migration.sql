DROP INDEX IF EXISTS "ingredient_pricing_group_code_idx";
DROP INDEX IF EXISTS "ingredient_price_change_pricing_group_code_idx";

ALTER TABLE "ingredient"
  DROP COLUMN IF EXISTS "pricing_group_code";

ALTER TABLE "ingredient_price_change"
  DROP COLUMN IF EXISTS "pricing_group_code";
