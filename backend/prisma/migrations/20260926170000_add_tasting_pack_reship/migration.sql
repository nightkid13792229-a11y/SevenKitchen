-- 试吃装「一键补发」
--
-- 背景：试吃装是现货（货已经冻在库里），出了问题不能走"重做"——
-- 重做会回到采购→排产→生产，对一份早就做好的存货毫无意义。
-- 顾客要的是"再寄一份"，客服现在只能线下自己寄，系统里既没有补发单，
-- 成品库存也不会扣减，月底盘库必然对不上。
--
-- 本次改动：
--   1. 售后类型补 RESHIP（免费补发），与 REFUND / REMAKE / COMPLAINT / RESOLVED 并列。
--      只新增枚举值、不改动既有数据；新值不在本事务内使用，符合 PostgreSQL 限制。
--   2. order 表加 reship_from_order_id：补发单反向指向原单。

ALTER TYPE "AftersaleType" ADD VALUE IF NOT EXISTS 'RESHIP';

ALTER TABLE "order"
    ADD COLUMN "reship_from_order_id" TEXT;

-- 防重复用**部分唯一索引**而不是普通唯一索引：
--   普通唯一索引会把"取消过的补发单"也算进占用 —— 补发单被取消后
--   （货没寄出去、库存也已经退回），原单就再也补发不了了，
--   只能让开发手工改库，这是运维事故。
--   加上 status <> 'CANCELLED' 之后，取消掉的补发单不再挡路，
--   而"同一张原单同时存在两张有效补发单"仍然被数据库挡住。
--   （Prisma schema 表达不了部分索引，所以这条约束只存在于这里。）
CREATE UNIQUE INDEX "order_reship_from_order_id_active_key"
    ON "order" ("reship_from_order_id")
    WHERE "reship_from_order_id" IS NOT NULL AND "status" <> 'CANCELLED';

CREATE INDEX "order_reship_from_order_id_idx"
    ON "order" ("reship_from_order_id");

ALTER TABLE "order"
    ADD CONSTRAINT "order_reship_from_order_id_fkey"
    FOREIGN KEY ("reship_from_order_id") REFERENCES "order" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
