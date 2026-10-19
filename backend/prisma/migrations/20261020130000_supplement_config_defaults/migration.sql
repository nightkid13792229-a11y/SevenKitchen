-- 补剂配置默认值与首发目标对齐（新环境/新行；不覆盖已有运营数据）
ALTER TABLE "supplement_shop_config" ALTER COLUMN "markup_multiplier" SET DEFAULT 2.5;
ALTER TABLE "supplement_shop_config" ALTER COLUMN "service_fee_amount" SET DEFAULT 10.0;
ALTER TABLE "supplement_shop_config" ALTER COLUMN "flat_shipping_fee" SET DEFAULT 6.0;
ALTER TABLE "supplement_shop_config" ALTER COLUMN "free_shipping_threshold" SET DEFAULT 129.00;
