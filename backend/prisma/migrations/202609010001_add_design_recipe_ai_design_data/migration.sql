-- AI 设计建议四步向导的数据留存表（营养方案/食材推荐/审核/SOP 持久化到配方草稿）

-- CreateTable
CREATE TABLE "design_recipe_ai_design_data" (
    "id" TEXT NOT NULL,
    "design_recipe_id" TEXT NOT NULL,
    "nutrition_plan" JSONB,
    "nutrition_plan_accepted" BOOLEAN NOT NULL DEFAULT false,
    "nutrition_plan_accepted_at" TIMESTAMP(3),
    "nutrition_plan_note" VARCHAR(2000),
    "nutrition_plan_history" JSONB NOT NULL DEFAULT '[]',
    "ingredient_recommendations" JSONB NOT NULL DEFAULT '[]',
    "review_results" JSONB NOT NULL DEFAULT '[]',
    "sop" JSONB,
    "sop_accepted" BOOLEAN NOT NULL DEFAULT false,
    "sop_accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "design_recipe_ai_design_data_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "design_recipe_ai_design_data_design_recipe_id_key" ON "design_recipe_ai_design_data"("design_recipe_id");

-- CreateIndex
CREATE INDEX "design_recipe_ai_design_data_design_recipe_id_idx" ON "design_recipe_ai_design_data"("design_recipe_id");

-- AddForeignKey
ALTER TABLE "design_recipe_ai_design_data" ADD CONSTRAINT "design_recipe_ai_design_data_design_recipe_id_fkey" FOREIGN KEY ("design_recipe_id") REFERENCES "design_recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
