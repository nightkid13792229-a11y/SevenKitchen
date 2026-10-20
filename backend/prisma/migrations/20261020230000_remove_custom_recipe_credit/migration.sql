-- 2026-10-20：取消「定制费抵扣成品鲜食」
--
-- 没有真实历史顾客订单（唯一已支付订单是测试单），因此直接删列，
-- 不做余额迁移或兼容保留。删除的 5 个列：
--   order.credit_amount_applied / order.custom_recipe_credit_order_id
--   custom_recipe_order.credit_amount / custom_recipe_order.credit_used
--   custom_recipe_config.credit_amount
--
-- 回滚需要重新加列并回填默认值（credit_amount 默认 300、其余 0/null）。

-- AlterTable
ALTER TABLE "order" DROP COLUMN "credit_amount_applied",
DROP COLUMN "custom_recipe_credit_order_id";

-- AlterTable
ALTER TABLE "custom_recipe_order" DROP COLUMN "credit_amount",
DROP COLUMN "credit_used";

-- AlterTable
ALTER TABLE "custom_recipe_config" DROP COLUMN "credit_amount";
