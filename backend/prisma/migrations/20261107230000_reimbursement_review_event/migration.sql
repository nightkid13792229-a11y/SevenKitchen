-- 报销单审核事件（2026-11-07）：只追加、不改写，用来还原「谁在什么时候做了什么」
CREATE TYPE "ReimbursementReviewEventAction" AS ENUM ('SUBMIT', 'RESUBMIT', 'APPROVE', 'REJECT', 'REQUIRE_RESUBMIT', 'REVERT');

CREATE TABLE "reimbursement_review_event" (
    "id" VARCHAR(36) NOT NULL,
    "reimbursement_id" VARCHAR(36) NOT NULL,
    "action" "ReimbursementReviewEventAction" NOT NULL,
    "actor_id" VARCHAR(36),
    "actor_name" VARCHAR(64),
    "from_status" "ReimbursementStatus",
    "to_status" "ReimbursementStatus",
    "comment" VARCHAR(200),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reimbursement_review_event_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "reimbursement_review_event_reimbursement_id_created_at_idx" ON "reimbursement_review_event"("reimbursement_id", "created_at");

ALTER TABLE "reimbursement_review_event" ADD CONSTRAINT "reimbursement_review_event_reimbursement_id_fkey" FOREIGN KEY ("reimbursement_id") REFERENCES "reimbursement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
