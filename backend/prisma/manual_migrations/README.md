# Manual Prisma Migrations

This directory contains SQL migrations that need to be applied manually when `prisma migrate dev` encounters issues (e.g., shadow database issues).

## How to Apply

1. **Check current database state:**
   ```bash
   psql $DATABASE_URL -c "\d order" | grep -E "(tracking_number|carrier_code|shipped_at)"
   ```

2. **Apply migration:**
   ```bash
   psql $DATABASE_URL -f prisma/manual_migrations/20251217_add_order_shipping_fields.sql
   ```

3. **Verify:**
   ```bash
   psql $DATABASE_URL -c "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'order' AND column_name IN ('tracking_number', 'carrier_code', 'shipped_at');"
   ```

4. **Regenerate Prisma Client:**
   ```bash
   pnpm prisma generate
   ```

## Migration Files

- `20251217_add_order_shipping_fields.sql`: Phase 8.14 - Shipping tracking fields
