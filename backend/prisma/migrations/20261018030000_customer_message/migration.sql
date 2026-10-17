-- 站内消息中心（2026-10-18 · 老板定）
--
-- ## 为什么需要它
--
-- 微信订阅消息有一个硬限制：**顾客没点过"允许"就发不出去**，而且失败不报错。
-- 也就是说，只看订阅消息的话，有一部分顾客永远收不到交付通知 ——
-- 而且我们不会知道是谁。
--
-- 站内消息是唯一"一定送得到"的渠道（顾客打开小程序就能看到）。
-- 两个都要：订阅消息负责"推一下"，站内消息负责"保证能看到"。
--
-- ## 为什么一张表而不是四张
--
-- 交付 / 售后 / 物流 / 系统公告看起来各不相干，但对顾客来说都是"我的消息"，
-- 混在一个列表里按时间排才是他要的。
-- 所以用 `category` 分类、`link_type` + `link_id` 指向业务对象 ——
-- **消息本身不存业务内容，只存一句摘要 + 一个指针**。

CREATE TABLE "customer_message" (
    "id"          TEXT         NOT NULL,
    "customer_id" TEXT         NOT NULL,
    "category"    VARCHAR(32)  NOT NULL,
    "title"       VARCHAR(120) NOT NULL,
    "body"        VARCHAR(500) NOT NULL,
    "link_type"   VARCHAR(32),
    "link_id"     VARCHAR(64),
    "read_at"     TIMESTAMP(3),
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_message_pkey" PRIMARY KEY ("id")
);

-- 列表按"谁 + 时间倒序"查
CREATE INDEX "customer_message_customer_id_created_at_idx"
    ON "customer_message"("customer_id", "created_at");

-- 未读数也走这个索引（read_at IS NULL 的计数）
CREATE INDEX "customer_message_customer_id_read_at_idx"
    ON "customer_message"("customer_id", "read_at");

ALTER TABLE "customer_message"
    ADD CONSTRAINT "customer_message_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "user"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
