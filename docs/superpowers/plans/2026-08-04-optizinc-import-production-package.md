# L-OptiZinc Production Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a reviewable, rollback-capable production import package for NOW Foods L-OptiZinc 30mg without including unrelated schema migrations.

**Architecture:** The production package generator receives audited Prisma rows and emits scoped SQL. Decimal-like Prisma values are converted to SQL numerics before generic object serialization. The L-OptiZinc directory stores evidence-backed manifest, audit and generated production SQL as versioned release artifacts.

**Tech Stack:** NestJS, TypeScript, Jest, Prisma/PostgreSQL SQL, JSON and Markdown audit artifacts.

---

### Task 1: Protect Decimal serialization in the production package generator

**Files:**

- Modify: `backend/tests/application/standard-ingredient-import/production-package.spec.ts`
- Modify: `backend/src/application/standard-ingredient-import/production-package.ts`

- [ ] **Step 1: Write the failing Decimal-like regression test**

Add a package row whose `currentPricePerPurchaseUnit` is `{ toJSON: () => '0' }`. Assert its generated `up.sql` contains the price column but not the quoted JSON value `'"0"'`.

- [ ] **Step 2: Run the focused test and confirm the expected failure**

Run: `npm test -- production-package.spec.ts --runInBand`

Expected: FAIL because Decimal-like values use generic object JSON serialization.

- [ ] **Step 3: Implement the minimal numeric conversion**

In `sqlLiteral`, before boolean/date/object handling, recognize objects exposing `toJSON()`. Accept finite numbers or non-empty strings convertible to finite numbers; write the normalized number without SQL quotes. For other `toJSON()` results, write `NULL`.

- [ ] **Step 4: Re-run the focused test**

Run: `npm test -- production-package.spec.ts --runInBand`

Expected: PASS.

- [ ] **Step 5: Commit the focused fix**

Run: `git add backend/src/application/standard-ingredient-import/production-package.ts backend/tests/application/standard-ingredient-import/production-package.spec.ts && git commit -m "fix: serialize Decimal values in ingredient packages"`

### Task 2: Add the reviewed L-OptiZinc import artifacts

**Files:**

- Create: `.standard-ingredient-import/2026-07-28-now-l-optizinc-30mg/alignment.json`
- Create: `.standard-ingredient-import/2026-07-28-now-l-optizinc-30mg/ingredient.audit.json`
- Create: `.standard-ingredient-import/2026-07-28-now-l-optizinc-30mg/ingredient.local-apply.json`
- Create: `.standard-ingredient-import/2026-07-28-now-l-optizinc-30mg/ingredient.manifest.json`
- Create: `.standard-ingredient-import/2026-07-28-now-l-optizinc-30mg/production-package/{manifest.json,review-summary.md,source-audit.json,unit-audit.json,up.sql,down.sql}`

- [ ] **Step 1: Add the existing audited package artifacts without modification**

Move the reviewed files from the root working tree into the same paths in this isolated worktree. Do not add either unrelated migration directory.

- [ ] **Step 2: Verify package boundaries and nutrition values**

Run: `jq -e '.ingredient.type == "SUPPLEMENT" and .supplementLabel.activeNutrients.zincMg == 30 and .supplementLabel.activeNutrients.copperMg == 0.3' .standard-ingredient-import/2026-07-28-now-l-optizinc-30mg/ingredient.manifest.json`

Expected: the manifest identifies a SUPPLEMENT with zinc 30 mg and copper 0.3 mg.

- [ ] **Step 3: Verify SQL and rollback coverage**

Run: `rg -n "INSERT INTO (ingredient|nutrition_food|nutrition_food_mapping)|DELETE FROM (nutrition_food_mapping|nutrition_food|ingredient)" .standard-ingredient-import/2026-07-28-now-l-optizinc-30mg/production-package/{up,down}.sql`

Expected: SQL inserts only the three intended tables and rollback deletes them in reverse dependency order.

- [ ] **Step 4: Commit the audited artifacts**

Run: `git add .standard-ingredient-import/2026-07-28-now-l-optizinc-30mg && git commit -m "data: add L-OptiZinc production import package"`

### Task 3: Final verification and integration preparation

**Files:**

- Verify only: the files from Tasks 1–2

- [ ] **Step 1: Run the focused backend test suite**

Run: `npm test -- production-package.spec.ts --runInBand`

Expected: PASS.

- [ ] **Step 2: Review the change boundary**

Run: `git diff origin/main...HEAD --name-only`

Expected: the Decimal generator/test, L-OptiZinc artifacts and approved design/plan documentation only; no files in either excluded Prisma migration directory.

- [ ] **Step 3: Push the isolated branch and create a PR**

Run: `git push -u origin codex/import-optizinc-decimal`

Then create a PR from `codex/import-optizinc-decimal` to `main` with the test result recorded in the PR body.
