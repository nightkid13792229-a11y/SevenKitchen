# Nutrition Profile Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make approved nutrition profiles the shared source for ingredient editing, recipe editing, and recipe upload flows.

**Architecture:** `NutritionFood` and `NutritionFoodMapping` become the editable nutrition profile layer. `Ingredient.nutritionProfile` remains a compatibility cache for the current primary mapped profile. Existing recipe item `nutritionFoodId` stays the calculation key; if an item omits it, backend defaults to the mapped primary profile.

**Tech Stack:** NestJS, Prisma, Vue 3, Element Plus, static Node tests, Jest service tests.

---

### Task 1: Expose Full Mapped Nutrition Profiles

**Files:**
- Modify: `backend/src/interfaces/controllers/admin.controller.ts`
- Modify: `admin-web/src/types/ingredient.ts`
- Test: `admin-web/tests/ingredientManagementCenter.test.js`

- [ ] Write a failing static test requiring mapped nutrition foods to expose `nutritionData`, `ediblePortionLabel`, and `processingLabel`.
- [ ] Update the admin ingredient response mapper to include those fields.
- [ ] Update `NutritionFoodReference` so frontend code can render and edit mapped profile data.

### Task 2: Update Mapped Profile And Primary Mapping

**Files:**
- Modify: `backend/src/interfaces/dto/nutrition-food/nutrition-food.dto.ts`
- Modify: `backend/src/application/nutrition-food/nutrition-food.service.ts`
- Modify: `backend/src/interfaces/controllers/nutrition-food.controller.ts`
- Test: `backend/tests/application/nutrition-food/nutrition-food.service.spec.ts`

- [ ] Write failing Jest tests for updating a primary nutrition food and setting one mapping as primary.
- [ ] Add `UpdateNutritionFoodMappingDto`.
- [ ] When a nutrition food is updated, refresh `Ingredient.nutritionProfile` for ingredients where that food is primary.
- [ ] Add `updateMapping()` so `PATCH /nutrition-foods/:id/mappings/:ingredientId` can set `isPrimary`, `yieldRate`, and `notes`.
- [ ] When a mapping becomes primary, demote the old primary and copy that food's `nutritionData` into `Ingredient.nutritionProfile`.

### Task 3: Replace Single-Profile Ingredient Editor With Profile Manager

**Files:**
- Modify: `admin-web/src/api/ingredients.ts`
- Modify: `admin-web/src/views/Ingredients/components/IngredientNutritionDialog.vue`
- Test: `admin-web/tests/ingredientManagementCenter.test.js`

- [ ] Write a failing static test requiring the ingredient dialog to render `营养档案管理器`, profile cards, `设为主档案`, `编辑档案数据`, and `nutritionFoodApi.updateMapping`.
- [ ] Add a small `nutritionFoodApi` wrapper for `PATCH /nutrition-foods/:id` and `PATCH /nutrition-foods/:id/mappings/:ingredientId`.
- [ ] Render all mapped profiles in the dialog.
- [ ] Selecting a profile loads its `nutritionData` into `IngredientNutritionEditor`.
- [ ] Saving updates the selected `NutritionFood`, not only `Ingredient.nutritionProfile`.
- [ ] Setting a profile as primary updates mapping state and refreshes the ingredient list.

### Task 4: Clarify Recipe Nutrition Profile Selection

**Files:**
- Modify: `admin-web/src/views/Recipes/RecipeForm.vue`
- Test: `admin-web/tests/recipeNutritionState.test.js`

- [ ] Write a failing static test requiring the label `营养档案`, default-primary copy, and `formatNutritionProfileOptionLabel`.
- [ ] Rename the existing food-row selector from `营养状态` to `营养档案`.
- [ ] Keep the existing `nutritionFoodId` persistence.
- [ ] Keep backend defaulting behavior: omitted `nutritionFoodId` resolves to the mapped primary profile.

### Task 5: Verify

**Files:**
- No code changes.

- [ ] Run `node --test admin-web/tests/ingredientManagementCenter.test.js admin-web/tests/recipeNutritionState.test.js`.
- [ ] Run `npm --prefix backend test -- tests/application/nutrition-food/nutrition-food.service.spec.ts tests/application/recipe/recipe-nutrition-state.spec.ts --runInBand`.
- [ ] Run `npm --prefix admin-web run build`.
- [ ] Run `npm --prefix backend run build`.
- [ ] Run `git diff --check`.
- [ ] Restart the local backend and check `http://localhost:3001/api/v1/admin/nutrition-governance/overview` returns `401 Unauthorized`.
