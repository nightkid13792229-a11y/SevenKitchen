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
WHERE "package_plan" IS NULL;
