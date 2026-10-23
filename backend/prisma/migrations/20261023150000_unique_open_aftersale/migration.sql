-- 同一订单最多一条未完成售后：防双击/并发重复提交。
CREATE UNIQUE INDEX "custom_recipe_aftersale_open_order_unique"
ON "custom_recipe_aftersale" ("order_id")
WHERE "status" IN ('PENDING', 'ACCEPTED', 'PROCESSING');
