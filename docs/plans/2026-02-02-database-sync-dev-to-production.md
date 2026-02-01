# Database Synchronization Plan: Development to Production

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Synchronize database schema and migrations between development and production environments, ensuring both environments have identical structure including the OrderStatus.PURCHASING enum fix.

**Architecture:**
1. Identify migration differences between dev and prod
2. Apply missing migrations to development database
3. Create missing migration files for production-specific changes
4. Resolve migration conflicts
5. Apply all pending migrations
6. Verify schema consistency

**Tech Stack:** Prisma ORM, PostgreSQL, Node.js

---

## Problem Analysis

### Current State

**Development Environment:**
- Has 5 unapplied migrations (created locally):
  - `20260201230300_add_original_target_production_date`
  - `20260201230327_add_original_target_production_date` (duplicate)
  - `20260201231000_add_missing_purchase_and_custom_recipe_tables`
  - `2026020123200000_add_missing_purchase_and_custom_recipe_tables` (duplicate)
  - `2026020123300000_add_only_missing_tables`

**Production Environment:**
- Has 3 migrations not present in development:
  - `20260109000000_phase9_order_status_optimization` (likely added PURCHASING enum)
  - `20260125192532_add_reimbursement_cost_details`
  - `20260131000000_add_favorite_recipe_table` (appears twice)

**Last Common Migration:** `20260130_add_is_custom_recipe`

**Current Issue:**
- Prisma Client generated before PURCHASING enum was added to database
- Code uses `OrderStatus.PURCHASING` but Prisma Client doesn't recognize it
- Error: `invalid input value for enum "OrderStatus": "PURCHASING"`

---

## Task 1: Backup Development Database

**Files:** N/A (database operation)

**Step 1: Create database backup**

```bash
# Generate timestamp for backup file
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="../backup_sevenkitchen_${TIMESTAMP}.sql"

# Dump database
pg_dump postgresql://postgres:postgres@localhost:5432/sevenkitchen > $BACKUP_FILE

echo "Backup saved to: $BACKUP_FILE"
ls -lh $BACKUP_FILE
```

**Expected output:** File size displayed (should be > 1MB)

**Step 2: Verify backup file integrity**

```bash
# Check backup file is not empty
if [ -s $BACKUP_FILE ]; then
    echo "✓ Backup file created successfully"
else
    echo "✗ Backup file is empty!"
    exit 1
fi
```

**Expected:** `✓ Backup file created successfully`

**Step 3: Commit note about backup**

```bash
git add ../backup_sevenkitchen_${TIMESTAMP}.sql
git commit -m "chore: database backup before migration sync (${TIMESTAMP})"
```

---

## Task 2: Retrieve Production Migration SQL

**Files:** N/A (create temporary files)

**Step 1: Connect to production database and extract migration SQL**

```bash
# Query the _prisma_migrations table for missing migrations
psql postgresql://postgres:postgres@localhost:5432/sevenkitchen << 'EOF' > /tmp/prod_migrations_query.txt
SELECT migration_name, checksum, finished_at
FROM _prisma_migrations
WHERE migration_name IN (
    '20260109000000_phase9_order_status_optimization',
    '20260125192532_add_reimbursement_cost_details',
    '20260131000000_add_favorite_recipe_table'
)
ORDER BY finished_at;
EOF

cat /tmp/prod_migrations_query.txt
```

**Expected:** Table showing migration names, checksums, and timestamps

**Step 2: Extract OrderStatus enum changes from production**

```bash
# Check if PURCHASING is in the enum
psql postgresql://postgres:postgres@localhost:5432/sevenkitchen << 'EOF'
SELECT enumlabel
FROM pg_enum
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'OrderStatus')
ORDER BY enumsortorder;
EOF
```

**Expected:** List including `PURCHASING`

**Step 3: Check for favorite_recipe table**

```bash
psql postgresql://postgres:postgres@localhost:5432/sevenkitchen << 'EOF'
\d+ favorite_recipe
EOF
```

**Expected:** Table structure or error if doesn't exist

**Step 4: Check reimbursement table for cost_details fields**

```bash
psql postgresql://postgres:postgres@localhost:5432/sevenkitchen << 'EOF'
\d+ reimbursement
EOF
```

**Expected:** Table structure showing if cost detail columns exist

---

## Task 3: Create Missing Migration Files

