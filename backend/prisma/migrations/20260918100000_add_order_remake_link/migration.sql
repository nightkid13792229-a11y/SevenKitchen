-- 售后「免费重做」：新增 0 元重做单与父子关联
--
-- 背景：原先 resolveAftersale('remade') 只把订单状态改成 IN_PRODUCTION，
--   1) 采购清单只取 PAID 订单 → 不会进去；
--   2) 生产排产只取 PURCHASING 订单 → 不在候选；
--   3) 订单条目仍挂着上一批的 production_batch_id → 无法被重新分配。
-- 结果：订单显示"生产中"，但不会有任何批次产生，货永远不会产出（静默失败）。
--
-- 解决：重做时新建一张 **0 元的 PAID 订单**，复制原单条目，走完整的正常流程。
--   本迁移只加"原单 ↔ 重做单"的父子关联字段，不改变任何既有数据。

ALTER TABLE "order" ADD COLUMN "remake_from_order_id" TEXT;

-- 一张原单最多被重做一次（数据库级防重复）
CREATE UNIQUE INDEX "order_remake_from_order_id_key"
    ON "order" ("remake_from_order_id");

-- 便于按"是不是重做单"过滤（C 端列表、营收报表都用这个条件）
CREATE INDEX "order_remake_from_order_id_idx"
    ON "order" ("remake_from_order_id");

ALTER TABLE "order"
    ADD CONSTRAINT "order_remake_from_order_id_fkey"
    FOREIGN KEY ("remake_from_order_id") REFERENCES "order" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
