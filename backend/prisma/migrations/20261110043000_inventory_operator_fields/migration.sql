-- 操作人（B1）：盘点/调整/完工/采购完成与撤回
ALTER TABLE "inventory_adjustment" ADD COLUMN "created_by" VARCHAR(36);
ALTER TABLE "packaging_unit" ADD COLUMN "completed_by" VARCHAR(36);
ALTER TABLE "purchase_list"
  ADD COLUMN "completed_by_id" VARCHAR(36),
  ADD COLUMN "reopened_by_id" VARCHAR(36);
CREATE INDEX "purchase_list_completed_by_id_idx" ON "purchase_list"("completed_by_id");
