-- 2026-10-22: 产品线分阶段发布（系列级发布设置）。
--
-- 阶段设计先以 recipe.status=DRAFT 存入系列仓库；只有当
-- required_life_stages 全部就绪、且系列级产品展示资料齐全时，
-- 管理员才能把**整个系列**一次性发布：
--   · 该系列所有阶段 Recipe → PUBLIC；
--   · 系列 business_status → PUBLIC；
--   · 系列展示资料复制到每条 Recipe。
--
-- 展示资料因此从「单个阶段草稿」上移到「系列」：
-- 同一系列的各个生命阶段共用一套封面图 / 封面标题 / 一句话卖点 / 目标健康标签。
-- 只新增列，不改已发布食谱 / 设计草稿 / 订单交付快照。

ALTER TABLE "recipe_series"
  ADD COLUMN IF NOT EXISTS "required_life_stages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "cover_image_url" TEXT,
  ADD COLUMN IF NOT EXISTS "cover_title" VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "selling_point" VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "target_health_tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
