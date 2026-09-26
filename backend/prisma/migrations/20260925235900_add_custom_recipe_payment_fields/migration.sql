-- 定制订单接入微信支付所需的字段与状态
--
-- 背景：定制费此前只能"加微信客服人工转账 + 后台确认收款"，
-- 顾客提交完就断在页面上。本次接入小程序内微信支付，需要：
--
--   1. 状态机补 CANCELLED：未付款超时后要能关单，否则僵尸单会一直占着
--      当天的排期名额（booked_count 只增不减，接单能力被慢慢吃光）。
--   2. payment_transaction_id：存微信交易号，客服对账与退款排查要用。
--   3. cancelled_at / cancellation_reason：关单留痕，客服能解释"这单怎么没了"。
--
-- 只新增枚举值与列，不改动既有数据；枚举新增值不影响历史行。

ALTER TYPE "CustomRecipeStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

ALTER TABLE "custom_recipe_order"
    ADD COLUMN "payment_transaction_id" VARCHAR(128),
    ADD COLUMN "cancelled_at" TIMESTAMP(3),
    ADD COLUMN "cancellation_reason" VARCHAR(200);
