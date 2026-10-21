-- 把生产损耗率从「食谱定制设置」迁到「全局配置」时，
-- 新列默认是 1.07，但老板实际在旧配置里填的是 1.05。
-- 这次迁移只做一次数据回填：新全局值优先沿用旧配置的实际值，
-- 避免迁移本身悄悄改变投料/成本口径；之后由后台全局配置页维护。
UPDATE "global_config"
SET "production_loss_rate" = COALESCE(
  (SELECT "production_loss_rate" FROM "custom_recipe_config" LIMIT 1),
  "production_loss_rate"
);
