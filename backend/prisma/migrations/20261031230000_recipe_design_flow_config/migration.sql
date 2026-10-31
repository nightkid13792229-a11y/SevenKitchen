-- AI 食谱设计按流程拆分配置（2026-10-31）
--
-- 背景：产品线与定制订单要分别配置模型，且都不再回退系统默认。
-- 做法：以现有 RECIPE_DESIGN 那一行为模板，克隆出两条新键，
--       密钥沿用同一份加密值（不回明文、不需要重新填 Key）。
-- 幂等：已存在同名用途时不动。

INSERT INTO "agent_provider_config" (
  "id",
  "purpose",
  "provider",
  "enabled",
  "base_url",
  "model",
  "review_model",
  "api_key_encrypted",
  "api_key_last4",
  "max_concurrency",
  "request_timeout_ms",
  "retry_count",
  "created_at",
  "updated_at"
)
SELECT
  md5(random()::text || clock_timestamp()::text),
  flow.purpose,
  source."provider",
  source."enabled",
  source."base_url",
  source."model",
  NULL,
  source."api_key_encrypted",
  source."api_key_last4",
  1,
  90000,
  2,
  now(),
  now()
FROM "agent_provider_config" AS source
CROSS JOIN (
  VALUES ('RECIPE_DESIGN_CATALOG'), ('RECIPE_DESIGN_ORDER')
) AS flow(purpose)
WHERE source."purpose" = 'RECIPE_DESIGN'
  AND source."provider" = 'DEEPSEEK'
  AND NOT EXISTS (
    SELECT 1
    FROM "agent_provider_config" AS existing
    WHERE existing."purpose" = flow.purpose
      AND existing."provider" = 'DEEPSEEK'
  );
