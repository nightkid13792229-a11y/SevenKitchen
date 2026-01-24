-- Migration: Rename WAITING_FOR_PRODUCTION to PURCHASING
-- Description: Rename order status WAITING_FOR_PRODUCTION to PURCHASING to better reflect the purchasing workflow

-- Update Order table
UPDATE "Order" SET status = 'PURCHASING' WHERE status = 'WAITING_FOR_PRODUCTION';

-- Update OrderStatusHistory table (fromStatus)
UPDATE "OrderStatusHistory" SET "fromStatus" = 'PURCHASING' WHERE "fromStatus" = 'WAITING_FOR_PRODUCTION';

-- Update OrderStatusHistory table (toStatus)
UPDATE "OrderStatusHistory" SET "toStatus" = 'PURCHASING' WHERE "toStatus" = 'WAITING_FOR_PRODUCTION';

-- Verification query (commented out)
-- SELECT status, COUNT(*) FROM "Order" GROUP BY status;
-- SELECT "fromStatus", "toStatus", COUNT(*) FROM "OrderStatusHistory" GROUP BY "fromStatus", "toStatus";
