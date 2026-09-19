-- 补剂商城（DIY 制作单 → 一键购买补剂 → 后台分装发货）基础档案字段
-- 设计文档：docs/plans/2026-09-18-supplement-shop-design.md
--
-- physical_form：物理形态，决定分装作业方式（粉剂需称重；片剂/胶囊数数；液体暂不支持分装）
-- supplement_retail_enabled：是否上架到补剂商城（默认不上架，需人工逐个开启）
-- shelf_life_months：原厂保质期（月），用作分装有效期的上限提示
-- storage_condition：储存条件（如"避光、密封、阴凉干燥"）
-- opened_shelf_life_days：开封后建议使用天数

CREATE TYPE "IngredientPhysicalForm" AS ENUM ('POWDER', 'TABLET', 'CAPSULE', 'LIQUID');

ALTER TABLE "ingredient"
  ADD COLUMN "physical_form" "IngredientPhysicalForm",
  ADD COLUMN "supplement_retail_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "shelf_life_months" INTEGER,
  ADD COLUMN "storage_condition" VARCHAR(200),
  ADD COLUMN "opened_shelf_life_days" INTEGER;

CREATE INDEX "ingredient_supplement_retail_enabled_idx"
  ON "ingredient"("supplement_retail_enabled");
