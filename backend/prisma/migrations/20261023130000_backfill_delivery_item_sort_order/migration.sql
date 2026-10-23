-- 旧批次没有 sort_order，按创建时间回填会把「第 3/1/2 份」排乱。
-- 设计槽位的 createdAt 才是顾客实际的设计顺序，用它重排一次。
WITH ranked AS (
  SELECT di.id,
         row_number() OVER (
           PARTITION BY di.batch_id
           ORDER BY COALESCE(ord.created_at, di.created_at) ASC, di.id ASC
         ) - 1 AS rn
  FROM "custom_recipe_delivery_item" di
  LEFT JOIN "recipe" r ON r.id = di.recipe_id
  LEFT JOIN "order_recipe_design" ord
    ON ord.design_draft_id = r.source_design_recipe_id
)
UPDATE "custom_recipe_delivery_item" AS item
SET sort_order = ranked.rn
FROM ranked
WHERE item.id = ranked.id;
