-- 补剂标签：干燥剂提示
-- 分装方案要求每个袋子配食品级硅胶干燥剂，标签必须提醒用户请勿食用

ALTER TABLE "supplement_shop_config"
  ADD COLUMN "label_include_desiccant_notice" BOOLEAN NOT NULL DEFAULT true;
