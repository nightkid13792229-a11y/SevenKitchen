# CFCT Intermediate Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the local private CFCT intermediate nutrition source library and add a coverage audit so future ingredient profile work uses complete CFCT evidence.

**Architecture:** Keep the existing OCR and structuring scripts as the data producer. Add a small pure audit module and CLI script that summarize coverage by CFCT `foodCode` and highlight no-code special table rows for manual review. Produce reports only; do not write formal nutrition profiles.

**Tech Stack:** TypeScript, Jest, existing Nest backend workspace, existing CFCT OCR scripts, local JSON/CSV report files.

---

### Task 1: Add CFCT Coverage Audit Domain

**Files:**
- Create: `backend/src/domain/nutrition-governance/cfct-intermediate-library-audit.ts`
- Create: `backend/tests/domain/nutrition-governance/cfct-intermediate-library-audit.spec.ts`

- [ ] **Step 1: Write failing tests**

Create tests for:
- grouping rows by `volume + foodCode`
- counting nutrient group coverage
- preserving no-food-code review rows
- counting quality flags

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand tests/domain/nutrition-governance/cfct-intermediate-library-audit.spec.ts`

Expected: fail because the module does not exist yet.

- [ ] **Step 3: Implement audit module**

Implement a pure function:

```ts
buildCfctIntermediateLibraryAudit(rows)
```

It returns:
- `summary`
- `foodCodeRows`
- `noFoodCodeRows`

- [ ] **Step 4: Run focused tests**

Run: `npm test -- --runInBand tests/domain/nutrition-governance/cfct-intermediate-library-audit.spec.ts`

Expected: pass.

### Task 2: Add Report Export Script

**Files:**
- Create: `backend/scripts/audit-cfct-intermediate-library.ts`
- Modify: `backend/package.json`

- [ ] **Step 1: Write script-level test or rely on pure-module coverage**

The script is a thin file IO wrapper around the tested audit module.

- [ ] **Step 2: Implement CLI**

Inputs:
- `--input reports/cfct-full/cfct-v6-full-structured.json`
- `--output-dir reports/cfct-full`

Outputs:
- `cfct-v6-full-coverage-summary.json`
- `cfct-v6-full-coverage-food-codes.csv`
- `cfct-v6-full-coverage-no-food-code.csv`

- [ ] **Step 3: Run focused tests**

Run the same focused Jest test and a dry report command on a small local fixture if full source is not present.

### Task 3: Rebuild CFCT Full Structured Library

**Files:**
- Output only under `backend/reports/cfct-full/`

- [ ] **Step 1: Confirm batch plan**

Run: `npm run structure:cfct-full -- --only-plan --chunk-size 30`

Expected: 29 batches across the two local CFCT v6 volumes.

- [ ] **Step 2: Run full structure generation**

Run: `npm run structure:cfct-full -- --chunk-size 30`

Expected: full structured JSON, auto-ready JSON, needs-review JSON, summary JSON, and CSV report are generated.

- [ ] **Step 3: Run coverage audit**

Run: `npm run audit:cfct-intermediate-library -- --input reports/cfct-full/cfct-v6-full-structured.json --output-dir reports/cfct-full`

Expected: summary and CSV coverage reports are generated.

### Task 4: Validate Known Gap Inputs

**Files:**
- Output only under `backend/reports/cfct-full/`

- [ ] **Step 1: Inspect `019008` coverage**

Confirm `薏米［薏仁米,苡米］` appears in the coverage CSV and record which nutrient groups are present.

- [ ] **Step 2: Re-run CFCT gap dry-run**

Run existing dry-run candidate planner after full source generation.

- [ ] **Step 3: Health check backend**

Run: `curl http://127.0.0.1:3011/api/v1/health`

Expected: `{"status":"ok",...}`.
