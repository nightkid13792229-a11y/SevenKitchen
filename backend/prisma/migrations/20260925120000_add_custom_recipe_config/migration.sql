-- 食谱定制的可配置项（单例）
--
-- 背景：定制费原先写死在 CustomRecipeService.ORDER_AMOUNT = 299，
-- 交付周期与每日接单上限同样写死（WORK_DAYS / DEFAULT_CAPACITY），
-- 每次调价或调产能都要改代码发版。
--
-- 本次把定制业务的价格与产能参数解耦成独立单例配置，并在后台「食谱定制设置」可调。
--
-- 关键解耦点：`fee_amount`（定制费）与 `credit_amount`（可抵扣金额）是两个独立字段 ——
-- 顾客付多少钱、其中多少钱能抵成品货款，由业务分开决定，
-- 不再强制"付多少就抵多少"。
--
-- 只新增表，不改动既有数据，可安全重跑（migrate deploy 幂等）。

CREATE TABLE "custom_recipe_config" (
    "id" VARCHAR(255) NOT NULL DEFAULT 'singleton',
    "fee_amount" DECIMAL(10,2) NOT NULL DEFAULT 300,
    "credit_amount" DECIMAL(10,2) NOT NULL DEFAULT 300,
    "delivery_work_days" INTEGER NOT NULL DEFAULT 3,
    "daily_capacity" INTEGER NOT NULL DEFAULT 4,
    "payment_timeout_minutes" INTEGER NOT NULL DEFAULT 30,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_recipe_config_pkey" PRIMARY KEY ("id")
);

-- 定制单上的抵扣额度台账（提交时快照，后台调价不影响老单）
--
-- 为什么在阶段一就加：抵扣额度必须在**顾客提交定制单的那一刻**按当时的
-- 配置快照下来。若拖到阶段三再加，阶段一~三之间提交的订单会没有快照，
-- 事后无法还原"这位顾客当时被承诺了多少额度"。
--
-- 默认 300 与当前口径一致，只为新增列，不改动既有数据。
ALTER TABLE "custom_recipe_order"
    ADD COLUMN "credit_amount" DECIMAL(10,2) NOT NULL DEFAULT 300,
    ADD COLUMN "credit_used" DECIMAL(10,2) NOT NULL DEFAULT 0;

