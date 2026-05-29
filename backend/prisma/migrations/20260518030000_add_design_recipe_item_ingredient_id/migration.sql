ALTER TABLE "design_recipe_item"
  ADD COLUMN IF NOT EXISTS "ingredient_id" TEXT;

UPDATE "design_recipe_item" AS item
SET "ingredient_id" = mapping."ingredient_id"
FROM (
  SELECT DISTINCT ON ("nutrition_food_id")
    "nutrition_food_id",
    "ingredient_id"
  FROM "nutrition_food_mapping"
  ORDER BY "nutrition_food_id", "is_primary" DESC, "created_at" ASC
) AS mapping
WHERE item."nutrition_food_id" = mapping."nutrition_food_id"
  AND item."ingredient_id" IS NULL;

CREATE INDEX IF NOT EXISTS "design_recipe_item_ingredient_id_idx"
  ON "design_recipe_item"("ingredient_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'design_recipe_item_ingredient_id_fkey'
  ) THEN
    ALTER TABLE "design_recipe_item"
      ADD CONSTRAINT "design_recipe_item_ingredient_id_fkey"
      FOREIGN KEY ("ingredient_id")
      REFERENCES "ingredient"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;
