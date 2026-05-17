-- This migration originally duplicated the table creation performed by
-- 20260201231000_add_missing_purchase_and_custom_recipe_tables.
-- Keep the migration as an explicit no-op so historical ordering remains stable.
DO $$
BEGIN
    NULL;
END $$;
