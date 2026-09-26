-- 试吃装（现货）订单接入
--
-- 试吃装是现货：顾客下单只扣成品库存，不走采购、不排产、不生产。
-- 因此订单体系需要三处改动：
--
--   1. OrderType 增加 TASTING_PACK —— 让订单能被识别、筛选、统计，
--      并在采购/排产的查询里**显式排除**（而不是靠"碰巧查不到"）。
--   2. order_item 增加 tasting_pack_id —— 便于按商品统计销量；
--      菜品/配方信息仍在 recipe_snapshot 里（快照，事后改商品不影响老订单）。
--   3. daily_intake_g 本就允许为空（schema 里是 nullable）——
--      试吃装没有"每日饭量"这个概念，订单里存 null，不再硬塞一个假数字。
--
-- 只新增枚举值与列，不改动既有数据。

ALTER TYPE "OrderType" ADD VALUE IF NOT EXISTS 'TASTING_PACK';

ALTER TABLE "order_item"
    ADD COLUMN IF NOT EXISTS "tasting_pack_id" TEXT;

CREATE INDEX IF NOT EXISTS "order_item_tasting_pack_id_idx"
    ON "order_item"("tasting_pack_id");
