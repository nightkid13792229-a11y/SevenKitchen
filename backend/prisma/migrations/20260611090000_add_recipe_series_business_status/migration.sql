CREATE TYPE "RecipeSeriesBusinessStatus" AS ENUM ('DRAFT', 'PUBLIC', 'PRIVATE_CUSTOM');

ALTER TABLE "recipe_series"
  ADD COLUMN "business_status" "RecipeSeriesBusinessStatus" NOT NULL DEFAULT 'DRAFT';

UPDATE "recipe_series" AS series
SET "business_status" = 'PRIVATE_CUSTOM'
WHERE series."status" = 'ACTIVE'
  AND series."deleted_at" IS NULL
  AND EXISTS (
  SELECT 1
  FROM "recipe" AS recipe
  WHERE recipe."series_id" = series."id"
    AND recipe."status" = 'PRIVATE_CUSTOM'
);

UPDATE "recipe_series" AS series
SET "business_status" = 'PUBLIC'
WHERE series."business_status" = 'DRAFT'
  AND series."status" = 'ACTIVE'
  AND series."deleted_at" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "recipe" AS recipe
    WHERE recipe."series_id" = series."id"
      AND recipe."status" = 'PUBLIC'
  );

CREATE INDEX "recipe_series_business_status_idx"
  ON "recipe_series"("business_status");
