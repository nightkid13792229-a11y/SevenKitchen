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
