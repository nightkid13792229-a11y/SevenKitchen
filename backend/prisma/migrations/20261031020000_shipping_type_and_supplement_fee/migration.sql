-- 发货类型 + 补剂运费（2026-10-31）
-- 1) 鲜食单：标记「无需发货」的自用单
ALTER TABLE "order" ADD COLUMN "no_shipping_required" BOOLEAN NOT NULL DEFAULT false;

-- 2) 补剂单：实际运费与无需发货，和鲜食单同一口径
ALTER TABLE "supplement_order" ADD COLUMN "actual_shipping_fee" DECIMAL(10,2);
ALTER TABLE "supplement_order" ADD COLUMN "no_shipping_required" BOOLEAN NOT NULL DEFAULT false;
