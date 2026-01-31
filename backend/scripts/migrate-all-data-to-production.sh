#!/bin/bash

# Complete Data Migration: Local → Production
# WARNING: This will replace all production data

set -e

echo "=========================================="
echo "Complete Data Migration"
echo "Local → Production (Full Replace)"
echo "=========================================="
echo ""

LOCAL_DB="postgresql://postgres:postgres@localhost:5432/sevenkitchen"
PROD_HOST="1.14.3.2"
PROD_DB_PATH="/opt/sevenkitchen/SevenKitchen/backend"

echo "⚠️  WARNING: This will REPLACE all production data!"
echo ""
read -p "Continue? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    echo "Aborted."
    exit 1
fi

echo ""
echo "Step 1: Backup production database..."
ssh -i ~/.ssh/claude_deploy root@$PROD_HOST bash << 'ENDSSH'
cd $PROD_DB_PATH

DB_HOST=$(grep DATABASE_URL .env | sed 's/.*@\([^:]*\):.*/\1/')
DB_PORT=$(grep DATABASE_URL .env | sed 's/.*:\([0-9]*\)\/.*/\1/')
DB_NAME=$(grep DATABASE_URL .env | sed 's|.*/\([^?]*\).*|\1|')
DB_USER=$(grep DATABASE_URL .env | sed 's|.*://\([^:]*\):.*|\1|')
DB_PASS=$(grep DATABASE_URL .env | sed 's|.*:\([^@]*\)@.*|\1|')

export PGPASSWORD=$DB_PASS

# Full backup
BACKUP_FILE="/tmp/sevenkitchen_full_backup_$(date +%Y%m%d_%H%M%S).sql"
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" > "$BACKUP_FILE"

echo "✅ Backup saved: $BACKUP_FILE"
ls -lh "$BACKUP_FILE"
ENDSSH

echo ""
echo "Step 2: Clear production data (excluding schema)..."
ssh -i ~/.ssh/claude_deploy root@$PROD_HOST bash << 'ENDSSH'
cd $PROD_DB_PATH

DB_HOST=$(grep DATABASE_URL .env | sed 's/.*@\([^:]*\):.*/\1/')
DB_PORT=$(grep DATABASE_URL .env | sed 's/.*:\([0-9]*\)\/.*/\1/')
DB_NAME=$(grep DATABASE_URL .env | sed 's|.*/\([^?]*\).*|\1|')
DB_USER=$(grep DATABASE_URL .env | sed 's|.*://\([^:]*\):.*|\1|')
DB_PASS=$(grep DATABASE_URL .env | sed 's|.*:\([^@]*\)@.*|\1|')

export PGPASSWORD=$DB_PASS

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" << 'EOSQL'
-- Delete all data in correct order (respecting foreign keys)
DELETE FROM order_status_history;
DELETE FROM order_item;
DELETE FROM "order";
DELETE FROM recipe_health_tag_assignment;
DELETE FROM recipe_item;
DELETE FROM recipe;
DELETE FROM recipe_health_tag;
DELETE FROM packaging_unit;
DELETE FROM production_batch;
DELETE FROM dog_health_allergy_record;
DELETE FROM dog_health_checkup;
DELETE FROM dog_health_medical_record;
DELETE FROM dog_health_vaccine;
DELETE FROM dog;
DELETE FROM "user";
DELETE FROM customization_form_response;
DELETE FROM favorite;
DELETE FROM custom_recipe_order;
EOSQL

echo "✅ Production data cleared"
ENDSSH

echo ""
echo "Step 3: Export local data..."
export PGDATABASE=sevenkitchen PGUSER=postgres PGHOST=localhost PGPORT=5432 PGPASSWORD=postgres

# Export all data to CSV
TABLES=(
    "user"
    "dog"
    "dog_health_vaccine"
    "dog_health_checkup"
    "dog_health_medical_record"
    "dog_health_allergy_record"
    "recipe"
    "recipe_health_tag"
    "recipe_item"
    "recipe_health_tag_assignment"
    "custom_recipe_order"
    "favorite"
    "order"
    "order_item"
    "order_status_history"
    "production_batch"
    "packaging_unit"
)

