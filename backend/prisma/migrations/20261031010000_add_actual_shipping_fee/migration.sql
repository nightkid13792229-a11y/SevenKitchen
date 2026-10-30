-- 实际运费（发货时录入，用于财务成本统计）
-- 与 amount_shipping 不同：那个是向顾客收取的运费，这个是我们实际支出的运费。
ALTER TABLE "order" ADD COLUMN "actual_shipping_fee" DECIMAL(10,2);
