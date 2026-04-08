ALTER TABLE "reimbursement"
ADD COLUMN "paid_by_id" VARCHAR(36),
ADD COLUMN "paid_at" TIMESTAMP(3);

CREATE INDEX "reimbursement_paid_at_idx" ON "reimbursement"("paid_at");

ALTER TABLE "reimbursement"
ADD CONSTRAINT "reimbursement_paid_by_id_fkey"
FOREIGN KEY ("paid_by_id") REFERENCES "user"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