for table in "${TABLES[@]}"; do
    echo "  Exporting $table..."
    psql -c "\copy (SELECT * FROM $table ORDER BY id) TO '/tmp/${table}.csv' CSV HEADER"
done

echo "✅ Local data exported"
ls -lh /tmp/*.csv | wc -l

echo ""
echo "Step 4: Upload data to production..."
for table in "${TABLES[@]}"; do
    scp -i ~/.ssh/claude_deploy "/tmp/${table}.csv" root@$PROD_HOST:/opt/sevenkitchen/ 2>/dev/null || true
done

echo "✅ Data uploaded"

echo ""
echo "Step 5: Import to production..."
ssh -i ~/.ssh/claude_deploy root@$PROD_HOST bash << 'ENDSSH'
cd $PROD_DB_PATH

DB_HOST=$(grep DATABASE_URL .env | sed 's/.*@\([^:]*\):.*/\1/')
DB_PORT=$(grep DATABASE_URL .env | sed 's/.*:\([0-9]*\)\/.*/\1/')
DB_NAME=$(grep DATABASE_URL .env | sed 's|.*/\([^?]*\).*|\1|')
DB_USER=$(grep DATABASE_URL .env | sed 's|.*://\([^:]*\):.*|\1|')
DB_PASS=$(grep DATABASE_URL .env | sed 's|.*:\([^@]*\)@.*|\1|')

export PGPASSWORD=$DB_PASS

# Import in correct order
IMPORT_ORDER=(
    "user"
    "dog"
    "dog_health_vaccine"
    "dog_health_checkup"
    "dog_health_medical_record"
    "dog_health_allergy_record"
    "recipe_health_tag"
    "recipe"
    "recipe_item"
    "recipe_health_tag_assignment"
    "custom_recipe_order"
    "favorite"
    "order"
    "order_item"
    "order_status_history"
    "production_batch"
    "packaging_unit"
)

for table in "${IMPORT_ORDER[@]}"; do
    if [ -f "/opt/sevenkitchen/${table}.csv" ]; then
        echo "  Importing $table..."
        psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
          -c "COPY $table FROM '/opt/sevenkitchen/${table}.csv' CSV HEADER;" 2>&1 | grep -v "COPY" || true
    fi
done

echo ""
echo "✅ Data imported"
ENDSSH

echo ""
echo "Step 6: Verify migration..."
ssh -i ~/.ssh/claude_deploy root@$PROD_HOST bash << 'ENDSSH'
cd $PROD_DB_PATH

DB_HOST=$(grep DATABASE_URL .env | sed 's/.*@\([^:]*\):.*/\1/')
DB_PORT=$(grep DATABASE_URL .env | sed 's/.*:\([0-9]*\)\/.*/\1/')
DB_NAME=$(grep DATABASE_URL .env | sed 's|.*/\([^?]*\).*|\1|')
DB_USER=$(grep DATABASE_URL .env | sed 's|.*://\([^:]*\):.*|\1|')
DB_PASS=$(grep DATABASE_URL .env | sed 's|.*:\([^@]*\)@.*|\1|')

export PGPASSWORD=$DB_PASS

echo "Production data summary:"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" << 'EOSQL'
SELECT 'users' as table_name, COUNT(*) as count FROM "user"
UNION ALL
SELECT 'dogs', COUNT(*) FROM dog
UNION ALL
SELECT 'vaccines', COUNT(*) FROM dog_health_vaccine
UNION ALL
SELECT 'recipes', COUNT(*) FROM recipe
UNION ALL
SELECT 'recipe_items', COUNT(*) FROM recipe_item
UNION ALL
SELECT 'orders', COUNT(*) FROM "order";
EOSQL
ENDSSH

echo ""
echo "=========================================="
echo "✅ Migration completed!"
echo "=========================================="
echo ""
echo "Rollback command (if needed):"
echo "ssh root@$PROD_HOST"
echo "psql \$DATABASE_URL < /tmp/sevenkitchen_full_backup_*.sql"
