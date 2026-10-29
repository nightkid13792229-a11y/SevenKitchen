-- 一草稿一会话（2026-10-29）：同一草稿停止/失败后继续运行时会续写同一会话。
-- 「本次」的步数/token 需要从本轮起点算，不能把草稿累计当成单次任务累计。
ALTER TABLE "recipe_design_agent_session"
  ADD COLUMN "run_start_step_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "run_start_prompt_tokens" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "run_start_completion_tokens" INTEGER NOT NULL DEFAULT 0;

-- 老会话的「本轮起点」设为当前累计：升级后第一次打开显示本次为 0，
-- 下次发消息开始时再按当时的累计重置。
UPDATE "recipe_design_agent_session"
SET "run_start_step_count" = "step_count",
    "run_start_prompt_tokens" = "prompt_tokens",
    "run_start_completion_tokens" = "completion_tokens";
