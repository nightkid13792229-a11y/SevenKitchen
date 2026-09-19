-- 成品鲜食链路 · 转化漏斗事件
--
-- 目的：让「首页 → 详情 → 点买成品 → 登录 → 建档 → 订购页出价 → 结算 → 支付」
-- 每一步的流失都可度量。当前小程序只有狗狗档案的埋点，成品链路上一个都没有。
--
-- 与 dog_profile_event 的差异：
--   1. customer_id 可空——登录前的浏览与点击也必须能采集，否则漏斗前半段永远是空的；
--   2. 面向整条购买链路，因此增加 session_id（把匿名段与登录后串起来）与 recipe_id/order_id。

CREATE TABLE "product_funnel_event" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT,
    "session_id" TEXT,
    "event_name" TEXT NOT NULL,
    "step" TEXT,
    "recipe_id" TEXT,
    "dog_id" TEXT,
    "order_id" TEXT,
    "entry_source" TEXT,
    "properties" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_funnel_event_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "product_funnel_event_event_name_created_at_idx"
    ON "product_funnel_event"("event_name", "created_at");

CREATE INDEX "product_funnel_event_customer_id_created_at_idx"
    ON "product_funnel_event"("customer_id", "created_at");

CREATE INDEX "product_funnel_event_session_id_created_at_idx"
    ON "product_funnel_event"("session_id", "created_at");

CREATE INDEX "product_funnel_event_recipe_id_created_at_idx"
    ON "product_funnel_event"("recipe_id", "created_at");
