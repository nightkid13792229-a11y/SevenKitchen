ALTER TABLE "order_item"
  ADD COLUMN IF NOT EXISTS "package_plan" JSONB,
  ADD COLUMN IF NOT EXISTS "ingredient_source_plan" VARCHAR(40);

UPDATE "order_item"
SET "package_plan" = jsonb_build_array(
  jsonb_build_object(
    'packageSpecG', "package_spec_g",
    'packageCount', "package_count"
  )
)
-- Only backfill package_plan when the legacy single-spec total is exact.
-- Some legacy rows use ceil(quantity_g / package_spec_g), so deriving a
-- package_plan for those rows would fail domain validation on hydration.
WHERE "package_plan" IS NULL
  AND "package_spec_g" * "package_count" = "quantity_g";
