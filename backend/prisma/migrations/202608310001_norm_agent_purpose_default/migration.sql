-- 规范化 Agent 用途：把原有唯一配置 NUTRITION_CANDIDATE_REVIEW 迁移为全局默认 DEFAULT。
-- 现有所有不指定用途的 AI/Agent 调用都已回退到 DEFAULT，因此需要确保 DEFAULT 记录存在且继承原配置。
UPDATE "agent_provider_config"
SET purpose = 'DEFAULT'
WHERE purpose = 'NUTRITION_CANDIDATE_REVIEW'
  AND provider = 'DEEPSEEK'
  AND NOT EXISTS (
    SELECT 1 FROM "agent_provider_config" d
    WHERE d.purpose = 'DEFAULT' AND d.provider = 'DEEPSEEK'
  );
