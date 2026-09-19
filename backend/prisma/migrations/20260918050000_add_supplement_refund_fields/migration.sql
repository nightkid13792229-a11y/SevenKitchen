-- 补剂订单：线上退款与免费补发
-- 退款状态直接记在订单上（补剂订单量小，不再单独建退款流水表）

ALTER TABLE "supplement_order"
  ADD COLUMN "refund_status" VARCHAR(20),
  ADD COLUMN "refund_amount" DECIMAL(10,2),
  ADD COLUMN "refund_out_no" VARCHAR(64),
  ADD COLUMN "refund_id" VARCHAR(64),
  ADD COLUMN "refund_reason" VARCHAR(200),
  ADD COLUMN "refund_requested_at" TIMESTAMP(3),
  ADD COLUMN "refunded_at" TIMESTAMP(3),
  -- 免费补发单回指原单号，便于追溯
  ADD COLUMN "reship_from_order_no" VARCHAR(32);
