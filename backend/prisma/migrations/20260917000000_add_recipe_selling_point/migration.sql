-- AlterTable
-- 一句话卖点：合规文案，由 AI 生成 + 人工确认后保存（详见 docs/plans/2026-09-17-ai-recipe-copywriting-design.md）
ALTER TABLE "recipe" ADD COLUMN "selling_point" VARCHAR(120);
