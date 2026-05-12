ALTER TABLE "nutrition_food" ADD COLUMN "edible_portion_label" VARCHAR(100);
ALTER TABLE "nutrition_food" ADD COLUMN "processing_label" VARCHAR(100);

ALTER TABLE "ingredient_nutrition_candidate" ADD COLUMN "agent_review" JSONB;
ALTER TABLE "ingredient_nutrition_candidate" ADD COLUMN "agent_review_status" VARCHAR(40);
ALTER TABLE "ingredient_nutrition_candidate" ADD COLUMN "hard_gate_results" JSONB;
ALTER TABLE "ingredient_nutrition_candidate" ADD COLUMN "review_group" VARCHAR(40);
ALTER TABLE "ingredient_nutrition_candidate" ADD COLUMN "preparation_state" VARCHAR(50);
ALTER TABLE "ingredient_nutrition_candidate" ADD COLUMN "preparation_state_label" VARCHAR(100);
ALTER TABLE "ingredient_nutrition_candidate" ADD COLUMN "edible_portion_label" VARCHAR(100);
ALTER TABLE "ingredient_nutrition_candidate" ADD COLUMN "processing_label" VARCHAR(100);
ALTER TABLE "ingredient_nutrition_candidate" ADD COLUMN "review_note" TEXT;

CREATE INDEX "ingredient_nutrition_candidate_review_group_idx"
  ON "ingredient_nutrition_candidate"("review_group");

CREATE INDEX "ingredient_nutrition_candidate_agent_review_status_idx"
  ON "ingredient_nutrition_candidate"("agent_review_status");
