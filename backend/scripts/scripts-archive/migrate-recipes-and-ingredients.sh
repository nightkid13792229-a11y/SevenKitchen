#!/bin/bash

# Recipe and Ingredient Data Migration Script
# Migrate recipes and ingredients from local to production database safely

set -e

echo "=========================================="
echo "Recipe & Ingredient Data Migration"
echo "Local → Production"
echo "=========================================="
echo ""

# Local database
LOCAL_DB="postgresql://postgres:postgres@localhost:5432/sevenkitchen"

# Production database (from server)
PROD_HOST="1.14.3.2"
PROD_DB="postgresql://postgres:postgres@127.0.0.1:5432/sevenkitchen"

echo "Step 1: Backup production data..."
ssh -i ~/.ssh/claude_deploy root@$PROD_HOST bash << 'ENDSSH'
cd /opt/sevenkitchen/SevenKitchen/backend

DB_HOST=$(grep DATABASE_URL .env | sed 's/.*@\([^:]*\):.*/\1/')
DB_PORT=$(grep DATABASE_URL .env | sed 's/.*:\([0-9]*\)\/.*/\1/')
DB_NAME=$(grep DATABASE_URL .env | sed 's|.*/\([^?]*\).*|\1|')
DB_USER=$(grep DATABASE_URL .env | sed 's|.*://\([^:]*\):.*|\1|')
DB_PASS=$(grep DATABASE_URL .env | sed 's|.*:\([^@]*\)@.*|\1|')

export PGPASSWORD=$DB_PASS

# Backup production data
BACKUP_FILE="/tmp/recipes_ingredients_backup_$(date +%Y%m%d_%H%M%S).sql"
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  -t recipe \
  -t recipe_item \
  -t recipe_health_tag \
  -t recipe_health_tag_assignment \
  -t ingredient \
  -t ingredient_tag \
  -t ingredient_tag_assignment \
  -t design_source \
  > "$BACKUP_FILE"

echo "✅ Backup saved to $BACKUP_FILE"
ls -lh "$BACKUP_FILE"
ENDSSH

echo ""
echo "Step 2: Export data from local database..."
pg_dump "$LOCAL_DB" \
  -t recipe \
  -t recipe_item \
  -t recipe_health_tag \
  -t recipe_health_tag_assignment \
  -t ingredient \
  -t ingredient_tag \
  -t ingredient_tag_assignment \
  -t design_source \
  --data-only \
  --column-inserts \
  > /tmp/recipes_ingredients_data.sql

echo "✅ Exported to /tmp/recipes_ingredients_data.sql"
echo ""

echo "Step 3: Upload to production server..."
scp -i ~/.ssh/claude_deploy /tmp/recipes_ingredients_data.sql \
  root@$PROD_HOST:/tmp/

echo "✅ Uploaded to production server"
echo ""

echo "Step 4: Import to production database..."
ssh -i ~/.ssh/claude_deploy root@$PROD_HOST bash << 'ENDSSH'
cd /opt/sevenkitchen/SevenKitchen/backend

DB_HOST=$(grep DATABASE_URL .env | sed 's/.*@\([^:]*\):.*/\1/')
DB_PORT=$(grep DATABASE_URL .env | sed 's/.*:\([0-9]*\)\/.*/\1/')
DB_NAME=$(grep DATABASE_URL .env | sed 's|.*/\([^?]*\).*|\1|')
DB_USER=$(grep DATABASE_URL .env | sed 's|.*://\([^:]*\):.*|\1|')
DB_PASS=$(grep DATABASE_URL .env | sed 's|.*:\([^@]*\)@.*|\1|')

export PGPASSWORD=$DB_PASS

# Clear existing data (in correct order to respect foreign keys)
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" << 'EOSQL'
-- Delete ingredient data (cascade to dependent tables)
DELETE FROM "ingredient_tag_assignment";
DELETE FROM "ingredient";

-- Delete recipe data (cascade to dependent tables)
DELETE FROM "recipe_health_tag_assignment";
DELETE FROM "recipe_item";
DELETE FROM "recipe";
DELETE FROM "recipe_health_tag";
EOSQL

# Import new data
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" < /tmp/recipes_ingredients_data.sql

echo "✅ Data imported successfully"
ENDSSH

echo ""
echo "Step 5: Verify migration..."
ssh -i ~/.ssh/claude_deploy root@$PROD_HOST bash << 'ENDSSH'
cd /opt/sevenkitchen/SevenKitchen/backend

DB_HOST=$(grep DATABASE_URL .env | sed 's/.*@\([^:]*\):.*/\1/')
DB_PORT=$(grep DATABASE_URL .env | sed 's/.*:\([0-9]*\)\/.*/\1/')
DB_NAME=$(grep DATABASE_URL .env | sed 's|.*/\([^?]*\).*|\1|')
DB_USER=$(grep DATABASE_URL .env | sed 's|.*://\([^:]*\):.*|\1|')
DB_PASS=$(grep DATABASE_URL .env | sed 's|.*:\([^@]*\)@.*|\1|')

export PGPASSWORD=$DB_PASS

echo "Production data summary:"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" << 'EOSQL'
SELECT 'Recipes' as type, COUNT(*) as count FROM "recipe"
UNION ALL
SELECT 'Recipe Items', COUNT(*) FROM "recipe_item"
UNION ALL
SELECT 'Recipe Health Tags', COUNT(*) FROM "recipe_health_tag"
UNION ALL
SELECT 'Recipe Tag Assignments', COUNT(*) FROM "recipe_health_tag_assignment"
UNION ALL
SELECT 'Ingredients', COUNT(*) FROM "ingredient"
UNION ALL
SELECT 'Ingredient Tags', COUNT(*) FROM "ingredient_tag"
UNION ALL
SELECT 'Ingredient Tag Assignments', COUNT(*) FROM "ingredient_tag_assignment";
EOSQL
ENDSSH

echo ""
echo "=========================================="
echo "✅ Migration completed!"
echo "=========================================="
echo ""
echo "To rollback:"
echo "1. SSH to production server: ssh -i ~/.ssh/claude_deploy root@$PROD_HOST"
echo "2. Restore from backup: psql \$DATABASE_URL < /tmp/recipes_ingredients_backup_*.sql"
