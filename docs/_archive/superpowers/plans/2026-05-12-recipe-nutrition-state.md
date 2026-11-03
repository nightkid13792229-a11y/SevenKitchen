# Recipe Nutrition State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each recipe food item choose the concrete nutrition dataset/state used for calculation and display while keeping the standard ingredient unchanged.

**Architecture:** Reuse `NutritionFood` as the concrete nutrition profile and `NutritionFoodMapping` as the ingredient-to-profile variant mapping. Add `RecipeItem.nutritionFoodId`, expose mapped nutrition options in ingredient/admin recipe APIs, and render selected state labels in admin-web and miniapp flows.

**Tech Stack:** NestJS, Prisma, PostgreSQL, Vue 3, Element Plus, Uni-app miniapp, Vitest/Jest-style focused regression tests.

---

### Task 1: Schema And Backend Contract

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/202605120001_add_recipe_item_nutrition_food_state/migration.sql`
- Modify: `backend/src/domain/recipe/recipe.repository.ts`
- Modify: `backend/src/infrastructure/repositories/prisma-recipe.repository.ts`
- Test: `backend/tests/prisma/recipe-item-nutrition-food-state-schema.spec.ts`

- [x] **Step 1: Write the failing schema test**

Create `backend/tests/prisma/recipe-item-nutrition-food-state-schema.spec.ts` to assert that the Prisma schema contains `RecipeItem.nutritionFoodId`, the relation to `NutritionFood`, and `NutritionFood.preparationState` / `preparationStateLabel`.

- [x] **Step 2: Run the schema test**

Run: `cd backend && npm test -- tests/prisma/recipe-item-nutrition-food-state-schema.spec.ts --runInBand`
Expected: FAIL because the fields do not exist yet.

- [x] **Step 3: Add schema and migration**

Add nullable `nutrition_food_id` to `recipe_item`, nullable `preparation_state` and `preparation_state_label` to `nutrition_food`, indexes for lookup, and relations in Prisma.

- [x] **Step 4: Run the schema test**

Run: `cd backend && npm test -- tests/prisma/recipe-item-nutrition-food-state-schema.spec.ts --runInBand`
Expected: PASS.

### Task 2: Backend Recipe Save And API Output

**Files:**
- Modify: `backend/src/application/recipe/recipe.service.ts`
- Modify: `backend/src/interfaces/dto/recipes/admin-recipe.dto.ts`
- Modify: `backend/src/interfaces/controllers/recipes.controller.ts`
- Modify: `backend/src/interfaces/controllers/admin.controller.ts`
- Modify: `backend/src/application/order/order.service.ts`
- Test: `backend/tests/application/recipe/recipe-nutrition-state.spec.ts`

- [x] **Step 1: Write the failing service/controller tests**

Add tests proving that a recipe item can save `nutritionFoodId`, rejects a nutrition food not mapped to the selected ingredient, defaults to the primary mapping when omitted, and maps state labels into recipe detail responses and order snapshots.

- [x] **Step 2: Run the tests**

Run: `cd backend && npm test -- tests/application/recipe/recipe-nutrition-state.spec.ts --runInBand`
Expected: FAIL because save/output logic is missing.

- [x] **Step 3: Implement backend support**

Resolve and validate recipe item nutrition foods before create/update, include nutrition food relations in recipe detail reads, expose ingredient `nutritionFoodMappings`, and copy state metadata into recipe responses and recipe snapshots.

- [x] **Step 4: Run backend tests**

Run: `cd backend && npm test -- tests/application/recipe/recipe-nutrition-state.spec.ts tests/application/recipe/recipe.service.spec.ts tests/interfaces/controllers/recipes.controller.spec.ts --runInBand`
Expected: PASS.

### Task 3: Admin Recipe Editor

**Files:**
- Modify: `admin-web/src/types/ingredient.ts`
- Modify: `admin-web/src/types/recipe.ts`
- Modify: `admin-web/src/views/Recipes/RecipeForm.vue`
- Test: `admin-web/tests/recipeNutritionState.test.js`

- [x] **Step 1: Write failing admin-web regression test**

Assert that `RecipeForm.vue` contains a nutrition state selector bound to `ingredientForm.nutritionFoodId`, preselects the primary mapping, and saves `nutritionFoodId` on recipe items.

- [x] **Step 2: Run the admin-web test**

Run: `cd admin-web && node --test tests/recipeNutritionState.test.js`
Expected: FAIL because the selector and save field are missing.

- [x] **Step 3: Implement editor support**

Add mapped nutrition food types, show the selector for food ingredients with mappings, preselect primary/first mapping, display selected state in the ingredient table, and preserve the selected value during edits.

- [x] **Step 4: Run admin-web tests**

Run: `cd admin-web && node --test tests/recipeNutritionState.test.js`
Expected: PASS.

### Task 4: Miniapp Display

**Files:**
- Modify: `miniapp/src/pages/recipe-detail/index.vue`
- Modify: `miniapp/src/pages/diy-sheet/index.vue`
- Modify: `miniapp/src/pages/diy-sheet/fallback.ts`
- Modify: `miniapp/src/utils/canvas-printer.ts`
- Test: `miniapp/src/pages/recipe-detail.regression.spec.ts`
- Test: `miniapp/src/pages/diy-sheet.regression.spec.ts`

- [x] **Step 1: Write failing miniapp regression assertions**

Assert recipe detail and DIY sheet render nutrition state labels when present and preserve fallback behavior when labels are missing.

- [x] **Step 2: Run miniapp tests**

Run: `cd miniapp && npm test -- src/pages/recipe-detail.regression.spec.ts src/pages/diy-sheet.regression.spec.ts`
Expected: FAIL because state labels are not rendered yet.

- [x] **Step 3: Implement miniapp rendering**

Add lightweight state labels to food rows and amount detail data without adding user-facing choices.

- [x] **Step 4: Run miniapp tests**

Run: `cd miniapp && npm test -- src/pages/recipe-detail.regression.spec.ts src/pages/diy-sheet.regression.spec.ts`
Expected: PASS.

### Task 5: Verification

**Files:**
- All touched files

- [x] **Step 1: Run focused backend tests**

Run: `cd backend && npm test -- tests/prisma/recipe-item-nutrition-food-state-schema.spec.ts tests/application/recipe/recipe-nutrition-state.spec.ts tests/application/recipe/recipe.service.spec.ts tests/interfaces/controllers/recipes.controller.spec.ts --runInBand`

- [x] **Step 2: Run focused frontend tests**

Run: `cd admin-web && node --test tests/recipeNutritionState.test.js`

Run: `cd miniapp && npm test -- src/pages/recipe-detail.regression.spec.ts src/pages/diy-sheet.regression.spec.ts src/pages/diy-sheet/fallback.spec.ts`

- [x] **Step 3: Run builds if focused tests pass**

Run: `cd backend && npm run build`

- [x] **Step 4: Review diff and commit**

Run: `git diff --stat && git status --short`, then commit the implementation if verification passes.
