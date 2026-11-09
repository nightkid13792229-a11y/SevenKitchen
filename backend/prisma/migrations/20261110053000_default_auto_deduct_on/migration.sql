-- 完工自动扣料默认开启（B4，仅影响新装/新行；已有配置行不变）
ALTER TABLE "global_config"
  ALTER COLUMN "auto_deduct_inventory_on_production" SET DEFAULT true;
