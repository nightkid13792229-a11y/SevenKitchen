-- 2026-11-08：产品线发布改成「草稿 → 发布」。
--
-- 展示资料（封面 / 标题 / 卖点 / 健康标签）、封面角标、需求分类先写进
-- release_draft（JSON），顾客端继续看线上那组值；管理员点「发布这一版」时
-- 才一次性应用，应用完把三列清空。
--
-- 只加列，不改既有数据：没有草稿的系列行为完全不变。
ALTER TABLE "recipe_series"
  ADD COLUMN "release_draft" JSONB,
  ADD COLUMN "release_draft_updated_at" TIMESTAMP(3),
  ADD COLUMN "release_draft_updated_by" TEXT;
