# Phase 8.14: Shipping Fulfillment E2E Verification

## Overview

This document describes the end-to-end verification process for Phase 8.14: Production Shipment / Fulfillment MVP.

## What Was Built

Phase 8.14 implements the shipping fulfillment workflow:

1. **Automatic Batch Completion**: When all PackagingUnits in a ProductionBatch are COMPLETED, the batch automatically transitions to COMPLETED
2. **Automatic Order Transition**: When a ProductionBatch completes, related Orders automatically transition to READY_FOR_SHIPMENT
3. **Shipping Staff APIs**:
   - `GET /api/v1/staff/shipping/orders`: List orders ready for shipment
   - `POST /api/v1/staff/shipping/orders/:orderId/ship`: Mark order as shipped with tracking information

## Prerequisites

- PostgreSQL database running and accessible
- All migrations applied (see `backend/prisma/manual_migrations/`)
- Backend server running: `cd backend && pnpm start:dev`
- Test data: At least one Dog, Recipe, and Address exist (or will be auto-created by script)

## Environment Variables

The E2E script supports the following environment variables:

- `BASE_URL`: Backend base URL (default: `http://127.0.0.1:3000`)
- `HEALTH_PATH`: Explicit health check path (default: auto-detect `/health` or `/api/v1/health`)
- `STAFF_LOGIN_PATH`: Explicit staff login endpoint (default: `/api/v1/auth/login`)
- `STAFF_CUSTOMER_ID`: Staff user customerId for login (default: `staff-user-001`)
- `CUSTOMER_CUSTOMER_ID`: Customer user customerId for login (default: `customer-user-001`)
- `DOG_ID`: Pre-existing dog ID to use (default: auto-create a new dog)
- `DOG_CREATE_PATH`: Explicit dog creation endpoint (default: `/api/v1/dogs`)
- `DOG_CREATE_BODY`: Custom dog creation payload JSON (default: uses standard test dog values)

### Staff Login

The script uses `/api/v1/auth/login` with `{"customerId": "staff-user-001"}` by default. The backend's auth system accepts any customerId string and generates a JWT token. There is no separate staff authentication - staff endpoints use the same JWT-based auth as customer endpoints.

To override the staff login:
```bash
STAFF_CUSTOMER_ID=my-staff-id /bin/bash scripts/phase8_14_shipping_fulfillment_e2e_verify.sh
```

## Running E2E Verification

### Standard Mode

```bash
cd backend
/bin/bash scripts/phase8_14_shipping_fulfillment_e2e_verify.sh > ../docs/e2e/phase8_14_e2e_$(date +%Y%m%d_%H%M%S).log 2>&1
```

### Expected Output

All steps (1-10) should show `✓ Success`:
- Step 1: Health check passed
- Step 2: Login successful
- Step 3: Order created and paid
- Step 4: Production batch created
- Step 5: Batch detail retrieved, task found
- Step 6a: Task updated to IN_PROGRESS
- Step 6b: Task updated to COMPLETED with actual usage
- Step 7: Order is READY_FOR_SHIPMENT (may need retry if async)
- Step 8: List orders ready for shipment
- Step 9: Order marked as shipped with tracking info
- Step 10: Order verified as SHIPPED with tracking fields persisted

Final summary shows:
- Order ID: `<uuid>`
- Batch ID: `<uuid>`
- Task ID: `<uuid>`
- Shipped: YES
- Tracking Number: `<tracking-number>`

## Verification Steps

### Step 1: Verify Script Syntax

```bash
cd backend
bash -n scripts/phase8_14_shipping_fulfillment_e2e_verify.sh
```

Expected: No output (syntax valid)

### Step 2: Run E2E Script

```bash
cd backend
/bin/bash scripts/phase8_14_shipping_fulfillment_e2e_verify.sh
```

### Step 3: Extract Key Information from Log

```bash
cd docs/e2e
# Extract Order ID
grep "Order ID:" phase8_14_e2e_*.log | tail -1

# Extract Tracking Number
grep "Tracking Number:" phase8_14_e2e_*.log | tail -1

# Extract Shipped Status
grep "Shipped:" phase8_14_e2e_*.log | tail -1
```

## Known Limitations

1. **Async Batch Completion**: Step 7 may need a retry if batch completion is still processing. The script includes a 2-second wait, but in high-load scenarios, a longer wait or retry logic may be needed.

2. **Database Migration**: If Prisma migrate dev fails (shadow DB issues), apply the manual migration from `backend/prisma/manual_migrations/20251217_add_order_shipping_fields.sql`.

3. **Test Data Dependency**: The script assumes test data (Dog, Recipe, Address) exists. If not, the script will fail at order creation.

## Troubleshooting

### Order Not READY_FOR_SHIPMENT

If Step 7 fails:
1. Check batch status: `GET /api/v1/staff/kitchen/batches/{batchId}`
2. Verify all tasks are COMPLETED
3. Manually trigger batch completion check (if needed)
4. Retry Step 7

### Shipping API Returns 400

If Step 9 fails with 400:
1. Verify order status is READY_FOR_SHIPMENT
2. Check request body: `trackingNumber` and `carrierCode` must be non-empty strings
3. Verify order exists: `GET /api/v1/orders/{orderId}`

### Tracking Fields Not Persisted

If Step 10 fails:
1. Check database migration was applied
2. Verify Prisma Client was regenerated: `pnpm prisma generate`
3. Check order in database: `SELECT tracking_number, carrier_code, shipped_at FROM "order" WHERE id = '<order-id>';`

## Acceptance Criteria

- [x] E2E script passes all steps (1-10) on macOS bash 3.2
- [x] Batch auto-completes when all units are COMPLETED
- [x] Order auto-transitions to READY_FOR_SHIPMENT when batch completes
- [x] Shipping staff can list orders ready for shipment
- [x] Shipping staff can mark orders as shipped with tracking info
- [x] Tracking information is persisted (trackingNumber, carrierCode, shippedAt)
- [x] Order status transitions correctly (READY_FOR_SHIPMENT → SHIPPED)
- [x] All unit tests pass
- [x] Build succeeds
