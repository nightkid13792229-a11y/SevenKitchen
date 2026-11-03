# Release Candidate Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the current dirty release-candidate state from "cannot verify" to "validated enough to decide on production deployment."

**Architecture:** Fix the minimum number of release blockers in place on the release-candidate branch, then rerun the repo's existing build, test, and deploy preflight commands. Treat release safety checks as product code: when a verification script is broken, repair it before trusting deployment output.

**Tech Stack:** NestJS, Prisma, Jest, Vue/Vite, Uni App, shell deployment scripts

---

### Task 1: Unblock backend analytics compilation

**Files:**
- Modify: `backend/tests/application/analytics/dog-profile-analytics.service.spec.ts`
- Modify: `backend/src/application/analytics/dog-profile-analytics.service.ts`

- [ ] **Step 1: Add a failing test for nullable JSON analytics properties**

Run: `cd /Users/zhaochen/Documents/SevenKitchen/backend && npm test -- --runTestsByPath tests/application/analytics/dog-profile-analytics.service.spec.ts`
Expected: fail before the fix because the analytics write path still treats nullable JSON as raw `null`.

- [ ] **Step 2: Implement the minimal Prisma JSON-null normalization**

Update the analytics service so nullable `properties` are passed using Prisma's JSON-null sentinel instead of raw `null`.

- [ ] **Step 3: Re-run the focused backend test and the backend build**

Run: `cd /Users/zhaochen/Documents/SevenKitchen/backend && npm test -- --runTestsByPath tests/application/analytics/dog-profile-analytics.service.spec.ts`
Expected: pass.

Run: `cd /Users/zhaochen/Documents/SevenKitchen/backend && npm run build`
Expected: pass.

### Task 2: Repair deployment preflight drift detection

**Files:**
- Modify: `backend/scripts/pre-deploy-check.sh`
- Modify: `backend/scripts/deploy_lighthouse.sh`

- [ ] **Step 1: Reproduce the current preflight failure**

Run: `cd /Users/zhaochen/Documents/SevenKitchen/backend && bash scripts/pre-deploy-check.sh`
Expected: fail because Prisma now requires explicit shadow database handling for `migrate diff`.

- [ ] **Step 2: Replace the fragile drift probe with a deterministic migration status check**

Update both scripts so deployment fails closed when migration status cannot be verified, instead of swallowing CLI errors and reporting a false green state.

- [ ] **Step 3: Re-run the preflight script**

Run: `cd /Users/zhaochen/Documents/SevenKitchen/backend && bash scripts/pre-deploy-check.sh`
Expected: either a clean success or an actionable migration-status failure, but never a silent false pass.

### Task 3: Restore miniapp verification entry points

**Files:**
- Modify: `miniapp/package.json` if needed
- Modify: `miniapp/pnpm-lock.yaml` or `miniapp/package-lock.json` only if dependency repair is required

- [ ] **Step 1: Reproduce the missing test runner**

Run: `cd /Users/zhaochen/Documents/SevenKitchen/miniapp && npm test`
Expected: fail if `vitest` is missing from the local install state.

- [ ] **Step 2: Repair the local dependency state with the minimum necessary change**

Prefer restoring the existing dependency install state over changing application code.

- [ ] **Step 3: Re-run miniapp test and production build**

Run: `cd /Users/zhaochen/Documents/SevenKitchen/miniapp && npm test`
Expected: pass.

Run: `cd /Users/zhaochen/Documents/SevenKitchen/miniapp && npm run build:mp-weixin`
Expected: pass.

### Task 4: Full release validation and deployment decision

**Files:**
- Verify only: `backend/`, `admin-web/`, `miniapp/`, backend remote deployment scripts

- [ ] **Step 1: Re-run all release checks**

Run:
- `cd /Users/zhaochen/Documents/SevenKitchen/backend && npm test`
- `cd /Users/zhaochen/Documents/SevenKitchen/backend && npm run build`
- `cd /Users/zhaochen/Documents/SevenKitchen/admin-web && npm run build`
- `cd /Users/zhaochen/Documents/SevenKitchen/miniapp && npm test`
- `cd /Users/zhaochen/Documents/SevenKitchen/miniapp && npm run build:mp-weixin`
- `cd /Users/zhaochen/Documents/SevenKitchen/backend && bash scripts/pre-deploy-check.sh`
- `cd /Users/zhaochen/Documents/SevenKitchen && bash -n backend/scripts/remote_deploy_v2.sh`
- `cd /Users/zhaochen/Documents/SevenKitchen && bash -n deploy-admin-web.sh`

Expected: all checks pass, and deployment scripts parse cleanly. The root `deploy.sh` wrapper has been removed; use the explicit deployment commands only.

- [ ] **Step 2: Summarize release readiness**

Record which checks passed, which risks remain, and whether it is safe to deploy with the explicit commands:
- Backend production: `cd /Users/zhaochen/Documents/SevenKitchen && bash backend/scripts/remote_deploy_v2.sh`
- Admin web production: `cd /Users/zhaochen/Documents/SevenKitchen && bash deploy-admin-web.sh`
- Miniapp production build: `cd /Users/zhaochen/Documents/SevenKitchen/miniapp && npm run build:mp-weixin`
