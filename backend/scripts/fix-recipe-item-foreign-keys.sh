#!/bin/bash

# Fix Recipe Item Foreign Keys
# Match recipe_item records with their correct recipes by comparing data

ssh -i ~/.ssh/claude_deploy root@1.14.3.2 bash << 'ENDSSH'
cd /opt/sevenkitchen/SevenKitchen/backend

DB_HOST=$(grep DATABASE_URL .env | sed 's/.*@\([^:]*\):.*/\1/')
DB_PORT=$(grep DATABASE_URL .env | sed 's/.*:\([0-9]*\)\/.*/\1/')
DB_NAME=$(grep DATABASE_URL .env | sed 's|.*/\([^?]*\).*|\1|')
DB_USER=$(grep DATABASE_URL .env | sed 's|.*://\([^:]*\):.*|\1|')
DB_PASS=$(grep DATABASE_URL .env | sed 's|.*:\([^@]*\)@.*|\1|')

export PGPASSWORD=$DB_PASS

echo "Fixing recipe_item foreign keys..."
echo ""

# Check current state
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" << 'EOF'
-- Show orphaned recipe_items
SELECT COUNT(*) as orphaned_items
FROM recipe_item ri
LEFT JOIN recipe r ON ri.recipe_id = r.id
WHERE r.id IS NULL;

-- Sample orphaned items
SELECT id, recipe_id, recipe_snapshot->>'name' as recipe_name
FROM recipe_item
WHERE recipe_id NOT IN (SELECT id FROM recipe)
LIMIT 3;
EOF

echo ""
echo "⚠️ Recipe items need to be deleted and re-imported with correct IDs"
echo ""
echo "Recommendation: Re-run migration with full dump including recipes and items together"
ENDSSH
