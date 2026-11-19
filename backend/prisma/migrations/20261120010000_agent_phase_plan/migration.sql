-- 食谱设计 Agent 三阶段：方案确认 / 选材 / 配方编辑（2026-11-20）
CREATE TYPE "RecipeAgentPhase" AS ENUM ('PLAN', 'SELECT', 'DESIGN');

ALTER TABLE "recipe_design_agent_session"
  ADD COLUMN "phase" "RecipeAgentPhase" NOT NULL DEFAULT 'DESIGN',
  ADD COLUMN "plan" JSONB,
  ADD COLUMN "plan_confirmed_at" TIMESTAMP(3),
  ADD COLUMN "selection" JSONB,
  ADD COLUMN "selection_confirmed_at" TIMESTAMP(3);
