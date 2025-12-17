# E2E Verification Logs and Archival

This directory contains end-to-end (E2E) verification logs and documentation for Phase 8.12+8.13 (Kitchen Task & Inventory Deduction).

## Generating E2E Logs

### Prerequisites

1. **Database Setup:**
   - PostgreSQL database running and accessible via `DATABASE_URL`
   - All migrations applied: `cd backend && pnpm prisma migrate deploy`

2. **Backend Server:**
   - Backend server running: `cd backend && pnpm start:dev`
   - Server accessible at `http://127.0.0.1:3000` (or set `BASE_URL`)

3. **Test Data:**
   - At least one Dog, Recipe, and Address exist in the database
   - Or use the E2E script's auto-creation feature (creates if missing)

### Running E2E Script

#### Standard Mode (Manual Cleanup)

```bash
cd backend
/bin/bash scripts/phase8_12_13_kitchen_inventory_e2e_verify.sh > ../docs/e2e/phase8_12_13_e2e_$(date +%Y%m%d_%H%M%S).log 2>&1
```

**Note:** If you encounter "No eligible OrderItems found", you need to manually clean up:

```sql
-- Clean allocation locks and production data
UPDATE order_item SET production_batch_id = NULL, allocated_at = NULL WHERE production_batch_id IS NOT NULL;
DELETE FROM packaging_unit;
DELETE FROM production_batch;
DELETE FROM inventory_ledger_entry;
```

#### Auto-Cleanup Mode (Development Only)

**⚠️ WARNING: This will delete local development data!**

```bash
cd backend
E2E_FORCE_FRESH_DEDUCTION=1 /bin/bash scripts/phase8_12_13_kitchen_inventory_e2e_verify.sh > ../docs/e2e/phase8_12_13_e2e_$(date +%Y%m%d_%H%M%S).log 2>&1
```

This mode automatically executes the cleanup SQL before creating a production batch, ensuring a fresh start for each run.

### Environment Variables

- `BASE_URL`: Backend server URL (default: `http://127.0.0.1:3000`)
- `E2E_FORCE_FRESH_DEDUCTION=1`: Enable auto-cleanup mode (development only)

### Log File Naming Convention

Log files are named: `phase8_12_13_e2e_YYYYMMDD_HHMMSS.log`

Example: `phase8_12_13_e2e_20251217_143022.log`

### Extracting Key Information from Logs

The E2E script outputs a summary at the end:

```
E2E Summary:
  - Batch ID: <batchId>
  - Task ID: <taskId>
  - Deduction Completed: YES / YES (already deducted) / NO
  - Ledger Entries Created: <count>
  - Idempotency Test: YES / NO
```

You can extract these values using:

```bash
# Extract Batch ID
grep "Batch ID:" phase8_12_13_e2e_*.log | tail -1

# Extract Task ID
grep "Task ID:" phase8_12_13_e2e_*.log | tail -1

# Extract Deduction Status
grep "Deduction Completed:" phase8_12_13_e2e_*.log | tail -1

# Extract Ledger Entries
grep "Ledger Entries Created:" phase8_12_13_e2e_*.log | tail -1
```

## Archival Process

1. **Run E2E Script:**
   ```bash
   cd backend
   /bin/bash scripts/phase8_12_13_kitchen_inventory_e2e_verify.sh > ../docs/e2e/phase8_12_13_e2e_$(date +%Y%m%d_%H%M%S).log 2>&1
   ```

2. **Verify Log Contains:**
   - All steps (1-10) show `✓ Success`
   - Final summary with Batch ID, Task ID, Deduction status
   - No errors or failures

3. **Update ACCEPTANCE_STATUS.md:**
   - Reference the log file location
   - Extract and document key IDs (batchId, taskId) as examples
   - Note the PASS date

4. **Commit to Git:**
   ```bash
   git add docs/e2e/phase8_12_13_e2e_*.log
   git commit -m "docs: archive Phase 8.12+8.13 E2E verification log"
   ```

## Notes

- **Idempotency:** The script may show "Ledger Entries Created: 0" if inventory was already deducted in a previous run. This is expected and indicates successful idempotency.
- **macOS Compatibility:** The script is tested on macOS bash 3.2 and uses cross-platform commands.
- **Database Safety:** Auto-cleanup mode (`E2E_FORCE_FRESH_DEDUCTION=1`) should only be used in development environments, never in production.
