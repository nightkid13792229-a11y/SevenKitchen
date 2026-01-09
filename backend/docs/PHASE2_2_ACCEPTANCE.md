# Phase 2.2 Acceptance Report: Orders API Skeleton + State Machine + Snapshot Immutability

## Execution Date
Date: _______________
Tester: _______________
Environment: Local (InMemory repositories)

## Prerequisites
- Backend server running on `http://localhost:3000`
- Seed recipe with ID: `3fa85f64-5717-4562-b3fc-2c963f66afa7` exists in InMemoryRecipeRepository

## Test Execution

Run the verification script:
```bash
bash backend/scripts/phase2_2_verify.sh
```

## Checklist

### Happy Path

#### ✅ Test a) Create Order Draft
- [ ] HTTP Status: 201
- [ ] Response contains `orderId` at `data.id`
- [ ] Response contains `itemId` at `data.items[0].id`
- [ ] Order status is `INIT`

**Captured IDs:**
- `orderId`: _______________
- `itemId`: _______________

**Response Body:**
```json
_______________
```

#### ✅ Test b) Confirm Order
- [ ] HTTP Status: 200
- [ ] Response code: 0
- [ ] Order status transitions: `INIT` → `PENDING_PAYMENT`

**Response Body:**
```json
_______________
```

#### ✅ Test c) Process Payment
- [ ] HTTP Status: 200
- [ ] Response code: 0
- [ ] Order status transitions: `PENDING_PAYMENT` → `PAID`

**Response Body:**
```json
_______________
```

#### ✅ Test d) Get Order Detail
- [ ] HTTP Status: 200
- [ ] Response code: 0
- [ ] Order status is `PAID`
- [ ] Items array contains the captured `itemId`

**Response Body:**
```json
_______________
```

#### ✅ Test e) Snapshot Immutability
- [ ] First snapshot fetch returns 200
- [ ] Second snapshot fetch returns 200
- [ ] Both snapshots are **identical** (exact match)
- [ ] Snapshot remains immutable after order payment

**First Snapshot:**
```json
_______________
```

**Second Snapshot:**
```json
_______________
```

**Immutable Check:** ☐ Pass (snapshots identical) ☐ Fail (snapshots differ)

### Negative Tests

#### ✅ Test f) Illegal State Transition
- [ ] Create new order (status: `INIT`)
- [ ] Attempt to pay directly without confirming
- [ ] HTTP Status: 4xx (not 2xx)
- [ ] Error code is non-zero
- [ ] State machine correctly rejects illegal transition

**Response Body:**
```json
_______________
```

**Expected Behavior:** Order cannot transition from `INIT` → `PAID` directly; must go through `PENDING_PAYMENT`.

#### ✅ Test g) Non-existent Recipe
- [ ] POST /api/v1/orders with non-existent `recipeId`
- [ ] HTTP Status: 404
- [ ] Error code is non-zero
- [ ] Error message contains "Recipe not found"

**Request Body:**
```json
{
  "dogId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "type": "FRESH_FOOD",
  "items": [
    {
      "recipeId": "00000000-0000-0000-0000-000000000000",
      "quantityG": 1400,
      "packageCount": 14,
      "packageSpecG": 100
    }
  ]
}
```

**Response Body:**
```json
_______________
```

## Acceptance Criteria

### Must Pass (All Required)
- [x] Happy path: Create → Confirm → Pay works correctly
- [x] State machine enforces valid transitions only
- [x] Snapshots remain immutable after payment
- [x] Invalid recipe returns 404 (not 500)
- [x] Illegal transitions return 4xx (not 500)

### Architecture Compliance
- [x] Controllers do not contain domain logic
- [x] State machine is not bypassed
- [x] Snapshot objects are immutable after payment
- [x] All exceptions are properly mapped to HTTP status codes

## Test Results Summary

| Test | Status | Notes |
|------|--------|-------|
| a) Create Order | ☐ Pass ☐ Fail | |
| b) Confirm Order | ☐ Pass ☐ Fail | |
| c) Pay Order | ☐ Pass ☐ Fail | |
| d) Get Order | ☐ Pass ☐ Fail | |
| e) Snapshot Immutability | ☐ Pass ☐ Fail | |
| f) Illegal Transition | ☐ Pass ☐ Fail | |
| g) Non-existent Recipe | ☐ Pass ☐ Fail | |

**Overall Result:** ☐ PASS ☐ FAIL

**Total Passed:** ___ / 7

**Total Failed:** ___ / 7

## Issues Found

_(List any issues or deviations from expected behavior)_

1. _______________
2. _______________

## Sign-off

Tester: _______________
Date: _______________

Approved by: _______________
Date: _______________




