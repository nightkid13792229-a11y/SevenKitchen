-- 内部生产损耗系数迁到全局配置（2026-10-21）
--
-- ## 为什么加这一列
--
-- 这个值原先挂在 `custom_recipe_config.production_loss_rate` 上，
-- 但它的实际用途是「新建定制食谱时写进 Recipe.productionLossRate」，
-- 与定制费/接单上限这类“食谱定制业务参数”不是一类东西。
-- 后台把它放在「食谱定制设置」里，容易让人以为改它会影响已有食谱。
--
-- 现在统一放到 `global_config`：
--   · 后台「全局配置 → 生产配置」编辑，名字叫「内部生产损耗系数」；
--   · 新建食谱（设计器发布 / 后台手工建食谱）只读这一列；
--   · 已有 `recipe.production_loss_rate` 与交付快照**保持原值**，不回溯。
--
-- `custom_recipe_config.production_loss_rate` 保留不删（兼容旧数据/回滚），
-- 但代码不再用它生成新食谱，后台也不再编辑它。
--
-- ## 只加列，可回滚
--
-- ADD COLUMN + 默认值，对已有数据无影响；回滚只需移除这一列
-- （老代码不读它，删掉不影响运行）。
--
-- 全程不改 `recipe` / 快照表，也不改任何生产损耗公式。

ALTER TABLE "global_config"
  ADD COLUMN "production_loss_rate" DECIMAL(65,30) NOT NULL DEFAULT 1.07;
