# Phase 8.6: Comprehensive Persistence & System Integrity Verification

**Status:** ⏳ PENDING VERIFY  
**Date:** 2025-12-16  
**Phase:** 8.6  
**Verification Date:** Pending

---

## Overview

Phase 8.6 provides end-to-end verification of persistence across all domains (Dog, Recipe, Address, Order) and validates system integrity including cross-domain consistency, snapshot immutability, restart persistence, and customer isolation.

### Goals

- Verify cross-domain consistency (Order references valid Dog, Recipe, Address)
- Verify restart persistence (all entities persist after server restart)
- Verify snapshot immutability (Recipe snapshots unchanged after restart)
- Verify customer isolation (all queries scoped by customerId)

---

## Purpose

This phase does **NOT** introduce new features or business logic. It is a **verification-only** phase that:

1. **Validates** that all Prisma persistence implementations (Phases 8.2B, 8.3, 8.4, 8.5) work correctly together
2. **Confirms** that cross-domain references are maintained correctly
3. **Proves** that snapshots are truly immutable (not just in memory)
4. **Ensures** that customer isolation is enforced across all domains
5. **Demonstrates** that data persists across server restarts

---

## Verification Scope

### What IS Verified

#### 1. Cross-Domain Consistency
- ✅ Order references valid Dog (order.dogId matches existing Dog)
- ✅ Order references valid Recipe (orderItem.recipeSnapshot.recipeId matches existing Recipe)
- ✅ Order references valid Address (order.addressId matches existing Address)
- ✅ All references persist after restart

#### 2. Restart Persistence
- ✅ Order persists after server restart (status, IDs, references)
- ✅ OrderItem persists after server restart
- ✅ Snapshot data persists after server restart
- ✅ Cross-domain references persist after server restart

#### 3. Snapshot Immutability
- ✅ Recipe snapshot captured at order creation time
- ✅ Snapshot recipeId matches original Recipe ID
- ✅ Snapshot values (name, version) unchanged after restart
- ✅ Snapshot cannot be modified after order is PAID

#### 4. Customer Isolation
- ✅ All list/get APIs scoped by customerId
- ✅ Order queries filtered by customerId
- ✅ No cross-user data leakage

### What is NOT Verified

- ❌ **Performance** - No load testing or performance benchmarks
- ❌ **Concurrency** - No multi-user concurrent access testing
- ❌ **Data Migration** - No migration from memory to Prisma testing
- ❌ **Error Recovery** - No database failure/recovery scenarios
- ❌ **API Contract Changes** - No validation of API contract compliance
- ❌ **Business Logic** - No validation of domain rules or calculations
- ❌ **Security** - No penetration testing or security audits
- ❌ **Scalability** - No testing of large datasets or high-volume scenarios

---

## How to Run

### Prerequisites

1. **All Prisma repositories enabled:**
   ```bash
   export DOG_REPO=prisma
   export RECIPE_REPO=prisma
   export ORDER_REPO=prisma
   export ADDRESS_REPO=prisma
   export DATABASE_URL="postgres://user:pass@host:port/db"
   ```

2. **Backend server running** with all Prisma repos enabled:
   ```bash
   cd backend
   DATABASE_URL="..." \
   DOG_REPO=prisma \
   RECIPE_REPO=prisma \
   ORDER_REPO=prisma \
   ADDRESS_REPO=prisma \
   pnpm start:dev
   ```

3. **Database migrations applied:**
   ```bash
   cd backend
   DATABASE_URL="..." pnpm prisma migrate deploy
   ```

### Execution

**Run the comprehensive verification script:**
```bash
cd backend
DATABASE_URL="postgres://user:pass@127.0.0.1:5433/sevenkitchen" \
DOG_REPO=prisma \
RECIPE_REPO=prisma \
ORDER_REPO=prisma \
ADDRESS_REPO=prisma \
bash scripts/phase8_6_comprehensive_verify.sh
```

### Script Steps

1. **Health Check** - Verifies backend server is reachable
2. **Login** - Authenticates and captures JWT token
3. **Ensure Prerequisites** - Creates or verifies existence of:
   - At least 1 Dog
   - At least 1 Recipe
   - At least 1 Address
