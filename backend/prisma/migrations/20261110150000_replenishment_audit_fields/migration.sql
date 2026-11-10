-- 补货记录的作废/修改/到货操作留痕
ALTER TABLE "purchase_list"
  ADD COLUMN "voided_by_id" VARCHAR(36),
  ADD COLUMN "updated_by_id" VARCHAR(36),
  ADD COLUMN "arrived_by_id" VARCHAR(36);
