-- 报废/内部领用与事后复核（C7）
CREATE TYPE "InventoryAdjustmentCategory" AS ENUM ('INTERNAL_USE', 'EXPIRED', 'DAMAGED', 'OTHER');
CREATE TYPE "InventoryAdjustmentReviewStatus" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "inventory_adjustment"
  ADD COLUMN "category" "InventoryAdjustmentCategory" NOT NULL DEFAULT 'OTHER',
  ADD COLUMN "review_status" "InventoryAdjustmentReviewStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "cost_amount" DECIMAL(10,2),
  ADD COLUMN "reviewed_by" VARCHAR(36),
  ADD COLUMN "reviewed_at" TIMESTAMP(3),
  ADD COLUMN "review_note" TEXT,
  ADD COLUMN "reverses_adjustment_id" VARCHAR(36);

CREATE INDEX "inventory_adjustment_category_idx" ON "inventory_adjustment"("category");
CREATE INDEX "inventory_adjustment_review_status_idx" ON "inventory_adjustment"("review_status");
