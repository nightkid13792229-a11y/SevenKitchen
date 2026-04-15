ALTER TABLE "ingredient"
ADD COLUMN "diy_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "procurement_enabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "recipe_supplement_alternative" (
  "id" TEXT NOT NULL,
  "recipe_item_id" TEXT NOT NULL,
  "alternative_ingredient_id" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "recipe_supplement_alternative_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "recipe_supplement_alternative_recipe_item_id_alternative_ingredient_id_key"
ON "recipe_supplement_alternative"("recipe_item_id", "alternative_ingredient_id");

CREATE INDEX "recipe_supplement_alternative_recipe_item_id_idx"
ON "recipe_supplement_alternative"("recipe_item_id");

CREATE INDEX "recipe_supplement_alternative_alternative_ingredient_id_idx"
ON "recipe_supplement_alternative"("alternative_ingredient_id");

ALTER TABLE "recipe_supplement_alternative"
ADD CONSTRAINT "recipe_supplement_alternative_recipe_item_id_fkey"
FOREIGN KEY ("recipe_item_id") REFERENCES "recipe_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "recipe_supplement_alternative"
ADD CONSTRAINT "recipe_supplement_alternative_alternative_ingredient_id_fkey"
FOREIGN KEY ("alternative_ingredient_id") REFERENCES "ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
