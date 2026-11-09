-- 发货/分装扣包材（D1）
ALTER TYPE "InventorySourceType" ADD VALUE 'PACKAGING_CONSUMPTION';

ALTER TABLE "global_config"
  ADD COLUMN "packaging_deduction_enabled" BOOLEAN NOT NULL DEFAULT false;
