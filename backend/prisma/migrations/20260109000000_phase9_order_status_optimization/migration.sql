-- Migration: Phase 9 - Order Status Optimization
-- Date: 2026-01-09
-- Description: Add PURCHASING status to OrderStatus enum and update data
--              This replaces WAITING_FOR_PRODUCTION with PURCHASING

-- Step 1: Add PURCHASING to OrderStatus enum
ALTER TYPE "OrderStatus" ADD VALUE 'PURCHASING' BEFORE 'IN_PRODUCTION';

-- Step 2: Update existing orders with old status if any
UPDATE "order"
SET status = 'PURCHASING'
WHERE status = 'WAITING_FOR_PRODUCTION';

-- Step 3: Update order status history if any old references exist
UPDATE "order_status_history"
SET "fromStatus" = 'PURCHASING'
WHERE "fromStatus" = 'WAITING_FOR_PRODUCTION';

UPDATE "order_status_history"
SET "toStatus" = 'PURCHASING'
WHERE "toStatus" = 'WAITING_FOR_PRODUCTION';
