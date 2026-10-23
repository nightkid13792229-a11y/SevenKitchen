ALTER TABLE "custom_recipe_delivery_item"
  ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY batch_id
           ORDER BY created_at ASC, id ASC
         ) - 1 AS rn
  FROM "custom_recipe_delivery_item"
)
UPDATE "custom_recipe_delivery_item" AS item
SET sort_order = ranked.rn
FROM ranked
WHERE item.id = ranked.id;
