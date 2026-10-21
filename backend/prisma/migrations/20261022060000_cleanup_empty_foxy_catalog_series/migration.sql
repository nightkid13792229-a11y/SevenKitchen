-- 2026-10-22: 清理一个空的 CATALOG 系列，避免在食谱设计列表里被误认为订单食谱。
-- 只删除同时满足以下条件的目标，任何一项有数据都保持原样：
--   · 系列 id 固定；
--   · designMode = CATALOG；
--   · 没有任何设计草稿原料；
--   · 没有任何正式食谱；
--   · 没有被订单设计槽位引用。

DELETE FROM design_recipe
WHERE series_id = 'f4735f36-9214-4ab9-813e-f8a94ba9264b'
  AND NOT EXISTS (
    SELECT 1 FROM design_recipe_item
    WHERE design_recipe_item.design_recipe_id = design_recipe.id
  );

DELETE FROM recipe_series
WHERE id = 'f4735f36-9214-4ab9-813e-f8a94ba9264b'
  AND design_mode = 'CATALOG'
  AND NOT EXISTS (
    SELECT 1 FROM design_recipe
    WHERE design_recipe.series_id = recipe_series.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM recipe
    WHERE recipe.series_id = recipe_series.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM order_recipe_design
    WHERE order_recipe_design.series_id = recipe_series.id
  );
