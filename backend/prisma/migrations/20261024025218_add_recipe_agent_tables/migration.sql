-- CreateEnum
CREATE TYPE "RecipeAgentSessionStatus" AS ENUM ('RUNNING', 'WAITING_USER', 'COMPLETED', 'STOPPED', 'FAILED', 'INTERRUPTED');

-- CreateEnum
CREATE TYPE "RecipeAgentMessageRole" AS ENUM ('USER', 'ASSISTANT', 'TOOL');

-- CreateEnum
CREATE TYPE "RecipeAgentApprovalType" AS ENUM ('COMPLIANCE_EXCEPTION', 'CATEGORY_OMISSION');

-- CreateEnum
CREATE TYPE "RecipeAgentApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "design_recipe" ADD COLUMN     "assessment_content_revision" INTEGER;

-- CreateTable
CREATE TABLE "recipe_design_agent_session" (
    "id" TEXT NOT NULL,
    "design_recipe_id" TEXT NOT NULL,
    "status" "RecipeAgentSessionStatus" NOT NULL DEFAULT 'RUNNING',
    "skill_name" VARCHAR(80) NOT NULL,
    "skill_version" VARCHAR(40) NOT NULL,
    "step_count" INTEGER NOT NULL DEFAULT 0,
    "prompt_tokens" INTEGER NOT NULL DEFAULT 0,
    "completion_tokens" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipe_design_agent_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_design_agent_message" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "role" "RecipeAgentMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "tool_name" VARCHAR(80),
    "tool_args" JSONB,
    "tool_result" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recipe_design_agent_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_design_agent_approval" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "type" "RecipeAgentApprovalType" NOT NULL,
    "status" "RecipeAgentApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT NOT NULL,
    "detail" JSONB,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMP(3),
    "decided_by" TEXT,

    CONSTRAINT "recipe_design_agent_approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_design_agent_snapshot" (
    "id" TEXT NOT NULL,
    "design_recipe_id" TEXT NOT NULL,
    "session_id" TEXT,
    "content_revision" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recipe_design_agent_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recipe_design_agent_session_design_recipe_id_status_idx" ON "recipe_design_agent_session"("design_recipe_id", "status");

-- CreateIndex
CREATE INDEX "recipe_design_agent_message_session_id_seq_idx" ON "recipe_design_agent_message"("session_id", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "recipe_design_agent_message_session_id_seq_key" ON "recipe_design_agent_message"("session_id", "seq");

-- CreateIndex
CREATE INDEX "recipe_design_agent_approval_session_id_status_idx" ON "recipe_design_agent_approval"("session_id", "status");

-- CreateIndex
CREATE INDEX "recipe_design_agent_snapshot_design_recipe_id_created_at_idx" ON "recipe_design_agent_snapshot"("design_recipe_id", "created_at");

-- AddForeignKey
ALTER TABLE "recipe_design_agent_session" ADD CONSTRAINT "recipe_design_agent_session_design_recipe_id_fkey" FOREIGN KEY ("design_recipe_id") REFERENCES "design_recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_design_agent_message" ADD CONSTRAINT "recipe_design_agent_message_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "recipe_design_agent_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_design_agent_approval" ADD CONSTRAINT "recipe_design_agent_approval_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "recipe_design_agent_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_design_agent_snapshot" ADD CONSTRAINT "recipe_design_agent_snapshot_design_recipe_id_fkey" FOREIGN KEY ("design_recipe_id") REFERENCES "design_recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_design_agent_snapshot" ADD CONSTRAINT "recipe_design_agent_snapshot_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "recipe_design_agent_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;
