CREATE TYPE "ReimbursementReviewRisk" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

CREATE TABLE "reimbursement_review" (
  "id" VARCHAR(36) NOT NULL,
  "reimbursement_id" VARCHAR(36) NOT NULL,
  "risk_level" "ReimbursementReviewRisk" NOT NULL,
  "findings" JSONB NOT NULL,
  "summary" TEXT,
  "advice" TEXT,
  "model" VARCHAR(60),
  "prompt_version" VARCHAR(20),
  "created_by_id" VARCHAR(36),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reimbursement_review_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "reimbursement_review_reimbursement_id_created_at_idx"
  ON "reimbursement_review"("reimbursement_id", "created_at");

ALTER TABLE "reimbursement_review"
  ADD CONSTRAINT "reimbursement_review_reimbursement_id_fkey"
  FOREIGN KEY ("reimbursement_id") REFERENCES "reimbursement"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
