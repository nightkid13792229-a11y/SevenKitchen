# Recipe Designer Ingredient Picker UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the recipe designer ingredient picker so staff can search standard ingredients naturally, see immediate results, and choose nutrition profiles using Chinese-facing labels.

**Architecture:** Keep the current backend endpoint and mobile picker. Add a small deterministic alias expansion and profile display-name helper in `RecipeDesignerService`; keep raw USDA/NZFCD names in `nameEn` while returning Chinese display labels in `name`. Simplify the mobile picker by removing the search button and internal single/multi-profile badge, using a debounced watcher for live search.

**Tech Stack:** NestJS, Prisma, Vue 3 uni-app, Vitest, Jest.

---

### Task 1: Backend Search And Display Labels

**Files:**
- Modify: `backend/src/application/recipe-designer/recipe-designer.service.ts`
- Test: `backend/tests/application/recipe-designer/recipe-designer.service.spec.ts`

- [ ] **Step 1: Write failing backend tests**

Cover `西蓝花` expanding to `西兰花` and verified nutrition profiles returning Chinese labels such as `青口贝肉（生）`.

- [ ] **Step 2: Run focused backend tests**

Run: `npm test -- --runInBand tests/application/recipe-designer/recipe-designer.service.spec.ts`

Expected before implementation: FAIL because search aliases and Chinese profile labels do not exist yet.

- [ ] **Step 3: Implement alias and profile label helpers**

Add helper functions near `RecipeDesignerService` to expand common ingredient terms and derive Chinese profile labels from mapped ingredient names plus preparation descriptors.

- [ ] **Step 4: Re-run focused backend tests**

Expected after implementation: PASS.

### Task 2: Mobile Live Search And Cleaner Picker

**Files:**
- Modify: `miniapp/src/pages/recipe-designer/editor.vue`
- Test: `miniapp/src/pages/recipe-designer.regression.spec.ts`

- [ ] **Step 1: Write failing miniapp regression assertions**

Assert that the picker has no visible search button or `food-badge`, still shows nutrition profile switching, and uses a watcher/debounce for live search.

- [ ] **Step 2: Run focused miniapp tests**

Run: `npm test -- src/pages/recipe-designer.regression.spec.ts`

Expected before implementation: FAIL because the search button and profile badge are still present.

- [ ] **Step 3: Implement mobile UI changes**

Remove the search button and badge markup/styles. Add an input watcher with a short timeout to reload results after typing changes.

- [ ] **Step 4: Re-run focused miniapp tests**

Expected after implementation: PASS.

### Task 3: Verification And Build

**Files:**
- No new source files.

- [ ] **Step 1: Run focused backend tests**

Run: `cd backend && npm test -- --runInBand tests/application/recipe-designer/recipe-designer.service.spec.ts`

- [ ] **Step 2: Run focused miniapp tests**

Run: `cd miniapp && npm test -- src/pages/recipe-designer.regression.spec.ts src/api/recipe-designer.spec.ts`

- [ ] **Step 3: Build miniapp dev and production outputs**

Run: `cd miniapp && npm run build:mp-weixin && npm run dev:mp-weixin`

- [ ] **Step 4: Confirm compiled dev output no longer contains old strings**

Run: `rg -n "搜索</button>|food-badge|单档案|多档案|Fish, salmon" miniapp/dist/dev/mp-weixin/pages/recipe-designer`

Expected: no user-facing old picker strings.
