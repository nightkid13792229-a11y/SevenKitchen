ALTER TABLE "customer_service_config"
ADD COLUMN "order_detail_delivery_note" VARCHAR(500),
ADD COLUMN "order_detail_aftersale_note" VARCHAR(500),
ADD COLUMN "order_detail_merchant_note" VARCHAR(500);

ALTER TABLE "customer_service_config"
ALTER COLUMN "order_card_path_template" SET DEFAULT '/pages/order-detail/index?id={orderId}';

UPDATE "customer_service_config"
SET "order_card_path_template" = '/pages/order-detail/index?id={orderId}'
WHERE "order_card_path_template" = '/pages/orders/detail?id={orderId}';