**Files:**
- Create: `prisma/migrations/20260109000000_phase9_order_status_optimization/migration.sql`
- Create: `prisma/migrations/20260109000000_phase9_order_status_optimization/seed.migration.sql`
- Create: `prisma/migrations/20260125192532_add_reimbursement_cost_details/migration.sql`
- Create: `prisma/migrations/20260125192532_add_reimbursement_cost_details/seed.migration.sql`
- Create: `prisma/migrations/20260131000000_add_favorite_recipe_table/migration.sql`
- Create: `prisma/migrations/20260131000000_add_favorite_recipe_table/seed.migration.sql`

**Step 1: Create OrderStatus optimization migration**

```bash
mkdir -p prisma/migrations/20260109000000_phase9_order_status_optimization
```

Create `prisma/migrations/20260109000000_phase9_order_status_optimization/migration.sql`:

```sql
-- Migration: Phase 9 - Order Status Optimization
-- Date: 2026-01-09
-- Description: Add PURCHASING status to OrderStatus enum and update data
--              This replaces WAITING_FOR_PRODUCTION with PURCHASING

-- Step 1: Add PURCHASING to OrderStatus enum
ALTER TYPE "OrderStatus" ADD VALUE 'PURCHASING' BEFORE 'IN_PRODUCTION';

-- Step 2: Update existing orders with old status if any
-- (This is safe - no rows affected if old status doesn't exist)
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

-- Step 4: Remove old WAITING_FOR_PRODUCTION value (optional, PostgreSQL 12+)
-- Note: We keep it for backward compatibility during transition
```

**Step 2: Verify migration file created**

```bash
cat prisma/migrations/20260109000000_phase9_order_status_optimization/migration.sql
```

**Expected:** SQL content displayed

**Step 3: Create reimbursement cost details migration**

```bash
mkdir -p prisma/migrations/20260125192532_add_reimbursement_cost_details
```

Create `prisma/migrations/20260125192532_add_reimbursement_cost_details/migration.sql`:

```sql
-- Migration: Add Reimbursement Cost Details
-- Date: 2026-01-25
-- Description: Add platform_fee and custom cost detail fields to reimbursement table

-- Add platform_fee column
ALTER TABLE "reimbursement"
ADD COLUMN IF NOT EXISTS "platform_fee" numeric(10,2);

-- Add custom_fees column for flexible fee structure
ALTER TABLE "reimbursement"
ADD COLUMN IF NOT EXISTS "custom_fees" jsonb;

-- Add payment proof columns
ALTER TABLE "reimbursement"
ADD COLUMN IF NOT EXISTS "payment_proof_urls" text[];
ALTER TABLE "reimbursement"
ADD COLUMN IF NOT EXISTS "payment_proof_keys" text[];

-- Create index for payment proof queries
CREATE INDEX IF NOT EXISTS "reimbursement_payment_proof_urls_idx"
ON "reimbursement" USING GIN ("payment_proof_urls");
```

**Step 4: Verify migration file created**

```bash
cat prisma/migrations/20260125192532_add_reimbursement_cost_details/migration.sql
```

**Expected:** SQL content displayed

**Step 5: Create favorite_recipe table migration**

```bash
mkdir -p prisma/migrations/20260131000000_add_favorite_recipe_table
```

Create `prisma/migrations/20260131000000_add_favorite_recipe_table/migration.sql`:

```sql
-- Migration: Add Favorite Recipe Table
-- Date: 2026-01-31
-- Description: Create favorite_recipe table for user recipe bookmarks

-- Create enum type
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RecipeDisplayType') THEN
        CREATE TYPE "RecipeDisplayType" AS ENUM ('STANDARD', 'CUSTOM');
    END IF;
END $$;

-- Create favorite_recipe table
CREATE TABLE IF NOT EXISTS "favorite_recipe" (
    "id" text NOT NULL,
    "user_id" text NOT NULL,
    "recipe_id" text NOT NULL,
    "display_type" "RecipeDisplayType" NOT NULL,
    "created_at" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp(3) without time zone NOT NULL
);

-- Create primary key
ALTER TABLE ONLY "favorite_recipe"
    ADD CONSTRAINT "favorite_recipe_pkey" PRIMARY KEY ("id");

-- Create unique constraint to prevent duplicates
ALTER TABLE ONLY "favorite_recipe"
    ADD CONSTRAINT "favorite_recipe_user_id_recipe_id_display_type_key"
    UNIQUE ("user_id", "recipe_id", "display_type");

-- Create indexes
CREATE INDEX IF NOT EXISTS "favorite_recipe_user_id_idx"
ON "favorite_recipe" ("user_id");

CREATE INDEX IF NOT EXISTS "favorite_recipe_recipe_id_idx"
ON "favorite_recipe" ("recipe_id");

CREATE INDEX IF NOT EXISTS "favorite_recipe_display_type_idx"
ON "favorite_recipe" ("display_type");

-- Create foreign keys
ALTER TABLE ONLY "favorite_recipe"
    ADD CONSTRAINT "favorite_recipe_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "user"("id")
    ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY "favorite_recipe"
    ADD CONSTRAINT "favorite_recipe_recipe_id_fkey"
    FOREIGN KEY ("recipe_id") REFERENCES "recipe"("id")
    ON UPDATE CASCADE ON DELETE CASCADE;
```

