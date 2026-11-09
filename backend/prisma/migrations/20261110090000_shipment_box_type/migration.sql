-- 包裹箱型与保温袋（D2）
ALTER TABLE "order_shipment_package"
  ADD COLUMN "box_ingredient_id" VARCHAR(36),
  ADD COLUMN "thermal_bag_ingredient_id" VARCHAR(36);
