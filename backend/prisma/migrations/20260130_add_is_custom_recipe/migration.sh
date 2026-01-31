#!/bin/bash

# Database Migration Script
# Add is_custom_recipe column to recipe table

set -e

echo "=== SevenKitchen Database Migration ==="
echo "Migration: Add is_custom_recipe column"
echo ""

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
else
    echo "Error: .env file not found"
    exit 1
fi

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "Error: DATABASE_URL not found in .env"
    exit 1
fi

echo "Database URL: ${DATABASE_URL:0:20}..." # Show first 20 chars only
echo ""

# Run the migration
echo "Running migration..."
psql "$DATABASE_URL" << 'EOF'
-- Add is_custom_recipe column if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'recipe'
        AND column_name = 'is_custom_recipe'
    ) THEN
        ALTER TABLE "recipe" ADD COLUMN "is_custom_recipe" BOOLEAN NOT NULL DEFAULT false;
        RAISE NOTICE 'Column is_custom_recipe added successfully';
    ELSE
        RAISE NOTICE 'Column is_custom_recipe already exists';
    END IF;
END $$;

-- Add index for performance
CREATE INDEX IF NOT EXISTS "recipe_is_custom_recipe_idx" ON "recipe"("is_custom_recipe");

-- Verify
SELECT
    column_name,
    data_type,
    column_default
FROM information_schema.columns
WHERE table_name = 'recipe'
AND column_name = 'is_custom_recipe';
EOF

echo ""
echo "✅ Migration completed successfully!"
echo ""
echo "To verify:"
echo "  psql \$DATABASE_URL -c 'SELECT is_custom_recipe FROM recipe LIMIT 1;'"
