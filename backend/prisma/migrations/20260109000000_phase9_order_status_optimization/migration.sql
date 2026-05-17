-- Migration: Phase 9 - Order Status Optimization
-- Date: 2026-01-09
-- Description: Add PURCHASING status to OrderStatus enum and update data
--              This replaces WAITING_FOR_PRODUCTION with PURCHASING

-- PostgreSQL does not allow a newly added enum value to be used before the
-- transaction that added it has committed. Rebuild the enum instead so this
-- migration can run from an empty database as one Prisma migration.
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";

CREATE TYPE "OrderStatus" AS ENUM (
  'INIT',
  'PENDING_PAYMENT',
  'PAID',
  'WAITING_FOR_PRODUCTION',
  'PURCHASING',
  'IN_PRODUCTION',
  'READY_FOR_PACKAGING',
  'READY_FOR_SHIPMENT',
  'SHIPPED',
  'COMPLETED',
  'CANCELLED',
  'FREEZING',
  'AFTERSALE'
);

ALTER TABLE "order"
ALTER COLUMN "status" TYPE "OrderStatus"
USING (
  CASE
    WHEN "status"::text = 'WAITING_FOR_PRODUCTION' THEN 'PURCHASING'
    ELSE "status"::text
  END
)::"OrderStatus";

ALTER TABLE "order_status_history"
ALTER COLUMN "from_status" TYPE "OrderStatus"
USING (
  CASE
    WHEN "from_status"::text = 'WAITING_FOR_PRODUCTION' THEN 'PURCHASING'
    ELSE "from_status"::text
  END
)::"OrderStatus";

ALTER TABLE "order_status_history"
ALTER COLUMN "to_status" TYPE "OrderStatus"
USING (
  CASE
    WHEN "to_status"::text = 'WAITING_FOR_PRODUCTION' THEN 'PURCHASING'
    ELSE "to_status"::text
  END
)::"OrderStatus";

DROP TYPE "OrderStatus_old";
