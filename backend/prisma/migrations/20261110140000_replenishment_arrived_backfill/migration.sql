-- 历史补货单：完成时已经通过 completePurchase 入过库，
-- 回填到达时间，避免新界面把它们显示成「在途」。
UPDATE "purchase_list"
SET "arrived_at" = "completed_at"
WHERE "kind" = 'STOCK_REPLENISHMENT'
  AND "status" = 'COMPLETED'
  AND "arrived_at" IS NULL;
