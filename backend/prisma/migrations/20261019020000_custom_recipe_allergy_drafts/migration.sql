-- 定制单报告草稿 + 付款后再写狗狗档案（2026-10-19）
--
-- 背景：定制页里的过敏文字、上传的检测报告在付款前都只是“这一单的草稿”。
-- 原先：报告一确认就写狗狗档案；文字在提交订单（还没付款）时就写档案。
-- 结果：未付款/放弃的单也会改狗狗档案，删改报告还会留下旧结论。
--
-- 现在：
--   1. 报告文件/识别结果先存在订单的 allergy_report_drafts（JSONB）；
--   2. 付款成功后，由 syncPaidOrderToHealthProfile 转成正式的 allergy_report
--      + allergy_record，并把文字/疾病/偏好一并写入；
--   3. source_key 唯一键保证付款同步重试不会重复建报告。
ALTER TABLE "custom_recipe_order"
  ADD COLUMN "allergy_report_drafts" JSONB,
  ADD COLUMN "sync_to_health_profile" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "allergy_report"
  ADD COLUMN "source_key" VARCHAR(120);

CREATE UNIQUE INDEX "allergy_report_source_key_key"
  ON "allergy_report" ("source_key");
