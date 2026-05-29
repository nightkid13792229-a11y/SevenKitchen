CREATE TYPE "SearchGovernanceDomain" AS ENUM (
  'INGREDIENT',
  'NUTRITION_FOOD',
  'BREED',
  'ORDER'
);

CREATE TYPE "SearchAliasGroupStatus" AS ENUM (
  'ACTIVE',
  'DISABLED'
);

CREATE TYPE "SearchAliasRiskLevel" AS ENUM (
  'LOW',
  'MEDIUM',
  'HIGH'
);

CREATE TYPE "SearchAliasSuggestionAction" AS ENUM (
  'CREATE_GROUP',
  'ADD_ALIAS',
  'MERGE_GROUPS',
  'DISABLE_ALIAS',
  'UPDATE_CANONICAL'
);

CREATE TYPE "SearchAliasSuggestionStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED',
  'APPLIED',
  'FAILED'
);

CREATE TABLE "search_alias_group" (
  "id" TEXT NOT NULL,
  "domain" "SearchGovernanceDomain" NOT NULL,
  "canonical_term" VARCHAR(200) NOT NULL,
  "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" "SearchAliasGroupStatus" NOT NULL DEFAULT 'ACTIVE',
  "risk_level" "SearchAliasRiskLevel" NOT NULL DEFAULT 'LOW',
  "notes" TEXT,
  "created_by" TEXT,
  "updated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "search_alias_group_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "search_query_log" (
  "id" TEXT NOT NULL,
  "domain" "SearchGovernanceDomain" NOT NULL,
  "source" VARCHAR(120) NOT NULL,
  "raw_query" VARCHAR(300) NOT NULL,
  "normalized_query" VARCHAR(300) NOT NULL,
  "result_count" INTEGER NOT NULL DEFAULT 0,
  "selected_entity_type" VARCHAR(80),
  "selected_entity_id" VARCHAR(120),
  "selected_entity_name" VARCHAR(300),
  "user_id" VARCHAR(120),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "search_query_log_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "search_alias_suggestion" (
  "id" TEXT NOT NULL,
  "domain" "SearchGovernanceDomain" NOT NULL,
  "action" "SearchAliasSuggestionAction" NOT NULL,
  "status" "SearchAliasSuggestionStatus" NOT NULL DEFAULT 'PENDING',
  "payload" JSONB NOT NULL,
  "evidence" JSONB NOT NULL DEFAULT '{}',
  "risk_level" "SearchAliasRiskLevel" NOT NULL DEFAULT 'LOW',
  "agent_rationale" TEXT,
  "error_message" TEXT,
  "reviewer_id" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "applied_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "search_alias_suggestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "search_alias_audit_log" (
  "id" TEXT NOT NULL,
  "domain" "SearchGovernanceDomain" NOT NULL,
  "action" VARCHAR(80) NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "suggestion_id" TEXT,
  "operator_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "search_alias_audit_log_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "search_alias_group_domain_canonical_term_key"
  ON "search_alias_group"("domain", "canonical_term");

CREATE INDEX "search_alias_group_domain_status_idx"
  ON "search_alias_group"("domain", "status");

CREATE INDEX "search_query_log_domain_created_at_idx"
  ON "search_query_log"("domain", "created_at");

CREATE INDEX "search_query_log_domain_normalized_query_idx"
  ON "search_query_log"("domain", "normalized_query");

CREATE INDEX "search_alias_suggestion_domain_status_created_at_idx"
  ON "search_alias_suggestion"("domain", "status", "created_at");

CREATE INDEX "search_alias_audit_log_domain_created_at_idx"
  ON "search_alias_audit_log"("domain", "created_at");

CREATE INDEX "search_alias_audit_log_suggestion_id_idx"
  ON "search_alias_audit_log"("suggestion_id");
