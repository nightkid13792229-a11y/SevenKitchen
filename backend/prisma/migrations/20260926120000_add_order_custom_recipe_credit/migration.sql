-- 成品订单上的「定制费抵扣」元数据
--
-- 背景：食谱定制的定制费可以抵扣成品货款（顶层设计 v4 产品线 ③）。
-- 业务口径已确认：**货款端直接减**（不是总额端另记一笔扣减），
-- 因此订单金额的校验规则 `amount_total = amount_product + amount_shipping`
-- 完全不变，退货/结算/财务报表也都不用改。
--
-- 这两列只做两件事：
--   1. `credit_amount_applied`：让顾客与客服看得见"这单抵了多少"（金额已含在净货款里）
--   2. `custom_recipe_credit_order_id`：留痕"额度是从哪张定制单来的"，
--      供后台核对与财务审计。
--
-- 注意 `custom_recipe_credit_order_id` **故意不加唯一约束**：
-- 额度支持余额结转（货款不足 ¥300 时余额留到下次），
-- 同一张定制单可以抵多张成品单，加唯一约束会直接堵死这个业务规则。
--
-- 只新增列且有默认值，不改动既有数据，可安全重跑。

ALTER TABLE "order"
    ADD COLUMN "credit_amount_applied" DECIMAL(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN "custom_recipe_credit_order_id" TEXT;
