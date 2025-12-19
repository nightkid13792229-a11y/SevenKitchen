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
