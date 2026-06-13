# Food Ratio Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure official recipe FOOD ratios represent the main-food composition and always sum to 100%, while legacy recipes are safely normalized during pricing and DIY sheet generation.

**Architecture:** Add a small domain helper for FOOD ratio totals and normalization. Use it in recipe publishing and pricing, then provide an auditable production repair script for existing PUBLIC recipes. Keep supplement targets separate from FOOD ratios.

**Tech Stack:** NestJS backend, Prisma, Jest, TypeScript.

---

### Task 1: Domain Ratio Helper

**Files:**
- Create: `backend/src/domain/recipe/food-ratio-normalization.ts`
- Test: `backend/tests/domain/recipe/food-ratio-normalization.spec.ts`

- [ ] Write tests for summing FOOD ratios, normalizing partial totals to 100, and leaving invalid ratios at zero.
- [ ] Implement `sumFoodRatioPercent`, `normalizeFoodRatioPercent`, and `isFoodRatioTotalNormalized`.
- [ ] Run `npm test -- tests/domain/recipe/food-ratio-normalization.spec.ts --runInBand`.

### Task 2: Pricing Runtime Guard

**Files:**
- Modify: `backend/src/domain/pricing/pricing.service.ts`
- Test: `backend/tests/domain/pricing/food-ratio-normalization.spec.ts`

- [ ] Write a failing pricing test where FOOD ratios sum to `99.33161953727506` and total net food weight is `2000g`; expected FOOD net amounts sum to `2kg`.
- [ ] Use the helper in FOOD item pricing so each item uses `ratioPercent / foodRatioTotal`.
- [ ] Run `npm test -- tests/domain/pricing/food-ratio-normalization.spec.ts --runInBand`.

### Task 3: Recipe Publish Guard

**Files:**
- Modify: `backend/src/application/recipe-designer/recipe-designer.service.ts`
- Test: `backend/tests/application/recipe-designer/recipe-publish-food-ratio.spec.ts`

- [ ] Write a failing test proving a design recipe with `193.2g` FOOD and `1.3g` gram-based supplement publishes FOOD ratios summing to 100.
- [ ] Compute published FOOD ratios from FOOD effective weights only.
- [ ] Run `npm test -- tests/application/recipe-designer/recipe-publish-food-ratio.spec.ts --runInBand`.

### Task 4: Production Audit And Repair Script

**Files:**
- Create: `backend/scripts/audit-food-ratio-totals.ts`
- Create: `backend/scripts/repair-food-ratio-totals.ts`
- Modify: `backend/package.json`

- [ ] Add a read-only audit that lists PUBLIC recipes whose FOOD ratio total is outside tolerance.
- [ ] Add a dry-run-by-default repair script that scales FOOD ratios by `100 / currentFoodRatioTotal`.
- [ ] Add package scripts `audit:food-ratio-totals` and `repair:food-ratio-totals`.

### Task 5: Verification

- [ ] Run targeted backend tests for the new helper, pricing guard, publish guard, and existing DIY sheet storage.
- [ ] Run `npx prisma validate --schema prisma/schema.prisma`.
- [ ] Run `npm run build` in `backend`.
- [ ] Report production follow-up: run audit first, then repair with `--apply`, then re-run audit.
