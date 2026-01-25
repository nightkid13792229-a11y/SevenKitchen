#!/bin/bash
# 备份 reimbursement 表结构

BACKUP_DIR="./backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo "备份 reimbursement 表..."
pg_dump $DATABASE_URL -t reimbursement > "$BACKUP_DIR/reimbursement.sql"

echo "备份完成: $BACKUP_DIR"
