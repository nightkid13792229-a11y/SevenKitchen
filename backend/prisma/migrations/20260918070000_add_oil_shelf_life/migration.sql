-- 油性补剂单独一档分装效期
-- 鱼油/鱼肝油这类软胶囊内容物易氧化酸败，标签效期要比普通片剂/胶囊更保守。
-- 用「是否油性」而不是新增物理形态：油性是内容物属性，且未来液体油类同样适用。

ALTER TABLE "ingredient"
  ADD COLUMN "is_oil_based" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "supplement_shop_config"
  ADD COLUMN "oil_shelf_life_months" INTEGER NOT NULL DEFAULT 6;
