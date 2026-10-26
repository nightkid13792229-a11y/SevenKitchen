-- 原料预处理历史按 ingredientId 查询；recipe_item 之前只有 recipeId/nutritionFoodId 索引。
CREATE INDEX IF NOT EXISTS "recipe_item_ingredient_id_idx"
  ON "recipe_item"("ingredient_id");
