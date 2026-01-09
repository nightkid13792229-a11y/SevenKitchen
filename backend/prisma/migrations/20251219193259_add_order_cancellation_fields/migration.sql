-- AlterTable
-- Phase 8.16: Add order cancellation fields
ALTER TABLE "order" ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "cancellation_reason" TEXT,
ADD COLUMN     "cancelled_by" TEXT;

