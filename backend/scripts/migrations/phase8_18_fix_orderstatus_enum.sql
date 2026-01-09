-- Phase 8.18: Fix OrderStatus enum to include all required values
-- This migration is idempotent and safe to run multiple times
-- It adds missing enum values that were not present in the original database schema

-- Add missing OrderStatus enum values (idempotent)
DO $$
BEGIN
  -- Check if enum value exists before adding (PostgreSQL 9.1+)
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'INIT' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'OrderStatus')
  ) THEN
    ALTER TYPE "OrderStatus" ADD VALUE 'INIT';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'PENDING_PAYMENT' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'OrderStatus')
  ) THEN
    ALTER TYPE "OrderStatus" ADD VALUE 'PENDING_PAYMENT';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'WAITING_FOR_PRODUCTION' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'OrderStatus')
  ) THEN
    ALTER TYPE "OrderStatus" ADD VALUE 'WAITING_FOR_PRODUCTION';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'READY_FOR_PACKAGING' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'OrderStatus')
  ) THEN
    ALTER TYPE "OrderStatus" ADD VALUE 'READY_FOR_PACKAGING';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'READY_FOR_SHIPMENT' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'OrderStatus')
  ) THEN
    ALTER TYPE "OrderStatus" ADD VALUE 'READY_FOR_SHIPMENT';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'CANCELLED' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'OrderStatus')
  ) THEN
    ALTER TYPE "OrderStatus" ADD VALUE 'CANCELLED';
  END IF;
END $$;

