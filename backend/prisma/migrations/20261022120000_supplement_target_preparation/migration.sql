-- AlterTable
ALTER TABLE "recipe" ADD COLUMN     "production_steps_json" JSONB;

-- AlterTable
ALTER TABLE "recipe_item" ADD COLUMN     "preparation_note" VARCHAR(500),
ADD COLUMN     "preparation_source" VARCHAR(20);

-- AlterTable
ALTER TABLE "nutrition_food" ADD COLUMN     "default_supplement_targets" JSONB;

-- AlterTable
ALTER TABLE "design_recipe" ADD COLUMN     "production_steps_json" JSONB;

-- AlterTable
ALTER TABLE "design_recipe_item" ADD COLUMN     "preparation_note" VARCHAR(500),
ADD COLUMN     "preparation_source" VARCHAR(20);
