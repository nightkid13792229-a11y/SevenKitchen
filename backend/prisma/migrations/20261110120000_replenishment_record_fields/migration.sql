-- 补货改版：下单即记 + 到货确认（2026-11-10）
-- 记录级字段：草稿、订单快照、到货、金额、作废。
ALTER TABLE "purchase_list"
  ADD COLUMN "is_draft" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "order_no" VARCHAR(40),
  ADD COLUMN "channel" VARCHAR(30),
  ADD COLUMN "order_placed_at" TIMESTAMP(3),
  ADD COLUMN "expected_delivery_at" TIMESTAMP(3),
  ADD COLUMN "arrived_at" TIMESTAMP(3),
  ADD COLUMN "subtotal_amount" DECIMAL(10, 2),
  ADD COLUMN "shipping_fee" DECIMAL(10, 2),
  ADD COLUMN "packaging_fee" DECIMAL(10, 2),
  ADD COLUMN "discount_amount" DECIMAL(10, 2),
  ADD COLUMN "paid_amount" DECIMAL(10, 2),
  ADD COLUMN "personal_amount" DECIMAL(10, 2),
  ADD COLUMN "reimbursement_amount" DECIMAL(10, 2),
  ADD COLUMN "voided_at" TIMESTAMP(3);

CREATE INDEX "purchase_list_arrived_at_idx" ON "purchase_list"("arrived_at");
CREATE INDEX "purchase_list_is_draft_idx" ON "purchase_list"("is_draft");
