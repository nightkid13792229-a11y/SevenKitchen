-- 补剂分装标签
-- 1) 订单行快照储存条件，标签不再依赖原料档案的后续改动
-- 2) 商城配置增加标签上的品牌名（分装者）

ALTER TABLE "supplement_order_item"
  ADD COLUMN "storage_condition" VARCHAR(200);

ALTER TABLE "supplement_shop_config"
  ADD COLUMN "label_brand_name" VARCHAR(100) NOT NULL DEFAULT '赛文的食堂';
