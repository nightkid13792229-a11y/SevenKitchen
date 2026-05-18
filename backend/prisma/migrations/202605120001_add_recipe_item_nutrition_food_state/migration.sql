-- Add preparation state metadata to concrete nutrition datasets.
ALTER TABLE "nutrition_food" ADD COLUMN "preparation_state" VARCHAR(50);
ALTER TABLE "nutrition_food" ADD COLUMN "preparation_state_label" VARCHAR(100);

-- Let a recipe item pin the concrete nutrition dataset used for this ingredient row.
ALTER TABLE "recipe_item" ADD COLUMN "nutrition_food_id" TEXT;

CREATE INDEX "recipe_item_nutrition_food_id_idx"
  ON "recipe_item"("nutrition_food_id");

ALTER TABLE "recipe_item"
  ADD CONSTRAINT "recipe_item_nutrition_food_id_fkey"
  FOREIGN KEY ("nutrition_food_id")
  REFERENCES "nutrition_food"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
