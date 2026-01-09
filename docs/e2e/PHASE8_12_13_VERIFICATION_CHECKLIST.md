# Phase 8.12+8.13 Final Verification Checklist

This checklist ensures all acceptance criteria are met and documentation is complete.

## Prerequisites

- [ ] PostgreSQL database running and accessible
- [ ] All migrations applied: `cd backend && pnpm prisma migrate deploy`
- [ ] Backend server running: `cd backend && pnpm start:dev`
- [ ] At least one Dog, Recipe, and Address exist (or will be auto-created by script)

## Verification Steps

### Step 1: Run E2E Script (Standard Mode)

```bash
cd backend
/bin/bash scripts/phase8_12_13_kitchen_inventory_e2e_verify.sh > ../docs/e2e/phase8_12_13_e2e_$(date +%Y%m%d_%H%M%S).log 2>&1
```

**Expected Output:**
- All steps (1-10) show `✓ Success`
- Step 7a: `✓ Task updated to IN_PROGRESS`
- Step 7b: `✓ Task updated to COMPLETED with actual usage`
- Step 8: May show "No new entries created (may already be deducted - idempotent)" - this is expected
- Final summary shows:
  - Batch ID: `<uuid>`
  - Task ID: `<uuid>`
  - Deduction Completed: YES / YES (already deducted)
  - Ledger Entries Created: `<number>` (may be 0 if already deducted)
  - Idempotency Test: YES

### Step 2: Verify Auto-Cleanup Mode (Optional)

```bash
cd backend
E2E_FORCE_FRESH_DEDUCTION=1 /bin/bash scripts/phase8_12_13_kitchen_inventory_e2e_verify.sh
```

**Expected Behavior:**
- Script shows 5-second warning before cleanup
- Cleanup SQL executes successfully
- Script continues with batch creation

### Step 3: Extract Key Information from Log

```bash
cd docs/e2e
# Extract Batch ID
grep "Batch ID:" phase8_12_13_e2e_*.log | tail -1

# Extract Task ID
grep "Task ID:" phase8_12_13_e2e_*.log | tail -1

# Extract Deduction Status
grep "Deduction Completed:" phase8_12_13_e2e_*.log | tail -1

# Extract Ledger Entries
grep "Ledger Entries Created:" phase8_12_13_e2e_*.log | tail -1
```

### Step 4: Verify Documentation

- [ ] `docs/e2e/README.md` exists and contains:
  - Instructions for generating E2E logs
  - Environment variable documentation
  - Log file naming convention
  - Archival process

- [ ] `backend/docs/ACCEPTANCE_STATUS.md` updated with:
  - Phase 8.12: Reference to `docs/e2e/` for verification logs
  - Phase 8.13: Idempotency acceptance criteria documented

### Step 5: Verify Script Functionality

- [ ] Script syntax check passes: `bash -n scripts/phase8_12_13_kitchen_inventory_e2e_verify.sh`
- [ ] macOS bash compatibility: `/bin/bash -n scripts/phase8_12_13_kitchen_inventory_e2e_verify.sh`
- [ ] All `local` declarations are inside functions
- [ ] No backslash-space issues in curl commands

### Step 6: Verify Unit Tests

```bash
cd backend
pnpm test -- staff-kitchen.controller.spec kitchen.service.spec inventory.service.spec
```

**Expected:** All tests pass (29+ tests)

### Step 7: Verify Build

```bash
cd backend
pnpm run build
```

**Expected:** Build succeeds with no TypeScript errors

## Acceptance Criteria

- [x] E2E script passes all steps (1-10) on macOS bash 3.2
- [x] Two-stage status transition works (PENDING -> IN_PROGRESS -> COMPLETED)
- [x] Inventory deduction is idempotent (0 entries = already deducted, expected)
- [x] Documentation is complete and accessible
- [x] Script supports optional auto-cleanup mode
- [x] All tests pass
- [x] Build succeeds

## Notes

- **Idempotency:** If inventory was already deducted in a previous run, Step 8 may show "Ledger Entries Created: 0". This is expected and indicates successful idempotency.
- **Auto-Cleanup:** `E2E_FORCE_FRESH_DEDUCTION=1` should only be used in development environments, never in production.
- **Log Archival:** E2E logs should be committed to `docs/e2e/` for traceability.

