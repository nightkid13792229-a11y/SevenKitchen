# Recipe Designer Supplement Create Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow internal miniapp users to create supplement ingredients with usable nutrition profiles directly from the recipe designer add-ingredient drawer.

**Architecture:** Add a staff-protected recipe designer endpoint that creates a `SUPPLEMENT` ingredient, a manual supplement `NutritionFood`, and a primary `NutritionFoodMapping` in one transaction. Add a miniapp drawer form that is only shown to staff/admin users, requires at least one nutrition field, and then inserts the created option into the picker.

**Tech Stack:** NestJS, Prisma, Vue 3/UniApp, Vitest, Jest.

---

### Task 1: Backend Contract And Service

**Files:**
- Modify: `backend/src/interfaces/dto/recipe-designer/recipe-designer.dto.ts`
- Modify: `backend/src/application/recipe-designer/recipe-designer.service.ts`
- Modify: `backend/src/interfaces/controllers/recipe-designer.controller.ts`
- Test: `backend/tests/application/recipe-designer/recipe-designer.service.spec.ts`
- Test: `backend/tests/interfaces/controllers/recipe-designer.controller.spec.ts`

- [ ] Add DTO for supplement creation with `name`, optional `profileName`, `basisType`, and `nutrients`.
- [ ] Write failing service tests for creating a supplement option and rejecting empty nutrient data.
- [ ] Write failing controller test for delegating `POST /recipe-designer/supplement-options`.
- [ ] Implement a transaction that creates `Ingredient`, `NutritionFood`, and primary mapping.
- [ ] Include `FOOD` and `SUPPLEMENT` in recipe designer ingredient option listing.
- [ ] Run the targeted backend tests.

### Task 2: Miniapp API And Picker UI

**Files:**
- Modify: `miniapp/src/api/recipe-designer.ts`
- Modify: `miniapp/src/pages/recipe-designer/editor.vue`
- Test: `miniapp/src/api/recipe-designer.spec.ts`
- Test: `miniapp/src/pages/recipe-designer.regression.spec.ts`

- [ ] Add API types and `createSupplementOption`.
- [ ] Write failing API and regression tests for the internal supplement form.
- [ ] Add an internal-only entry in the ingredient picker.
- [ ] Add a compact supplement form with common nutrients first and full nutrient groups available.
- [ ] Require supplement name and at least one positive nutrition value before submit.
- [ ] On success, select the new supplement option and keep the user in the existing add flow.
- [ ] Run the targeted miniapp tests.

### Task 3: Verification

**Files:**
- Build output: `miniapp/dist/dev/mp-weixin`

- [ ] Run backend targeted recipe designer tests.
- [ ] Run miniapp targeted tests.
- [ ] Run broader miniapp tests.
- [ ] Build miniapp to the WeChat DevTools directory with `pnpm run dev:mp-weixin`, wait for `DONE Build complete`, and stop the watcher.
