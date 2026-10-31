-- AI 食谱设计：两条流程统一用最新版 DeepSeek V4.1 Flash（2026-10-31）
--
-- 模型名就是 `deepseek-flash` —— 不是 `deepseek-v4.1-flash`。
-- 官方「模型 & 价格」写明"模型名请使用 deepseek-flash"，
-- 它的模型版本才是 DeepSeek-V4.1-Flash-1017。

UPDATE "agent_provider_config"
SET "model" = 'deepseek-flash',
    "updated_at" = now()
WHERE "provider" = 'DEEPSEEK'
  AND "purpose" IN ('RECIPE_DESIGN_CATALOG', 'RECIPE_DESIGN_ORDER');
