-- 已交付/制作中订单的退款申请（2026-10-25）
CREATE TYPE "CustomRecipeRefundRequestStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'REFUNDED',
  'REJECTED',
  'FAILED'
);

CREATE TABLE "custom_recipe_refund_request" (
  "id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "reason_code" VARCHAR(48) NOT NULL,
  "reason_label" VARCHAR(100) NOT NULL,
  "description" VARCHAR(1000) NOT NULL,
  "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "amount" DECIMAL(10,2) NOT NULL,
  "status" "CustomRecipeRefundRequestStatus" NOT NULL DEFAULT 'PENDING',
  "admin_note" VARCHAR(1000),
  "refund_status" VARCHAR(20),
  "refund_out_no" VARCHAR(64),
  "refund_id" VARCHAR(64),
  "reviewed_by" VARCHAR(64),
  "reviewed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "custom_recipe_refund_request_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "custom_recipe_refund_request_order_id_idx" ON "custom_recipe_refund_request"("order_id");
CREATE INDEX "custom_recipe_refund_request_status_idx" ON "custom_recipe_refund_request"("status");

ALTER TABLE "custom_recipe_refund_request"
  ADD CONSTRAINT "custom_recipe_refund_request_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "custom_recipe_order"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
