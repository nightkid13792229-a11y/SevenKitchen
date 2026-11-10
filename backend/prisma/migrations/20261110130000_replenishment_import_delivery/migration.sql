-- 补货识别：页面类型 / 预计到货 / 已送达（2026-11-10）
ALTER TABLE "purchase_order_import"
  ADD COLUMN "page_type" VARCHAR(20),
  ADD COLUMN "expected_delivery_at" TIMESTAMP(3),
  ADD COLUMN "delivered_at" TIMESTAMP(3);
