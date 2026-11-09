-- 完工扣料状态（B2）：失败可见、可补扣
ALTER TABLE "packaging_unit"
  ADD COLUMN "inventory_deducted_at" TIMESTAMP(3),
  ADD COLUMN "inventory_deduction_error" VARCHAR(500);
