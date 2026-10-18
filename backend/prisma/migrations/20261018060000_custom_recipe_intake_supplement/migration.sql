-- 需求 2.3.4「第二段：补充（只问档案里没有的）」（2026-10-18）
--
-- 三组输入：
--   ① 它现在吃什么（必填）—— current_food_main + change_reasons(+other)
--   ② 最近肠胃怎么样（选填）—— stomach_conditions
--
-- 为什么必填第一组：交付物要写「第 1 周按 7:3 混原来的粮，约 2 周过渡」，
-- 但「原来的粮」是什么营养师不知道 —— 没有它，过渡方案只能写套话。
--
-- 全部是**加列**，不动已有数据。老订单这些列为 NULL / 空数组，
-- 前端按"没填"处理（不显示、不参与任何计算）。
ALTER TABLE "custom_recipe_order"
  ADD COLUMN "current_food_main" VARCHAR(32),
  ADD COLUMN "change_reasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "change_reason_other" VARCHAR(120),
  ADD COLUMN "stomach_conditions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
