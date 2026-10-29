-- 定制食谱交付后按「虚拟商品」上报微信发货信息，作为幂等标记
ALTER TABLE "custom_recipe_order"
ADD COLUMN "wechat_shipping_uploaded_at" TIMESTAMP(3);