4. **Create Order** - Creates order and processes through lifecycle:
   - INIT (draft)
   - CONFIRM (PENDING_PAYMENT)
   - PAY (PAID)
5. **Capture IDs** - Captures all relevant IDs:
   - orderId
   - orderItemId
   - dogId
   - recipeId
   - addressId
6. **Fetch Order Detail** - Retrieves order and verifies cross-domain references
7. **Fetch Snapshot** - Retrieves order item recipe snapshot
8. **Assert Immutability** - Verifies snapshot values are preserved
9. **Restart Instructions** - Prints manual restart verification steps
10. **Re-fetch After Restart** - Re-authenticates and re-fetches order/snapshot
11. **Final PASS** - Prints verification summary

### Manual Restart Verification

The script pauses after Step 9 to allow manual server restart. Follow these steps:

1. **Stop the server** (Ctrl+C in the server terminal)

2. **Restart with all Prisma repos:**
   ```bash
   cd backend
   DATABASE_URL="postgres://user:pass@127.0.0.1:5433/sevenkitchen" \
   DOG_REPO=prisma \
   RECIPE_REPO=prisma \
   ORDER_REPO=prisma \
   ADDRESS_REPO=prisma \
   pnpm start:dev
   ```

3. **Press Enter** in the script terminal to continue

4. **Script verifies:**
   - Order still exists with status PAID
   - Order references correct Dog
   - Order references correct Address
   - Snapshot recipeId still matches
   - Snapshot values unchanged

---

## Acceptance Criteria

✅ **All Prisma repos enabled** - Script requires DOG_REPO, RECIPE_REPO, ORDER_REPO, ADDRESS_REPO all set to `prisma`

✅ **Cross-domain consistency** - Order references valid Dog, Recipe, Address

✅ **Restart persistence** - All entities persist after server restart

✅ **Snapshot immutability** - Snapshot values unchanged after restart

✅ **Customer isolation** - All queries scoped by customerId

✅ **Script completes** - All steps pass without errors

✅ **Manual restart verification** - Order and snapshot persist after manual restart

---

## Known Limitations

1. **Manual Restart Required** - The script pauses for manual server restart. This is intentional to verify true persistence (not just in-memory state).

2. **Single Customer** - Only tests with one customer (`mvp-user-001`). Does not verify cross-customer isolation in the same run.

3. **No Recipe Updates** - Does not verify that updating a Recipe does not affect existing snapshots (this would require a separate test).

4. **No Concurrent Access** - Does not test concurrent access or race conditions.

5. **No Error Scenarios** - Does not test error recovery or database failure scenarios.

6. **Token Expiration** - Script re-authenticates after restart, but does not handle token expiration during the run.

---

## Files

### Created
- `backend/scripts/phase8_6_comprehensive_verify.sh` - Comprehensive verification script

### Modified
- `backend/docs/ACCEPTANCE_STATUS.md` - Added Phase 8.6 entry

---

## Verification Checklist

Before marking Phase 8.6 as ACCEPTED, verify:

- [ ] Script runs end-to-end without errors
- [ ] All prerequisites (Dog, Recipe, Address) are created or found
- [ ] Order is created and processed through INIT -> CONFIRM -> PAY
- [ ] Cross-domain references are verified (Dog, Recipe, Address)
- [ ] Snapshot is fetched and recipeId matches
- [ ] Manual restart is performed
- [ ] After restart, order still exists with correct status
- [ ] After restart, cross-domain references still valid
- [ ] After restart, snapshot values unchanged
- [ ] Final PASS output is printed

---

## Next Steps

1. Run the comprehensive verification script
2. Complete manual restart verification
3. Verify all acceptance criteria are met
4. Update `ACCEPTANCE_STATUS.md` to mark Phase 8.6 as ACCEPTED
5. Document any issues or limitations discovered

---

## Notes

- **No Schema Changes** - This phase does not modify Prisma schema or migrations
- **No Domain Logic Changes** - This phase does not modify domain entities or services
- **No Controller Changes** - This phase does not modify API controllers
- **Scripts + Docs Only** - Only verification scripts and documentation are added
- **Assumes Correctness** - Assumes Prisma repositories from Phases 8.2B-8.5 are correct
