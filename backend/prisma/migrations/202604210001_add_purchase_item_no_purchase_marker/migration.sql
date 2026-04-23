ALTER TABLE "purchase_item"
  ADD COLUMN "no_purchase_needed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "no_purchase_reason" VARCHAR(120),
  ADD COLUMN "no_purchase_marked_at" TIMESTAMP(3),
  ADD COLUMN "no_purchase_marked_by_id" VARCHAR(80);
