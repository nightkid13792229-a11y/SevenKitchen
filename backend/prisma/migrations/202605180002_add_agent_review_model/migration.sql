ALTER TABLE "agent_provider_config"
ADD COLUMN IF NOT EXISTS "review_model" VARCHAR(120);
