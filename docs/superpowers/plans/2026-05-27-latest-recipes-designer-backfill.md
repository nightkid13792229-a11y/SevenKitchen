# Latest Recipes Designer Backfill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a guarded script that backfills one published recipe designer source draft for the latest version of each existing recipe.

**Architecture:** Keep migration behavior in a script-local pure planning layer plus a small Prisma runner. The planner selects latest versions, validates blocking item issues, and returns dry-run/apply counters; the runner performs one transaction per eligible recipe and skips records already backfilled. In a production-data local mirror, overlay reviewed local nutrition master data first so old production recipe items can resolve `NutritionFood` through current `NutritionFoodMapping`.

**Tech Stack:** TypeScript, Prisma Client, Jest, existing backend npm scripts.

---

### Task 1: Script Contract Tests

**Files:**
- Create: `backend/tests/scripts/backfill-latest-recipes-to-designer.spec.ts`
- Create: `backend/scripts/backfill-latest-recipes-to-designer.ts`
- Modify: `backend/package.json`

- [x] **Step 1: Write failing tests**

Cover latest-version selection, dry-run no writes, apply writes design draft/items/snapshot, existing draft skip, and invalid item reporting.

- [x] **Step 2: Run failing tests**

Run:

```bash
npm test -- backfill-latest-recipes-to-designer.spec.ts --runInBand
```

Expected failure: module or exported functions are missing.

- [x] **Step 3: Implement minimal script**

Create exports:
- `selectLatestRecipeVersions`
- `buildLatestRecipeDesignerBackfillPlan`
- `runLatestRecipeDesignerBackfill`
- `parseLatestRecipeDesignerBackfillArgs`

The CLI must default to dry-run and only write when `--apply` is present.

- [x] **Step 4: Run tests green**

Run:

```bash
npm test -- backfill-latest-recipes-to-designer.spec.ts --runInBand
```

Expected: all tests pass.

### Task 2: Build Verification

**Files:**
- Verify: `backend/scripts/backfill-latest-recipes-to-designer.ts`
- Verify: `backend/package.json`

- [x] **Step 1: Run targeted script tests**

```bash
npm test -- backfill-latest-recipes-to-designer.spec.ts --runInBand
```

- [x] **Step 2: Run backend build**

```bash
npm run build
```

Observed: Prisma generation passed, then Nest build failed on unrelated experimental feature type errors that were removed later.

### Task 3: Operator Notes

**Files:**
- Update: final response and `docs/superpowers/specs/2026-05-27-latest-recipes-designer-backfill-design.md`

- [x] **Step 1: Report dry-run/apply commands**

Include commands for local mirror dry-run, local mirror apply, and production dry-run/apply.

- [x] **Step 2: Report safeguards**

Mention that the script does not delete recipes, skips already backfilled latest versions, and requires explicit `--apply`.

### Task 4: Local Production Mirror Execution

**Files/Data:**
- Local DB: `sevenkitchen_prod_mirror_20260527`
- Backup: `tmp/prod-mirror/before-local-nutrition-overlay-20260527.dump`
- Overlay: `tmp/prod-mirror/local-nutrition-master-overlay-20260527.dump`

- [x] **Step 1: Overlay local nutrition master data**

Copied reviewed local `nutrition_food`, mappings, source records, supplement drafts, and FEDIAF standard tables into the local production mirror.

- [x] **Step 2: Dry-run latest recipe backfill**

Result after overlay: scanned 26, eligible 26, blocked 0.

- [x] **Step 3: Apply latest recipe backfill to local mirror**

Result: scanned 26, eligible 26, applied 26, skipped 0, blocked 0, errors 0.

- [x] **Step 4: Verify idempotency and counts**

Verified 26 backfilled `DesignRecipe` rows, 26 publish snapshots, 415 design items, 0 missing design item nutrition food IDs, and a repeat dry-run skips all 26.
