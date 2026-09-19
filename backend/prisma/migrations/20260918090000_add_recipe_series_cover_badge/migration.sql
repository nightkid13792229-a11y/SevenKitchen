-- 食谱系列 · 封面角标（系列级）
--
-- 背景：封面角标原先存在 Recipe.coverTitle（每个生命阶段版本各一份），带来两个问题：
--   1. 同一道菜的多个生命阶段版本要逐个改，运营成本高且容易漏改；
--   2. 它是**无任何校验的自由文本**，违规词（IBD / 抗炎 / 低敏 等）可以直接填进去，
--      而角标恰恰展示在首页商品橱窗上，属对外宣传。
--
-- 本表把角标上移到**系列层级**，并且只允许引用 `recipe_health_tag`（合规词表），
-- 从结构上保证：改一次全系列生效，且不可能出现词表之外的表述。

CREATE TABLE "recipe_series_cover_badge" (
    "id" TEXT NOT NULL,
    "series_id" TEXT NOT NULL,
    "health_tag_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipe_series_cover_badge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "recipe_series_cover_badge_series_id_health_tag_id_key"
    ON "recipe_series_cover_badge"("series_id", "health_tag_id");

CREATE INDEX "recipe_series_cover_badge_series_id_idx"
    ON "recipe_series_cover_badge"("series_id");

CREATE INDEX "recipe_series_cover_badge_health_tag_id_idx"
    ON "recipe_series_cover_badge"("health_tag_id");

ALTER TABLE "recipe_series_cover_badge"
    ADD CONSTRAINT "recipe_series_cover_badge_series_id_fkey"
    FOREIGN KEY ("series_id") REFERENCES "recipe_series"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "recipe_series_cover_badge"
    ADD CONSTRAINT "recipe_series_cover_badge_health_tag_id_fkey"
    FOREIGN KEY ("health_tag_id") REFERENCES "recipe_health_tag"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
