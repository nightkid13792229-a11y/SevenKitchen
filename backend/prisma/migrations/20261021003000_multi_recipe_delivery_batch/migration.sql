-- 2026-10-21 多份购买 · 第二阶段：批量交付
--
-- 只新增两张表，不改既有表（老的单份交付表 custom_recipe_delivery 保留不动）：
--   · custom_recipe_delivery_batch：一次交付 N 份的批次头
--   · custom_recipe_delivery_item ：批次里每份食谱各自的内容快照
-- 回滚直接 drop 这两张表即可。

-- CreateTable
CREATE TABLE "custom_recipe_delivery_batch" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "delivered_by" TEXT NOT NULL,
    "delivered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notify_status" VARCHAR(20),
    "notified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_recipe_delivery_batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_recipe_delivery_item" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "recipe_id" TEXT NOT NULL,
    "recipe_version" INTEGER NOT NULL,
    "content_snapshot" JSONB NOT NULL,
    "items" JSONB NOT NULL DEFAULT '[]',
    "feeding_params" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_recipe_delivery_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "custom_recipe_delivery_batch_order_id_idx" ON "custom_recipe_delivery_batch"("order_id");

-- CreateIndex
CREATE INDEX "custom_recipe_delivery_batch_delivered_at_idx" ON "custom_recipe_delivery_batch"("delivered_at");

-- CreateIndex
CREATE UNIQUE INDEX "custom_recipe_delivery_batch_order_id_version_key" ON "custom_recipe_delivery_batch"("order_id", "version");

-- CreateIndex
CREATE INDEX "custom_recipe_delivery_item_batch_id_idx" ON "custom_recipe_delivery_item"("batch_id");

-- CreateIndex
CREATE INDEX "custom_recipe_delivery_item_recipe_id_idx" ON "custom_recipe_delivery_item"("recipe_id");

-- CreateIndex
CREATE UNIQUE INDEX "custom_recipe_delivery_item_batch_id_recipe_id_key" ON "custom_recipe_delivery_item"("batch_id", "recipe_id");

-- AddForeignKey
ALTER TABLE "custom_recipe_delivery_batch" ADD CONSTRAINT "custom_recipe_delivery_batch_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "custom_recipe_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_recipe_delivery_item" ADD CONSTRAINT "custom_recipe_delivery_item_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "custom_recipe_delivery_batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_recipe_delivery_item" ADD CONSTRAINT "custom_recipe_delivery_item_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
