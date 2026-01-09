-- Migration: Add Order Freezing and Aftersale Status
-- Date: 2026-01-09
-- Description: Add FREEZING and AFTERSALE status to orders, along with aftersale tracking fields

-- Add new values to OrderStatus enum
ALTER TYPE "OrderStatus" ADD VALUE 'FREEZING';
ALTER TYPE "OrderStatus" ADD VALUE 'AFTERSALE';

-- Create AftersaleType enum
CREATE TYPE "AftersaleType" AS ENUM ('REFUND', 'REMAKE', 'COMPLAINT', 'RESOLVED');

-- Add new columns to order table
ALTER TABLE "order" ADD COLUMN "aftersale_type" "AftersaleType";
ALTER TABLE "order" ADD COLUMN "freezing_since" TIMESTAMP;
ALTER TABLE "order" ADD COLUMN "aftersale_since" TIMESTAMP;
ALTER TABLE "order" ADD COLUMN "aftersale_reason" TEXT;
ALTER TABLE "order" ADD COLUMN "aftersale_photos" TEXT[] DEFAULT '{}';

-- Create index for aftersale queries
CREATE INDEX "order_aftersale_type_idx" ON "order"("aftersale_type");

-- Add comments for documentation
COMMENT ON COLUMN "order"."aftersale_type" IS 'Type of aftersale request: REFUND, REMAKE, COMPLAINT, or RESOLVED';
COMMENT ON COLUMN "order"."freezing_since" IS 'Timestamp when order entered FREEZING status';
COMMENT ON COLUMN "order"."aftersale_since" IS 'Timestamp when order entered AFTERSALE status';
COMMENT ON COLUMN "order"."aftersale_reason" IS 'Customer reason for aftersale request';
COMMENT ON COLUMN "order"."aftersale_photos" IS 'Array of photo URLs submitted by customer for aftersale';