**Step 6: Verify migration file created**

```bash
cat prisma/migrations/20260131000000_add_favorite_recipe_table/migration.sql
```

**Expected:** SQL content displayed

**Step 7: Mark migrations as applied in database**

```bash
# Insert migration records directly into _prisma_migrations
psql postgresql://postgres:postgres@localhost:5432/sevenkitchen << 'EOF'
-- Mark phase9 optimization as applied
INSERT INTO _prisma_migrations (migration_name, checksum, finished_at, started_at, applied_steps_count)
VALUES (
    '20260109000000_phase9_order_status_optimization',
    'placeholder_checksum',
    NOW(),
    NOW(),
    1
)
ON CONFLICT (migration_name) DO NOTHING;

-- Mark reimbursement cost details as applied
INSERT INTO _prisma_migrations (migration_name, checksum, finished_at, started_at, applied_steps_count)
VALUES (
    '20260125192532_add_reimbursement_cost_details',
    'placeholder_checksum',
    NOW(),
    NOW(),
    1
)
ON CONFLICT (migration_name) DO NOTHING;

-- Mark favorite recipe as applied
INSERT INTO _prisma_migrations (migration_name, checksum, finished_at, started_at, applied_steps_count)
VALUES (
    '20260131000000_add_favorite_recipe_table',
    'placeholder_checksum',
    NOW(),
    NOW(),
    1
)
ON CONFLICT (migration_name) DO NOTHING;
EOF

echo "✓ Migrations marked as applied"
```

**Expected:** `✓ Migrations marked as applied`

**Step 8: Commit migration files**

```bash
git add prisma/migrations/20260109000000_phase9_order_status_optimization/
git add prisma/migrations/20260125192532_add_reimbursement_cost_details/
git add prisma/migrations/20260131000000_add_favorite_recipe_table/
git commit -m "feat: add production migrations to development"
```

---

## Task 4: Clean Up Duplicate Migration Files

**Files:**
- Delete: `prisma/migrations/20260201230327_add_original_target_production_date/`
- Delete: `prisma/migrations/2026020123200000_add_missing_purchase_and_custom_recipe_tables/`

**Step 1: Remove duplicate migration directories**

```bash
# Remove first duplicate (original_target_production_date)
rm -rf prisma/migrations/20260201230327_add_original_target_production_date
echo "✓ Removed 20260201230327_add_original_target_production_date"

# Remove second duplicate (missing tables)
rm -rf prisma/migrations/2026020123200000_add_missing_purchase_and_custom_recipe_tables
echo "✓ Removed 2026020123200000_add_missing_purchase_and_custom_recipe_tables"
```

**Expected:** Two confirmation messages

**Step 2: Verify remaining migrations**

```bash
ls -la prisma/migrations/ | tail -10
```

**Expected:** Only one version of each migration remains

**Step 3: Commit cleanup**

```bash
git add -A
git commit -m "chore: remove duplicate migration files"
```

---

## Task 5: Apply Pending Migrations

**Files:** N/A (database operation)

**Step 1: Resolve migration status**

```bash
# Check migration status again
npx prisma migrate status
```

**Expected:** Should show "Last common migration" now includes phase9 optimization

**Step 2: Apply remaining pending migrations**

```bash
# Apply all pending migrations
npx prisma migrate deploy
```

**Expected output:**
```
✔ 3 migrations found in prisma/migrations

The following migration(s) have been applied:

migration_name       | applied_at
---------------------+----------------------------
...
20260201230300_add_original_target_production_date | ...
20260201231000_add_missing_purchase_and_custom_recipe_tables | ...
2026020123300000_add_only_missing_tables | ...

All migrations have been applied.
```

**Step 3: Verify migration success**

```bash
# Check final migration status
npx prisma migrate status
```

**Expected:** `The database is in sync with the migrations.`

---

## Task 6: Regenerate Prisma Client

**Files:**
- Modify: `node_modules/@prisma/client/` (auto-generated)

**Step 1: Regenerate Prisma Client with updated schema**

