-- 2026-10-22: 设计草稿产品展示字段。
-- 后台设计器先保存展示素材，发布 / 加入待提交时由共享门槛校验：
--   · cover_image_url / cover_title：产品线与订单设计都必填；
--   · description / selling_point：产品线上架文案；
--   · detail_images / video_url：可选的详情素材。
-- 只新增可空列，不改已发布食谱 / 订单交付快照。

ALTER TABLE "design_recipe"
  ADD COLUMN IF NOT EXISTS "cover_image_url" TEXT,
  ADD COLUMN IF NOT EXISTS "cover_title" VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "selling_point" VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "detail_images" JSONB,
  ADD COLUMN IF NOT EXISTS "video_url" TEXT;
