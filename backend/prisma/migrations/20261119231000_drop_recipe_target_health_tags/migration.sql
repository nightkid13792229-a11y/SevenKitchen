-- 2026-11-19：健康标签改为唯一由 recipe_health_tag_assignment 关联表承载。
-- 食谱上的旧 JSON 列（线上全为 '[]'）不再读写，正式删除。
ALTER TABLE "recipe" DROP COLUMN "target_health_tags";
