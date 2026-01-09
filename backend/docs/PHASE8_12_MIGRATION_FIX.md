# Phase 8.12 Migration Fix Guide

## Problem
Migration `20251216161937_add_kitchen_task_fields_to_packaging_unit` failed with:
```
ERROR 23502: column "updated_at" of relation "packaging_unit" contains null values
```

## Root Cause
The migration tried to add `updated_at TIMESTAMP(3) NOT NULL` directly, but existing rows in `packaging_unit` table would have NULL values, causing the constraint violation.

## Solution Applied

### 1. Migration SQL Fixed
The migration SQL has been updated to:
- Add `updated_at` as nullable first
- Backfill existing rows with `created_at` value
- Then set NOT NULL constraint

**File:** `backend/prisma/migrations/20251216161937_add_kitchen_task_fields_to_packaging_unit/migration.sql`

### 2. Schema Corrected
Changed `updatedAt DateTime?` to `updatedAt DateTime` (NOT NULL) to match `@updatedAt` directive requirements.

**File:** `backend/prisma/schema.prisma` line 258

## How to Apply the Fix

### Option A: Manual SQL Execution (Recommended if migration was marked as applied but failed)

```bash
cd backend
# Execute the fixed migration SQL manually
psql $DATABASE_URL -f prisma/migrations/20251216161937_add_kitchen_task_fields_to_packaging_unit/migration.sql
```

Or use the idempotent fix script:
```bash
cd backend
psql $DATABASE_URL -f scripts/fix_kitchen_task_migration.sql
```

### Option B: Reset Migration State and Re-apply

If the migration was partially applied:

1. **Check current database state:**
```sql
-- Check if columns exist
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'packaging_unit' 
AND column_name IN ('status', 'updated_at', 'ingredients_usage_snapshot', 'photos_raw', 'photos_cooked', 'photos_portioned');
```

2. **If columns are missing, manually apply:**
```bash
cd backend
psql $DATABASE_URL -f scripts/fix_kitchen_task_migration.sql
```

3. **Verify migration status:**
```bash
pnpm prisma migrate status
```

## Verification Steps

After applying the fix:

1. **Generate Prisma Client:**
```bash
cd backend
pnpm prisma generate
```

2. **Build:**
```bash
pnpm run build
```

3. **Run Tests:**
```bash
pnpm test -- kitchen.service.spec
```

4. **Check Migration Status:**
```bash
pnpm prisma migrate status
```

## Expected Result

- All new columns added to `packaging_unit` table
- `updated_at` column is NOT NULL with all existing rows backfilled
- `PackagingUnitStatus` enum created
- Index on `status` column created
- Prisma client regenerated with correct types
- All tests pass

## Migration SQL Summary

The fixed migration:
1. Creates `PackagingUnitStatus` enum
2. Adds columns (with safe defaults):
   - `status` (default: 'PENDING')
   - `ingredients_usage_snapshot` (nullable JSONB)
   - `photos_raw`, `photos_cooked`, `photos_portioned` (empty arrays)
   - `updated_at` (nullable initially)
3. Backfills `updated_at = created_at` for existing rows
4. Sets `updated_at` to NOT NULL
5. Creates index on `status`

## Why This Fix Works

1. **Safe Column Addition:** Adding `updated_at` as nullable first allows existing rows to have NULL temporarily
2. **Backfill:** Setting `updated_at = created_at` ensures all rows have valid timestamps
3. **Constraint:** Only after backfill do we set NOT NULL, preventing constraint violations
4. **Idempotent Script:** The fix script checks for column existence before adding, making it safe to run multiple times