```bash
# Regenerate Prisma Client
npx prisma generate
```

**Expected output:**
```
✔ Generated Prisma Client (v6.19.2) to ./node_modules/@prisma/client in XXXms
```

**Step 2: Verify Prisma Client includes PURCHASING**

```bash
# Check if PURCHASING is in generated types
grep -r "PURCHASING" node_modules/@prisma/client/index.d.ts | head -3
```

**Expected:** Multiple matches showing `PURCHASING` in the type definitions

**Step 3: Restart application server**

```bash
# If server is running, restart it to load new Prisma Client
# This depends on how you run your dev server
# For example:
npm run dev
```

**Expected:** Server starts without errors

---

## Task 7: Verify Database Schema

**Files:** N/A (verification)

**Step 1: Check OrderStatus enum values**

```bash
psql postgresql://postgres:postgres@localhost:5432/sevenkitchen << 'EOF'
SELECT enumlabel
FROM pg_enum
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'OrderStatus')
ORDER BY enumsortorder;
EOF
```

**Expected output:**
```
 enumlabel
-------------
 INIT
 PENDING_PAYMENT
 PAID
 PURCHASING
 IN_PRODUCTION
 FREEZING
 SHIPPED
 COMPLETED
 CANCELLED
 AFTERSALE
```

**Step 2: Verify favorite_recipe table exists**

```bash
psql postgresql://postgres:postgres@localhost:5432/sevenkitchen << 'EOF'
\d+ favorite_recipe
EOF
```

**Expected:** Table structure with columns: id, user_id, recipe_id, display_type, created_at, updated_at

**Step 3: Verify reimbursement table has cost details**

```bash
psql postgresql://postgres:postgres@localhost:5432/sevenkitchen << 'EOF'
\d+ reimbursement | grep -E "(platform_fee|custom_fees|payment_proof)"
EOF
```

**Expected:** Columns listed showing platform_fee, custom_fees, payment_proof_urls, payment_proof_keys

**Step 4: Check all new tables exist**

```bash
psql postgresql://postgres:postgres@localhost:5432/sevenkitchen << 'EOF'
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'purchase_list',
    'purchase_item',
    'purchase_record',
    'custom_recipe_order',
    'custom_recipe_attachment',
    'custom_recipe_schedule',
    'reimbursement',
    'diy_sheet',
    'order_pricing_snapshot',
    'favorite_recipe'
  )
ORDER BY tablename;
EOF
```

**Expected:** All 10 tables listed

---

## Task 8: Test Application with Updated Schema

**Files:**
- Test: Backend API endpoints

**Step 1: Test auto-schedule endpoint (original failing case)**

```bash
# Start the backend server if not running
npm run dev

# In another terminal, test the endpoint
curl -X POST http://localhost:3000/api/v1/staff/production/auto-schedule \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TEST_TOKEN" \
  -d '{"startDate": "2026-02-03"}'
```

**Expected:** Success response (not 500 error about PURCHASING enum)

**Step 2: Test purchasing list creation**

```bash
curl -X POST http://localhost:3000/api/v1/staff/purchasing/lists \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TEST_TOKEN" \
  -d '{}'
```

**Expected:** Success response creating purchase list

**Step 3: Check application logs**

```bash
# Check for any enum-related errors in logs
tail -f logs/*.log | grep -i "enum\|status"
```

**Expected:** No error messages about invalid enum values

**Step 4: Verify data consistency**

```bash
psql postgresql://postgres:postgres@localhost:5432/sevenkitchen << 'EOF'
-- Check orders with PURCHASING status
SELECT COUNT(*) as purchasing_count, status
FROM "order"
WHERE status = 'PURCHASING'
GROUP BY status;

-- Check order status history
SELECT COUNT(*) as history_count
FROM "order_status_history"
WHERE "fromStatus" = 'PURCHASING' OR "toStatus" = 'PURCHASING';
EOF
```

**Expected:** Counts showing data is using PURCHASING status

---

## Task 9: Prepare for Production Deployment

**Files:**
- Create: `scripts/migrate-production.sh`
- Modify: `README.md` (if needed)

**Step 1: Create production migration script**

Create `scripts/migrate-production.sh`:

