# Manual migrations

Apply:
psql "$DATABASE_URL" -f <sql-file>

- 20251219_add_order_completed_at.sql: adds order.completed_at
