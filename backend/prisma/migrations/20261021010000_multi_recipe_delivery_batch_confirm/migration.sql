-- 2026-10-21 多份购买 · 第二阶段：顾客确认收到
--
-- 只给批次头新增两列，不改既有列、不动老的单份交付表：
--   · confirmed_at    ：顾客确认收到的时间（幂等，不被第二次点击刷新）
--   · confirm_channel ：CUSTOMER（顾客主动确认）/ AUTO（超期自动完成）
-- 老订单 / 老交付记录不受影响（老表 custom_recipe_delivery 已有同名字段）。
-- 回滚直接 drop 这两列即可。

-- AlterTable
ALTER TABLE "custom_recipe_delivery_batch" ADD COLUMN     "confirm_channel" VARCHAR(20),
ADD COLUMN     "confirmed_at" TIMESTAMP(3);
