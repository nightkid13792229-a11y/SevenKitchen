#!/bin/bash
# Verify that every migration already applied in the database exists locally
# and still matches the recorded checksum. Pending local migrations are allowed.

set -euo pipefail

export LC_ALL=C

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$BACKEND_DIR"

if ! command -v psql >/dev/null 2>&1; then
  echo "[Migration Check] ✗ psql is required to verify applied migration history"
  exit 1
fi

checksum_file() {
  local file_path="$1"

  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$file_path" | awk '{print $1}'
    return
  fi

  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file_path" | awk '{print $1}'
    return
  fi

  echo "[Migration Check] ✗ Neither shasum nor sha256sum is available"
  exit 1
}

if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[Migration Check] ✗ DATABASE_URL is required"
  exit 1
fi

PSQL_URL=$(printf '%s' "$DATABASE_URL" | perl -0pe 's/([?&])timezone=[^&]*//g; s/([?&])schema=[^&]*//g; s/[?&]$//; s/\?&/?/g')

DB_ROWS_FILE=$(mktemp)
DB_NAMES_FILE=$(mktemp)
LOCAL_NAMES_FILE=$(mktemp)
trap 'rm -f "$DB_ROWS_FILE" "$DB_NAMES_FILE" "$LOCAL_NAMES_FILE"' EXIT

if ! psql "$PSQL_URL" -AtF '|' -c \
  "SELECT migration_name, MIN(checksum) AS checksum, COUNT(DISTINCT checksum) AS checksum_variants
   FROM _prisma_migrations
   WHERE rolled_back_at IS NULL
   GROUP BY migration_name
   ORDER BY migration_name;" >"$DB_ROWS_FILE"; then
  echo "[Migration Check] ✗ Unable to query _prisma_migrations"
  exit 1
fi

ISSUES=0

while IFS='|' read -r migration_name checksum checksum_variants; do
  [ -n "$migration_name" ] || continue

  echo "$migration_name" >>"$DB_NAMES_FILE"

  if [ "$checksum_variants" != "1" ]; then
    echo "[Migration Check] ✗ Database contains conflicting checksums for $migration_name"
    ISSUES=$((ISSUES + 1))
    continue
  fi

  local_file="prisma/migrations/$migration_name/migration.sql"
  if [ ! -f "$local_file" ]; then
    echo "[Migration Check] ✗ Applied migration missing locally: $migration_name"
    ISSUES=$((ISSUES + 1))
    continue
  fi

  if [ "$checksum" = "placeholder_checksum" ]; then
    echo "[Migration Check] ! Placeholder checksum recorded for $migration_name; verified local file presence only"
    continue
  fi

  local_checksum=$(checksum_file "$local_file")
  if [ "$local_checksum" != "$checksum" ]; then
    echo "[Migration Check] ✗ Applied migration checksum mismatch: $migration_name"
    ISSUES=$((ISSUES + 1))
  fi
done <"$DB_ROWS_FILE"

for dir in prisma/migrations/*; do
  [ -d "$dir" ] || continue
  [ -f "$dir/migration.sql" ] || continue
  basename "$dir" >>"$LOCAL_NAMES_FILE"
done

sort -u "$DB_NAMES_FILE" -o "$DB_NAMES_FILE"
sort -u "$LOCAL_NAMES_FILE" -o "$LOCAL_NAMES_FILE"

PENDING_LOCAL=$(comm -23 "$LOCAL_NAMES_FILE" "$DB_NAMES_FILE" || true)
if [ -n "$PENDING_LOCAL" ]; then
  echo "[Migration Check] Pending local migrations detected (expected before deploy):"
  echo "$PENDING_LOCAL"
fi

if [ "$ISSUES" -gt 0 ]; then
  exit 1
fi

echo "[Migration Check] ✓ Applied migration history matches local files"
