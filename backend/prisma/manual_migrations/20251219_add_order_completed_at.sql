-- Phase 8.15: Order completion
ALTER TABLE "order"
ADD COLUMN IF NOT EXISTS "completed_at" TIMESTAMP;
