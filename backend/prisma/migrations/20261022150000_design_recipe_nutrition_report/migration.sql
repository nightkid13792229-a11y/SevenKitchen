-- 2026-10-22: 草稿营养报告落库。
-- 保存最近一次生成的发布口径 report 对象，同时记录生成时的 contentRevision：
-- 当前 contentRevision 与 nutrition_report_revision 不一致时，报告即为过期。
-- 不修改已发布食谱 / 订单交付快照。

ALTER TABLE "design_recipe"
  ADD COLUMN IF NOT EXISTS "nutrition_report_json" JSONB,
  ADD COLUMN IF NOT EXISTS "nutrition_report_revision" INTEGER,
  ADD COLUMN IF NOT EXISTS "nutrition_report_generated_at" TIMESTAMP(3);
