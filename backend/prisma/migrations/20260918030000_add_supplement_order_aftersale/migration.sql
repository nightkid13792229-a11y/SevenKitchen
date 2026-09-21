-- 补剂订单：售后字段
-- 售后（退款 / 免费补发）单独记录，不复用取消原因字段

ALTER TABLE "supplement_order"
  ADD COLUMN "aftersale_type" VARCHAR(20),
  ADD COLUMN "aftersale_reason" VARCHAR(200),
  ADD COLUMN "aftersale_at" TIMESTAMP(3);
