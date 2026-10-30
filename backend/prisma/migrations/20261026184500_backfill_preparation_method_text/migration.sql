-- 2026-10-26 Phase 2：把可编辑原料项里的旧字典 ID 回填成中文。
--
-- 只改 DesignRecipeItem / RecipeItem 这两张可编辑表；
-- 历史发布快照（design_recipe_publish_snapshot / custom_recipe_delivery）
-- 保持原样，读取时仍由 legacy resolver 解析。
--
-- 1) 纯字典 ID：按 preparation_method.name 回填（36 行）。
UPDATE design_recipe_item AS d
SET preparation_method = p.name
FROM preparation_method AS p
WHERE d.preparation_method = p.id::text;

UPDATE recipe_item AS r
SET preparation_method = p.name
FROM preparation_method AS p
WHERE r.preparation_method = p.id::text;

-- 2) 混合旧值：未知字典 ID 76b12041-3a5e-4aaf-b605-6f2648275ad1
--    在字典里已找不到对应名称（2 行）。按老板确认，删掉该 ID 及其后的顿号，
--    保留前后可读文案：「去老梗、流水冲洗、盐水/小苏打浸泡30分钟、生重、打碎、充分搅拌」。
UPDATE recipe_item
SET preparation_method = replace(
  preparation_method,
  '76b12041-3a5e-4aaf-b605-6f2648275ad1、',
  ''
)
WHERE preparation_method LIKE '%76b12041-3a5e-4aaf-b605-6f2648275ad1%';
