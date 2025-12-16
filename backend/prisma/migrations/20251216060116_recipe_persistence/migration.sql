-- CreateEnum
CREATE TYPE "RecipeStatus" AS ENUM ('DRAFT', 'PUBLIC', 'PRIVATE_CUSTOM');

-- CreateTable
CREATE TABLE "recipe" (
    "id" TEXT NOT NULL,
    "recipe_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "status" "RecipeStatus" NOT NULL,
    "energy_density_kcal_per_kg" DOUBLE PRECISION NOT NULL,
    "production_loss_rate" DOUBLE PRECISION NOT NULL,
    "batch_labor_hours" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_item" (
    "id" TEXT NOT NULL,
    "recipe_id" TEXT NOT NULL,
    "recipe_version" INTEGER NOT NULL,
    "ingredient_id" TEXT NOT NULL,
    "preparation_method" TEXT,
    "ratio_percent" DOUBLE PRECISION,
    "is_primary_source" BOOLEAN NOT NULL,
    "nutrient_target_key" TEXT,
    "nutrient_target_value" DOUBLE PRECISION,

    CONSTRAINT "recipe_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recipe_recipe_id_idx" ON "recipe"("recipe_id");

-- CreateIndex
CREATE INDEX "recipe_status_idx" ON "recipe"("status");

-- CreateIndex
CREATE INDEX "recipe_created_at_idx" ON "recipe"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "recipe_recipe_id_version_key" ON "recipe"("recipe_id", "version");

-- CreateIndex
CREATE INDEX "recipe_item_recipe_id_recipe_version_idx" ON "recipe_item"("recipe_id", "recipe_version");

-- AddForeignKey
ALTER TABLE "recipe_item" ADD CONSTRAINT "recipe_item_recipe_id_recipe_version_fkey" FOREIGN KEY ("recipe_id", "recipe_version") REFERENCES "recipe"("recipe_id", "version") ON DELETE CASCADE ON UPDATE CASCADE;