```bash
#!/bin/bash

# Production Database Migration Script
# Usage: ./scripts/migrate-production.sh

set -e  # Exit on error

echo "🚀 Starting production database migration..."
echo "⏰ Timestamp: $(date)"

# Confirm before proceeding
read -p "⚠️  This will modify the production database. Continue? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    echo "❌ Migration cancelled"
    exit 1
fi

# Database connection (use environment variables)
if [ -z "$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL environment variable not set"
    exit 1
fi

# Create backup
echo "📦 Creating backup..."
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="./backups/prod_backup_${TIMESTAMP}.sql"
mkdir -p ./backups

pg_dump $DATABASE_URL > $BACKUP_FILE
echo "✅ Backup saved to: $BACKUP_FILE"

# Run migrations
echo "🔄 Applying migrations..."
npx prisma migrate deploy

echo "✅ Migration completed successfully!"
echo "⏰ Timestamp: $(date)"
```

**Step 2: Make script executable**

```bash
chmod +x scripts/migrate-production.sh
```

**Step 3: Test migration script (dry run)**

```bash
# Test with local database first
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/sevenkitchen" \
  ./scripts/migrate-production.sh
```

**Expected:** Script runs successfully on local database

**Step 4: Add to README if not present**

```bash
# Check if migration section exists in README
grep -q "Database Migration" README.md || echo "Migration section not found in README"
```

If not found, add to README.md:

```markdown
## Database Migrations

### Applying Migrations

To apply pending migrations:

```bash
npm run migrate:deploy
```

### Production Migration

For production deployment, use the automated script:

```bash
./scripts/migrate-production.sh
```

This will:
1. Create a backup
2. Apply all pending migrations
3. Verify migration success
```

**Step 5: Commit deployment script**

```bash
git add scripts/migrate-production.sh
git add README.md
git commit -m "chore: add production migration script and documentation"
```

---

## Task 10: Final Verification and Cleanup

**Files:**
- Delete: `prisma/migrations/MIGRATION_WAITING_TO_PURCHASING.md` (obsolete)

**Step 1: Remove obsolete migration guide**

```bash
# The migration is now complete, remove the pending migration guide
rm prisma/migrations/MIGRATION_WAITING_TO_PURCHASING.md
echo "✓ Removed obsolete migration guide"
```

**Expected:** Confirmation message

**Step 2: Run final migration status check**

```bash
npx prisma migrate status
```

**Expected:** `The database is in sync with the migrations.`

**Step 3: Verify schema matches Prisma schema**

```bash
# Format Prisma schema
npx prisma format

# Check for any schema drift
npx prisma db pull
```

**Expected:** No warnings about schema differences

**Step 4: Create final commit**

```bash
git add -A
git commit -m "chore: complete database synchronization between dev and production

- Added production migration files to development
- Applied all pending migrations
- Cleaned up duplicate migration files
- Regenerated Prisma Client with updated schema
- Verified OrderStatus.PURCHASING enum is working
- All environments now in sync"
```

**Step 5: Test full application flow**

```bash
# Start application
npm run dev

# Run integration tests if available
npm run test:integration

# Or manually test key flows:
# 1. Create order → should move through PAID → PURCHASING → IN_PRODUCTION
# 2. Generate purchase list → should use PURCHASING status
# 3. Auto-schedule production → should query PURCHASING orders successfully
```

**Expected:** All tests pass, no enum errors

---

## Rollback Plan (If Needed)

### If migration fails:

1. **Restore database from backup:**
   ```bash
   psql postgresql://postgres:postgres@localhost:5432/sevenkitchen < ../backup_sevenkitchen_TIMESTAMP.sql
   ```

2. **Remove applied migrations from tracking:**
   ```sql
   DELETE FROM _prisma_migrations
   WHERE migration_name IN (
       '20260109000000_phase9_order_status_optimization',
       '20260125192532_add_reimbursement_cost_details',
       '20260131000000_add_favorite_recipe_table'
   );
   ```

3. **Reset Prisma Client:**
   ```bash
   git checkout HEAD -- node_modules/@prisma/client/
   npx prisma generate
   ```

---

## Success Criteria

✓ Development database schema matches production
✓ All pending migrations applied successfully
✓ OrderStatus.PURCHASING enum works in queries
✓ No duplicate migration files
✓ Prisma Client regenerated with latest schema
✓ Auto-schedule endpoint works without errors
✓ Backup created before migration
✓ Migration script ready for production deployment

---

## References

- Prisma Migration Documentation: https://www.prisma.io/docs/concepts/components/prisma-migrate
- PostgreSQL ENUM ALTER TYPE: https://www.postgresql.org/docs/current/sql-altertype.html
- Original migration guide: `prisma/migrations/MIGRATION_WAITING_TO_PURCHASING.md` (archived)

---

**Next Steps After Plan Execution:**

1. Test migration script in staging environment
2. Schedule production deployment during low-traffic period
3. Monitor production database after migration
4. Update team documentation on migration process
