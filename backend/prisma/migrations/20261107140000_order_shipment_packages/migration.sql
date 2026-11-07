-- 合并发货 / 拆包发货（2026-11-07）
--
-- 一次发货 = 一票（order_shipment），票里装 1~N 张订单、1~M 个包裹。
--   · 多张订单装进 1 个包裹 = 合并发货
--   · 1 张订单装进多个包裹   = 拆包发货
-- 包裹的运费按净重分摊到订单，结果落在 order_shipment_package_item.allocated_fee，
-- 再回写到 order.actual_shipping_fee（老报表 / 老接口不用改）。
--
-- 历史订单不回填：没有 order_shipment_order 行时，读路径把订单上的
-- tracking_number / actual_shipping_fee 当成 1 个虚拟包裹。

CREATE TABLE "order_shipment" (
    "id" VARCHAR(36) NOT NULL,
    "shipped_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shipped_by" VARCHAR(64),
    "cancelled_at" TIMESTAMP(3),
    "note" VARCHAR(200),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_shipment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "order_shipment_order" (
    "id" VARCHAR(36) NOT NULL,
    "shipment_id" VARCHAR(36) NOT NULL,
    "order_id" VARCHAR(36) NOT NULL,
    "total_weight_g" INTEGER NOT NULL,
    "total_bags" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_shipment_order_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "order_shipment_package" (
    "id" VARCHAR(36) NOT NULL,
    "shipment_id" VARCHAR(36) NOT NULL,
    "carrier_code" VARCHAR(32) NOT NULL,
    "tracking_number" VARCHAR(64) NOT NULL,
    "actual_shipping_fee" DECIMAL(10,2) NOT NULL,
    "weight_g" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_shipment_package_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "order_shipment_package_item" (
    "id" VARCHAR(36) NOT NULL,
    "package_id" VARCHAR(36) NOT NULL,
    "order_id" VARCHAR(36) NOT NULL,
    "spec_g" INTEGER NOT NULL,
    "bags" INTEGER NOT NULL,
    "weight_g" INTEGER NOT NULL,
    "allocated_fee" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_shipment_package_item_pkey" PRIMARY KEY ("id")
);

-- 一张订单同一时刻只能在一票里（I1）
CREATE UNIQUE INDEX "order_shipment_order_order_id_key" ON "order_shipment_order"("order_id");
CREATE INDEX "order_shipment_order_shipment_id_idx" ON "order_shipment_order"("shipment_id");
CREATE INDEX "order_shipment_shipped_at_idx" ON "order_shipment"("shipped_at");
CREATE UNIQUE INDEX "order_shipment_package_shipment_id_tracking_number_key" ON "order_shipment_package"("shipment_id", "tracking_number");
CREATE INDEX "order_shipment_package_shipment_id_idx" ON "order_shipment_package"("shipment_id");
CREATE INDEX "order_shipment_package_item_package_id_idx" ON "order_shipment_package_item"("package_id");
CREATE INDEX "order_shipment_package_item_order_id_idx" ON "order_shipment_package_item"("order_id");

ALTER TABLE "order_shipment_order" ADD CONSTRAINT "order_shipment_order_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "order_shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_shipment_order" ADD CONSTRAINT "order_shipment_order_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_shipment_package" ADD CONSTRAINT "order_shipment_package_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "order_shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_shipment_package_item" ADD CONSTRAINT "order_shipment_package_item_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "order_shipment_package"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_shipment_package_item" ADD CONSTRAINT "order_shipment_package_item_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
