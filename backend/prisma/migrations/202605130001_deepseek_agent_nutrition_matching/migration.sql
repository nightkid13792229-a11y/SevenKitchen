CREATE TABLE IF NOT EXISTS "agent_provider_config" (
  "id" TEXT NOT NULL,
  "purpose" VARCHAR(80) NOT NULL,
  "provider" VARCHAR(40) NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "base_url" TEXT NOT NULL,
  "model" VARCHAR(120) NOT NULL,
  "api_key_encrypted" TEXT,
  "api_key_last4" VARCHAR(12),
  "max_concurrency" INTEGER NOT NULL DEFAULT 1,
  "request_timeout_ms" INTEGER NOT NULL DEFAULT 90000,
  "retry_count" INTEGER NOT NULL DEFAULT 2,
  "updated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agent_provider_config_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "agent_provider_config_purpose_provider_key"
  ON "agent_provider_config"("purpose", "provider");

CREATE TABLE IF NOT EXISTS "nutrition_agent_review_job" (
  "id" TEXT NOT NULL,
  "status" VARCHAR(40) NOT NULL,
  "provider" VARCHAR(40) NOT NULL,
  "model" VARCHAR(120) NOT NULL,
  "scope" JSONB,
  "force_rerun" BOOLEAN NOT NULL DEFAULT false,
  "limit" INTEGER NOT NULL DEFAULT 50,
  "total_count" INTEGER NOT NULL DEFAULT 0,
  "processed_count" INTEGER NOT NULL DEFAULT 0,
  "success_count" INTEGER NOT NULL DEFAULT 0,
  "failed_count" INTEGER NOT NULL DEFAULT 0,
  "skipped_count" INTEGER NOT NULL DEFAULT 0,
  "failure_details" JSONB,
  "last_error" TEXT,
  "created_by" TEXT,
  "started_at" TIMESTAMP(3),
  "finished_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "nutrition_agent_review_job_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "nutrition_agent_review_job_status_idx"
  ON "nutrition_agent_review_job"("status");

CREATE INDEX IF NOT EXISTS "nutrition_agent_review_job_created_at_idx"
  ON "nutrition_agent_review_job"("created_at");
