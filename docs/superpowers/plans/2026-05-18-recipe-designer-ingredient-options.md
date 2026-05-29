# Recipe Designer Ingredient Options Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the mobile recipe designer show standard ingredients first while preserving exact nutrition-profile selection for calculation.

**Architecture:** Add a recipe-designer-specific backend query that returns FOOD ingredients with verified mapped nutrition profiles. The miniapp picker consumes that grouped shape, defaults to the primary mapped profile, and lets staff switch profiles before adding the item.

**Tech Stack:** NestJS, Prisma, Jest, uni-app Vue 3, Vitest.

---

### Task 1: Backend Ingredient Options

**Files:**
- Modify: `backend/src/application/recipe-designer/recipe-designer.service.ts`
- Modify: `backend/src/interfaces/controllers/recipe-designer.controller.ts`
- Modify: `backend/src/interfaces/dto/recipe-designer/recipe-designer.dto.ts`
- Test: `backend/tests/application/recipe-designer/recipe-designer.service.spec.ts`
- Test: `backend/tests/interfaces/controllers/recipe-designer.controller.spec.ts`

- [ ] Add failing tests for listing FOOD ingredients that have verified mapped nutrition profiles.
- [ ] Implement `listIngredientOptions` with search, pagination, primary-profile defaulting, and profile sorting.
- [ ] Expose `GET /api/v1/recipe-designer/ingredient-options`.
- [ ] Run focused backend tests.

### Task 2: Miniapp Picker

**Files:**
- Modify: `miniapp/src/api/recipe-designer.ts`
- Modify: `miniapp/src/pages/recipe-designer/editor.vue`
- Test: `miniapp/src/api/recipe-designer.spec.ts`
- Test: `miniapp/src/pages/recipe-designer.regression.spec.ts`

- [ ] Add failing API and regression tests for `listIngredientOptions`, standard ingredient labels, and nutrition profile switching.
- [ ] Replace nutrition-food flat list state with ingredient option state.
- [ ] Keep `addItem` payload as `nutritionFoodId` from the selected profile.
- [ ] Run focused miniapp tests.

### Task 3: Verification

- [ ] Run backend focused tests.
- [ ] Run miniapp focused tests.
- [ ] Run miniapp full tests.
- [ ] Run `npm run build:mp-weixin`.
- [ ] Run backend build.
