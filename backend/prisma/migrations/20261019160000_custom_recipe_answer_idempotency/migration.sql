-- 2026-10-19 P0：过敏回答状态 + 下单幂等键
CREATE TYPE "AllergyAnswerStatus" AS ENUM ('UNKNOWN', 'HAS_ALLERGY', 'NO_ALLERGY');

ALTER TABLE "custom_recipe_order"
  ADD COLUMN "allergy_status" "AllergyAnswerStatus" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "client_request_id" VARCHAR(64);

CREATE UNIQUE INDEX "custom_recipe_order_customer_id_client_request_id_key"
  ON "custom_recipe_order"("customer_id", "client_request_id");
