-- 补剂订单的支付超时，与鲜食订单解耦
--
-- 背景：补剂订单原先直接复用「支付配置」里的 payment_timeout_minutes，
-- 而那个值同时管着鲜食订单。两种生意节奏不同（补剂是分装小包、鲜食是冷链鲜食），
-- 共用一个值会导致调一边影响另一边。
--
-- 0 表示不自动关单。默认 30 分钟，与原共享值一致，所以行为不会突变。

ALTER TABLE "supplement_shop_config"
    ADD COLUMN "payment_timeout_minutes" INTEGER NOT NULL DEFAULT 30;
