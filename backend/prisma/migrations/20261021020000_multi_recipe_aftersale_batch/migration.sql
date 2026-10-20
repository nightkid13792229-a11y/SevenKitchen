-- 2026-10-21 多份购买 · 第二阶段：按份售后
--
-- 只给售后表新增三列，不改既有列、不动老的单份交付表：
--   · delivery_batch_id ：这条售后针对哪一批交付（老订单为 NULL，仍用 delivery_id）
--   · delivery_item_ids ：这次要调整哪几份（custom_recipe_delivery_item.id）
--   · recipe_requests   ：每份各自的诉求说明 [{ deliveryItemId, description }]
-- 老订单 / 老售后记录不受影响（两列有默认值、一列可空）。
-- 回滚直接 drop 这三列与索引即可。

-- AlterTable
ALTER TABLE "custom_recipe_aftersale" ADD COLUMN     "delivery_batch_id" TEXT,
ADD COLUMN     "delivery_item_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "recipe_requests" JSONB;

-- CreateIndex
CREATE INDEX "custom_recipe_aftersale_delivery_batch_id_idx" ON "custom_recipe_aftersale"("delivery_batch_id");

-- AddForeignKey
ALTER TABLE "custom_recipe_aftersale" ADD CONSTRAINT "custom_recipe_aftersale_delivery_batch_id_fkey" FOREIGN KEY ("delivery_batch_id") REFERENCES "custom_recipe_delivery_batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
