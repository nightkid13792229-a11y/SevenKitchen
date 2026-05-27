-- CreateEnum
CREATE TYPE "KnowledgeSourceStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "KnowledgeAuthorityLevel" AS ENUM ('FOUNDATIONAL', 'HIGH', 'SUPPORTING');

-- CreateEnum
CREATE TYPE "KnowledgeEntryStatus" AS ENUM ('DRAFT', 'REVIEWED', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "NutritionRulePackageStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "NutritionEvidenceLevel" AS ENUM ('A_CONFIRMED_DIAGNOSIS', 'B_TEST_INDICATED', 'C_OWNER_REPORTED', 'D_ATTACHMENT_OBSERVATION');

-- CreateEnum
CREATE TYPE "NutritionAssessmentStatus" AS ENUM ('DRAFT', 'NEEDS_MORE_INFO', 'PLAN_READY', 'BLOCKED');

-- CreateEnum
CREATE TYPE "AgentRecipeResultStatus" AS ENUM ('REVIEWABLE', 'NEEDS_MANUAL_REVIEW', 'LIMITED_DRAFT', 'UNABLE_TO_COMPLETE');

-- CreateEnum
CREATE TYPE "AgentRecipeSessionStatus" AS ENUM ('OPEN', 'ASSESSING', 'PLAN_READY', 'DESIGNING', 'COMPLETED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "knowledge_source" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "version_label" VARCHAR(100) NOT NULL,
    "source_url" VARCHAR(500) NOT NULL,
    "scope" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "authority_level" "KnowledgeAuthorityLevel" NOT NULL,
    "status" "KnowledgeSourceStatus" NOT NULL DEFAULT 'DRAFT',
    "copyright_note" TEXT,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_entry" (
    "id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "species" VARCHAR(40) NOT NULL DEFAULT 'DOG',
    "category" VARCHAR(80) NOT NULL,
    "summary" TEXT NOT NULL,
    "structured_data" JSONB NOT NULL DEFAULT '{}',
    "citation" TEXT,
    "status" "KnowledgeEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutrition_rule_package" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "status" "NutritionRulePackageStatus" NOT NULL DEFAULT 'DRAFT',
    "current_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nutrition_rule_package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutrition_rule_version" (
    "id" TEXT NOT NULL,
    "package_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "required_evidence" "NutritionEvidenceLevel" NOT NULL,
    "activation_criteria" JSONB NOT NULL DEFAULT '{}',
    "contraindications" JSONB NOT NULL DEFAULT '{}',
    "required_fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "nutrient_targets" JSONB NOT NULL DEFAULT '{}',
    "ingredient_policy" JSONB NOT NULL DEFAULT '{}',
    "conflict_policy" JSONB NOT NULL DEFAULT '{}',
    "review_policy" JSONB NOT NULL DEFAULT '{}',
    "display_boundaries" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nutrition_rule_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutrition_rule_package_source" (
    "id" TEXT NOT NULL,
    "package_id" TEXT NOT NULL,
    "knowledge_source_id" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "nutrition_rule_package_source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dog_nutrition_assessment" (
    "id" TEXT NOT NULL,
    "dog_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "status" "NutritionAssessmentStatus" NOT NULL DEFAULT 'DRAFT',
    "input_summary" JSONB NOT NULL DEFAULT '{}',
    "completeness" JSONB NOT NULL DEFAULT '{}',
    "management_plan" JSONB NOT NULL DEFAULT '{}',
    "constraint_set" JSONB NOT NULL DEFAULT '{}',
    "result_status" "AgentRecipeResultStatus",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dog_nutrition_assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dog_nutrition_assessment_evidence" (
    "id" TEXT NOT NULL,
    "assessment_id" TEXT NOT NULL,
    "source_type" VARCHAR(60) NOT NULL,
    "evidence_level" "NutritionEvidenceLevel" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "extracted_data" JSONB NOT NULL DEFAULT '{}',
    "confirmed_data" JSONB NOT NULL DEFAULT '{}',
    "is_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "attachment_urls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "confirmed_by" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dog_nutrition_assessment_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_recipe_design_session" (
    "id" TEXT NOT NULL,
    "assessment_id" TEXT NOT NULL,
    "design_recipe_id" TEXT,
    "status" "AgentRecipeSessionStatus" NOT NULL DEFAULT 'OPEN',
    "result_status" "AgentRecipeResultStatus",
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_recipe_design_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_recipe_design_message" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "role" VARCHAR(40) NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_recipe_design_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_recipe_design_candidate" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "recipe_draft" JSONB NOT NULL DEFAULT '{}',
    "calculation" JSONB NOT NULL DEFAULT '{}',
    "result_status" "AgentRecipeResultStatus" NOT NULL,
    "change_summary" JSONB NOT NULL DEFAULT '{}',
    "is_adopted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_recipe_design_candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_recipe_audit_snapshot" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL DEFAULT '{}',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_recipe_audit_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_source_code_key" ON "knowledge_source"("code");

-- CreateIndex
CREATE INDEX "knowledge_source_status_idx" ON "knowledge_source"("status");

-- CreateIndex
CREATE INDEX "knowledge_source_authority_level_idx" ON "knowledge_source"("authority_level");

-- CreateIndex
CREATE INDEX "knowledge_entry_source_id_idx" ON "knowledge_entry"("source_id");

-- CreateIndex
CREATE INDEX "knowledge_entry_category_idx" ON "knowledge_entry"("category");

-- CreateIndex
CREATE INDEX "knowledge_entry_status_idx" ON "knowledge_entry"("status");

-- CreateIndex
CREATE UNIQUE INDEX "nutrition_rule_package_code_key" ON "nutrition_rule_package"("code");

-- CreateIndex
CREATE INDEX "nutrition_rule_package_status_idx" ON "nutrition_rule_package"("status");

-- CreateIndex
CREATE INDEX "nutrition_rule_version_package_id_idx" ON "nutrition_rule_version"("package_id");

-- CreateIndex
CREATE INDEX "nutrition_rule_version_is_active_idx" ON "nutrition_rule_version"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "nutrition_rule_version_package_id_version_key" ON "nutrition_rule_version"("package_id", "version");

-- CreateIndex
CREATE INDEX "nutrition_rule_package_source_package_id_idx" ON "nutrition_rule_package_source"("package_id");

-- CreateIndex
CREATE INDEX "nutrition_rule_package_source_knowledge_source_id_idx" ON "nutrition_rule_package_source"("knowledge_source_id");

-- CreateIndex
CREATE UNIQUE INDEX "nutrition_rule_package_source_package_id_knowledge_source_i_key" ON "nutrition_rule_package_source"("package_id", "knowledge_source_id");

-- CreateIndex
CREATE INDEX "dog_nutrition_assessment_dog_id_idx" ON "dog_nutrition_assessment"("dog_id");

-- CreateIndex
CREATE INDEX "dog_nutrition_assessment_created_by_idx" ON "dog_nutrition_assessment"("created_by");

-- CreateIndex
CREATE INDEX "dog_nutrition_assessment_status_idx" ON "dog_nutrition_assessment"("status");

-- CreateIndex
CREATE INDEX "dog_nutrition_assessment_evidence_assessment_id_idx" ON "dog_nutrition_assessment_evidence"("assessment_id");

-- CreateIndex
CREATE INDEX "dog_nutrition_assessment_evidence_evidence_level_idx" ON "dog_nutrition_assessment_evidence"("evidence_level");

-- CreateIndex
CREATE INDEX "dog_nutrition_assessment_evidence_is_confirmed_idx" ON "dog_nutrition_assessment_evidence"("is_confirmed");

-- CreateIndex
CREATE INDEX "agent_recipe_design_session_assessment_id_idx" ON "agent_recipe_design_session"("assessment_id");

-- CreateIndex
CREATE INDEX "agent_recipe_design_session_created_by_idx" ON "agent_recipe_design_session"("created_by");

-- CreateIndex
CREATE INDEX "agent_recipe_design_session_status_idx" ON "agent_recipe_design_session"("status");

-- CreateIndex
CREATE INDEX "agent_recipe_design_message_session_id_idx" ON "agent_recipe_design_message"("session_id");

-- CreateIndex
CREATE INDEX "agent_recipe_design_candidate_session_id_idx" ON "agent_recipe_design_candidate"("session_id");

-- CreateIndex
CREATE INDEX "agent_recipe_design_candidate_result_status_idx" ON "agent_recipe_design_candidate"("result_status");

-- CreateIndex
CREATE INDEX "agent_recipe_audit_snapshot_session_id_idx" ON "agent_recipe_audit_snapshot"("session_id");

-- AddForeignKey
ALTER TABLE "knowledge_entry" ADD CONSTRAINT "knowledge_entry_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "knowledge_source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nutrition_rule_version" ADD CONSTRAINT "nutrition_rule_version_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "nutrition_rule_package"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nutrition_rule_package_source" ADD CONSTRAINT "nutrition_rule_package_source_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "nutrition_rule_package"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nutrition_rule_package_source" ADD CONSTRAINT "nutrition_rule_package_source_knowledge_source_id_fkey" FOREIGN KEY ("knowledge_source_id") REFERENCES "knowledge_source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dog_nutrition_assessment" ADD CONSTRAINT "dog_nutrition_assessment_dog_id_fkey" FOREIGN KEY ("dog_id") REFERENCES "dog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dog_nutrition_assessment_evidence" ADD CONSTRAINT "dog_nutrition_assessment_evidence_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "dog_nutrition_assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_recipe_design_session" ADD CONSTRAINT "agent_recipe_design_session_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "dog_nutrition_assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_recipe_design_message" ADD CONSTRAINT "agent_recipe_design_message_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "agent_recipe_design_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_recipe_design_candidate" ADD CONSTRAINT "agent_recipe_design_candidate_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "agent_recipe_design_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_recipe_audit_snapshot" ADD CONSTRAINT "agent_recipe_audit_snapshot_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "agent_recipe_design_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
