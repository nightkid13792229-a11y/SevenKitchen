-- 定制订单的线上退款字段（2026-09-28）
--
-- 背景：老板拍板的决策 12 —— 「只要还没开始制作，顾客可取消并全额退款」，
-- 且 Q2 明确「顾客点取消就自动原路退回微信，不需要客服先确认」。
-- 此前定制订单**完全没有退款通道**（连状态字段都没有），顾客取消不了。
--
-- 新字段记录微信退款的单号与结果，便于客服对账与排查。

ALTER TABLE "custom_recipe_order"
  ADD COLUMN IF NOT EXISTS "refund_status" VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "refund_amount" DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS "refund_out_no" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "refund_id" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "refund_reason" VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "refunded_at" TIMESTAMP(3);
