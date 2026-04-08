-- CreateEnum
CREATE TYPE "NutritionFoodCategory" AS ENUM ('MEAT', 'ORGAN', 'SEAFOOD', 'VEGETABLE', 'FRUIT', 'GRAIN', 'DAIRY', 'EGG', 'OIL', 'SUPPLEMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "NutritionFoodStatus" AS ENUM ('PENDING', 'VERIFIED', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "DesignRecipeStatus" AS ENUM ('DRAFT', 'COMPLIANT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FeedbackType" AS ENUM ('BUG', 'SUGGESTION', 'OTHER');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('PENDING', 'REPLIED', 'CLOSED');

-- CreateTable
CREATE TABLE "recipe_review" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "recipe_id" TEXT NOT NULL,
    "rating_ease" INTEGER NOT NULL,
    "rating_value" INTEGER NOT NULL,
    "rating_taste" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "photos" JSONB NOT NULL DEFAULT '[]',
    "source" TEXT NOT NULL DEFAULT 'PURCHASED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipe_review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutrition_food" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "name_en" VARCHAR(200),
    "category" "NutritionFoodCategory" NOT NULL,
    "data_source" VARCHAR(100) NOT NULL,
    "external_id" VARCHAR(100),
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "NutritionFoodStatus" NOT NULL DEFAULT 'PENDING',
    "nutrition_data" JSONB NOT NULL,
    "notes" TEXT,
    "created_by" TEXT,
    "verified_by" TEXT,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nutrition_food_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutrition_food_mapping" (
    "id" TEXT NOT NULL,
    "nutrition_food_id" TEXT NOT NULL,
    "ingredient_id" TEXT NOT NULL,
    "yield_rate" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nutrition_food_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "design_recipe" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "DesignRecipeStatus" NOT NULL DEFAULT 'DRAFT',
    "energy_density_kcal_per_kg" DOUBLE PRECISION NOT NULL,
    "nutrition_standard" TEXT NOT NULL DEFAULT 'FEDIAF_2024',
    "calculated_nutrition" JSONB NOT NULL,
    "compliance_status" JSONB NOT NULL,
    "compliance_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "is_compliant" BOOLEAN NOT NULL DEFAULT false,
    "target_health_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "applicable_life_stages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "created_by" TEXT NOT NULL,
    "published_at" TIMESTAMP(3),
    "published_recipe_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "design_recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "design_recipe_item" (
    "id" TEXT NOT NULL,
    "design_recipe_id" TEXT NOT NULL,
    "nutrition_food_id" TEXT NOT NULL,
    "ratio_percent" DOUBLE PRECISION NOT NULL,
    "weight_per_kg_g" DOUBLE PRECISION NOT NULL,
    "preparation_method" VARCHAR(100),
    "nutrient_target_key" TEXT,
    "nutrient_target_value" DOUBLE PRECISION,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "design_recipe_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "design_recipe_ai_generation_log" (
    "id" TEXT NOT NULL,
    "design_recipe_id" TEXT NOT NULL,
    "input_params" JSONB NOT NULL,
    "generation_model" VARCHAR(100) NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 10,
    "final_attempt_result" VARCHAR(50) NOT NULL,
    "adjustment_log" JSONB NOT NULL,
    "gap_report" JSONB,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "design_recipe_ai_generation_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutrition_standard_fediaf" (
    "id" TEXT NOT NULL,
    "nutrient_key" VARCHAR(50) NOT NULL,
    "nutrient_name" VARCHAR(100) NOT NULL,
    "nutrient_name_en" VARCHAR(100) NOT NULL,
    "unit" VARCHAR(20) NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "min_value_adult" DOUBLE PRECISION,
    "max_value_adult" DOUBLE PRECISION,
    "min_value_puppy" DOUBLE PRECISION,
    "max_value_puppy" DOUBLE PRECISION,
    "basis" VARCHAR(20) NOT NULL,
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nutrition_standard_fediaf_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "FeedbackType" NOT NULL,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'PENDING',
    "content" VARCHAR(500) NOT NULL,
    "image_urls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "image_keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_reply" (
    "id" TEXT NOT NULL,
    "feedback_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "content" VARCHAR(500) NOT NULL,
    "image_urls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "image_keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reply_to_id" TEXT,
    "reply_to_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedback_reply_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recipe_review_recipe_id_idx" ON "recipe_review"("recipe_id");

-- CreateIndex
CREATE INDEX "recipe_review_user_id_idx" ON "recipe_review"("user_id");

-- CreateIndex
CREATE INDEX "recipe_review_created_at_idx" ON "recipe_review"("created_at");

-- CreateIndex
CREATE INDEX "nutrition_food_category_idx" ON "nutrition_food"("category");

-- CreateIndex
CREATE INDEX "nutrition_food_status_idx" ON "nutrition_food"("status");

-- CreateIndex
CREATE INDEX "nutrition_food_data_source_idx" ON "nutrition_food"("data_source");

-- CreateIndex
CREATE UNIQUE INDEX "nutrition_food_name_data_source_version_key" ON "nutrition_food"("name", "data_source", "version");

-- CreateIndex
CREATE INDEX "nutrition_food_mapping_nutrition_food_id_idx" ON "nutrition_food_mapping"("nutrition_food_id");

-- CreateIndex
CREATE INDEX "nutrition_food_mapping_ingredient_id_idx" ON "nutrition_food_mapping"("ingredient_id");

-- CreateIndex
CREATE UNIQUE INDEX "nutrition_food_mapping_nutrition_food_id_ingredient_id_key" ON "nutrition_food_mapping"("nutrition_food_id", "ingredient_id");

-- CreateIndex
CREATE INDEX "design_recipe_status_idx" ON "design_recipe"("status");

-- CreateIndex
CREATE INDEX "design_recipe_created_by_idx" ON "design_recipe"("created_by");

-- CreateIndex
CREATE INDEX "design_recipe_is_compliant_idx" ON "design_recipe"("is_compliant");

-- CreateIndex
CREATE UNIQUE INDEX "design_recipe_name_version_key" ON "design_recipe"("name", "version");

-- CreateIndex
CREATE INDEX "design_recipe_item_design_recipe_id_idx" ON "design_recipe_item"("design_recipe_id");

-- CreateIndex
CREATE INDEX "design_recipe_item_nutrition_food_id_idx" ON "design_recipe_item"("nutrition_food_id");

-- CreateIndex
CREATE UNIQUE INDEX "design_recipe_ai_generation_log_design_recipe_id_key" ON "design_recipe_ai_generation_log"("design_recipe_id");

-- CreateIndex
CREATE INDEX "design_recipe_ai_generation_log_generation_model_idx" ON "design_recipe_ai_generation_log"("generation_model");

-- CreateIndex
CREATE INDEX "design_recipe_ai_generation_log_final_attempt_result_idx" ON "design_recipe_ai_generation_log"("final_attempt_result");

-- CreateIndex
CREATE UNIQUE INDEX "nutrition_standard_fediaf_nutrient_key_key" ON "nutrition_standard_fediaf"("nutrient_key");

-- CreateIndex
CREATE INDEX "nutrition_standard_fediaf_category_idx" ON "nutrition_standard_fediaf"("category");

-- CreateIndex
CREATE INDEX "nutrition_standard_fediaf_is_active_idx" ON "nutrition_standard_fediaf"("is_active");

-- CreateIndex
CREATE INDEX "feedback_user_id_idx" ON "feedback"("user_id");

-- CreateIndex
CREATE INDEX "feedback_status_idx" ON "feedback"("status");

-- CreateIndex
CREATE INDEX "feedback_created_at_idx" ON "feedback"("created_at");

-- CreateIndex
CREATE INDEX "feedback_reply_feedback_id_idx" ON "feedback_reply"("feedback_id");

-- CreateIndex
CREATE INDEX "feedback_reply_user_id_idx" ON "feedback_reply"("user_id");

-- CreateIndex
CREATE INDEX "feedback_reply_created_at_idx" ON "feedback_reply"("created_at");

-- CreateIndex
CREATE INDEX "recipe_share_token_token_idx" ON "recipe_share_token"("token");

-- AddForeignKey
ALTER TABLE "recipe_review" ADD CONSTRAINT "recipe_review_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_review" ADD CONSTRAINT "recipe_review_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nutrition_food_mapping" ADD CONSTRAINT "nutrition_food_mapping_nutrition_food_id_fkey" FOREIGN KEY ("nutrition_food_id") REFERENCES "nutrition_food"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nutrition_food_mapping" ADD CONSTRAINT "nutrition_food_mapping_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_recipe_item" ADD CONSTRAINT "design_recipe_item_design_recipe_id_fkey" FOREIGN KEY ("design_recipe_id") REFERENCES "design_recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_recipe_item" ADD CONSTRAINT "design_recipe_item_nutrition_food_id_fkey" FOREIGN KEY ("nutrition_food_id") REFERENCES "nutrition_food"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_recipe_ai_generation_log" ADD CONSTRAINT "design_recipe_ai_generation_log_design_recipe_id_fkey" FOREIGN KEY ("design_recipe_id") REFERENCES "design_recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_reply" ADD CONSTRAINT "feedback_reply_feedback_id_fkey" FOREIGN KEY ("feedback_id") REFERENCES "feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_reply" ADD CONSTRAINT "feedback_reply_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_reply" ADD CONSTRAINT "feedback_reply_reply_to_id_fkey" FOREIGN KEY ("reply_to_id") REFERENCES "feedback_reply"("id") ON DELETE SET NULL ON UPDATE CASCADE;
