-- Historical production migration baseline.
--
-- A failed production migration was recorded with this literal name in
-- _prisma_migrations. The actual WAITING_FOR_PRODUCTION -> PURCHASING data and
-- enum change are covered by 20260109000000_phase9_order_status_optimization.
-- Keep this no-op migration so Prisma history remains deployable.
SELECT 1;
