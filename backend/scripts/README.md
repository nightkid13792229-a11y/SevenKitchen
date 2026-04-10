# Backend Verification Scripts

This directory contains end-to-end verification scripts for testing the SevenKitchen API.

## Prerequisites

All scripts require:
- `curl` - HTTP client (usually pre-installed on macOS/Linux)
- `jq` - JSON parser

### Installing jq

**macOS:**
```bash
brew install jq
```

**Linux (Debian/Ubuntu):**
```bash
apt-get install jq
```

**Linux (RHEL/CentOS):**
```bash
yum install jq
```

## Scripts

### `audit-recipe-stats.ts`

Read-only recipe counter audit for production or staging databases.

This script focuses on the three counters shown in the miniapp recipe showcase:
- `favoriteCount`: fully reconcilable against `favorite_recipe`
- `viewCount`: not fully auditable historically because there is no event detail table
- `diyGenCount`: not fully auditable historically because there is no event detail table

What the script can detect:
- `favoriteCount` mismatches against real favorite records
- version drift where homepage displays latest `PUBLIC` version but counters are written to latest version
- favorite records attached to a non-displayed recipe version

**Usage:**
```bash
# Scan production using .env.production
cd backend
ENV_FILE=.env.production pnpm audit:recipe-stats

# Show a single recipe in detail
ENV_FILE=.env.production pnpm audit:recipe-stats -- --recipe <business-recipe-id>

# Include recipes without flags and change output size
ENV_FILE=.env.production pnpm audit:recipe-stats -- --include-ok --limit 50
```

**Environment Variables:**
- `ENV_FILE` - dotenv file path to load before connecting (default: `.env`)
- `DATABASE_URL` - optional explicit override; if set it wins over `ENV_FILE`

**Expected Output:**
```
Recipe Stats Audit
Read-only Prisma audit for recipe showcase counters.
favoriteCount 可直接对账 favorite_recipe；viewCount 和 diyGenCount 只能做风险扫描，因为没有事件明细表。

Summary
- HIGH recipe-123 | 鸡肉南瓜碗 | public=v1 overall=v2
  [HIGH] favorite_records_on_non_displayed_version: 有 2 条收藏记录挂在非首页展示版本上。
```

### `repair-favorite-counts.ts`

Dry-run or apply a repair plan for `favorite_recipe` and `recipe.favorite_count`.

What it does:
- moves legacy favorites onto the homepage-displayed version (latest `PUBLIC`, otherwise latest overall)
- deduplicates multiple favorite rows from the same user within one recipe family
- recalculates `favoriteCount` for every version in the family

**Usage:**
```bash
# Dry-run against production
cd backend
ENV_FILE=.env.production pnpm repair:favorite-counts

# Dry-run for a single recipe
ENV_FILE=.env.production pnpm repair:favorite-counts -- --recipe <business-recipe-id>

# Apply the repair
ENV_FILE=.env.production pnpm repair:favorite-counts -- --apply
```

**Important:**
- Default mode is dry-run
- `--apply` will write to the database
- Run `pnpm audit:recipe-stats` again after apply to confirm the repair

### `assert_public_recipe.sh`

Asserts that at least one PUBLIC recipe exists via HTTP API. Used in CI to verify application seeding is working correctly.

**Usage:**
```bash
# Default: http://127.0.0.1:3000, customer: ci-test-user
cd backend
pnpm verify:recipe

# Custom base URL and customer ID
BASE=http://localhost:3000 CUSTOMER_ID=test-user pnpm verify:recipe

# With server log path for diagnostics (CI)
SERVER_LOG_PATH=backend/server.log BASE=http://127.0.0.1:3000 pnpm verify:recipe
```

**Environment Variables:**
- `BASE` - API base URL (default: `http://127.0.0.1:3000`)
- `CUSTOMER_ID` - Customer ID for authentication (default: `ci-test-user`)
- `SERVER_LOG_PATH` - Optional path to server log file for diagnostics on failure

**Expected Output:**
```
INFO: Step 1: Checking API health
INFO: Health check passed
INFO: Step 2: Logging in to get authentication token
INFO: Login successful
INFO: Step 3: Checking for PUBLIC recipes
✓ Found 1 PUBLIC recipe(s)
```

**Exit Codes:**
- `0` - At least one PUBLIC recipe exists
- `1` - No PUBLIC recipe found or API error (prints full diagnostic information)

### `phase_orders_closed_loop_verify.sh`

Verifies the complete order closed-loop workflow:
- Login and JWT token authentication
- Dog creation/retrieval (idempotent)
- Address creation/retrieval (idempotent)
- Recipe retrieval
- Order creation (INIT status)
- Order confirmation (PENDING_PAYMENT status)
- Order payment (PAID status)
- Payment details retrieval
- Order history verification
- Order item snapshot retrieval

**Usage:**
```bash
# Default: http://127.0.0.1:3000, customer: staff-001
./phase_orders_closed_loop_verify.sh

# Custom base URL and customer ID
BASE=http://localhost:3000 CUSTOMER_ID=customer-123 ./phase_orders_closed_loop_verify.sh
```

**Environment Variables:**
- `BASE` - API base URL (default: `http://127.0.0.1:3000`)
- `CUSTOMER_ID` - Customer ID for authentication (default: `staff-001`)

**Expected Output:**
```
PASS: login
PASS: dog (id=...)
PASS: address (id=...)
PASS: recipe (id=...)
PASS: create order (id=..., status=INIT, itemId=...)
PASS: confirm (status=PENDING_PAYMENT)
PASS: pay (status=PAID)
PASS: payment (paymentStatus=SUCCESS)
PASS: history (... entries, transitions verified)
PASS: snapshot (id=..., name=..., version=...)
```

**Exit Codes:**
- `0` - All checks passed
- `1` - One or more checks failed

## Running Scripts

All scripts use `set -euo pipefail` for strict error handling:
- `-e` - Exit immediately if any command fails
- `-u` - Treat unset variables as errors
- `-o pipefail` - Return value of a pipeline is the status of the last command to exit with a non-zero status

Make sure scripts are executable:
```bash
chmod +x phase_orders_closed_loop_verify.sh
```

## Notes

- Scripts are idempotent: they reuse existing resources (dogs, addresses) when available
- All API calls use `Authorization: Bearer <token>` authentication
- Scripts validate response envelope format: `{"code": 0, "message": "...", "data": ...}`
- Scripts exit with non-zero status on any failure
