# 补剂目标营养素与原料预处理实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace deficiency-inferred supplement targets with explicit target-nutrient declarations, compute actual addition concentration, add editable ingredient preparation, and persist structured production steps in the designer.

**Architecture:** Extend nutrition profiles with default supplement targets; make `supplementTargets` an explicit single-`fieldPath` contract on design/published recipe items; compute per-kg concentration from the current assessment denominator. Add preparation metadata per item and structured steps at the design/recipe level. Keep recipe-management list/version functions; only move single-recipe completion into the designer.

**Tech Stack:** NestJS, Prisma/PostgreSQL, Vue 3 + Element Plus, Vitest/Jest.

**Spec:** `docs/superpowers/specs/2026-10-22-supplement-target-and-preparation-design.md`

## Global Constraints

- A supplement target always has exactly one `fieldPath`; combinations use derived fields such as `derived.epaDha`.
- Concentration = target nutrient contribution ÷ `assessment.totalWeightG` × 1000.
- No separate suggested-target concentration; the computed actual concentration is the displayed value.
- Missing/unknown supplement target is a hard error at save/publish/stage; never silently drop it.
- Defaults live on the supplement nutrition profile, not the procurement ingredient.
- Preparation is per ingredient; production steps are recipe-level.
- Preparation/steps are editable in the designer; do not copy defaults from historical recipes.
- Historical published recipe target values are recomputed; delivered snapshots stay unchanged.
- Structured steps are persisted this phase; customer delivery/DIY rendering is the next phase.
- Touch only the relevant module; do not remove the lightweight recipe library.

## Review Focus

- **Functional supplement:** fiber powder with no deficiency still gets a declared fiber target and a concentration. Test in Task 2/6.
- **Combination:** EPA+DHA resolves through a derived field and pricing/production still receive one `fieldPath`. Test in Task 2/4.
- **Missing target:** supplement without target cannot be staged/published, and is not silently priced at zero. Test in Task 3.
- **Historical:** recomputation produces a diff and does not mutate delivered snapshots. Test in Task 3/8.
- **Prep/steps:** prep and steps survive editor reload, publish, and private snapshot. Test in Task 4/8.

---

## Task 1: Schema and migration

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20261022120000_supplement_target_preparation/migration.sql`
- Test: `backend/tests/prisma/supplement-target-preparation-schema.spec.ts`

**Interfaces:**
- `NutritionFood.defaultSupplementTargets Json?`
- `DesignRecipeItem.preparationNote String?`, `.preparationSource String?`
- `RecipeItem.preparationNote String?`, `.preparationSource String?`
- `DesignRecipe.productionStepsJson Json?`
- `Recipe.productionStepsJson Json?`
- Additive migration; widen `order_item.preparation_method` only if needed by delivery; otherwise keep separate.

- [ ] **Step 1: Write failing schema guards** for fields/defaults/relations.
- [ ] **Step 2: Add schema + migration; run `prisma migrate deploy` + generate.**
- [ ] **Step 3: Run schema guards; expect pass.**
- [ ] **Step 4: Commit `feat: add supplement target and preparation schema`.**

## Task 2: Target resolver, defaults, validation

**Files:**
- Create: `backend/src/application/recipe-designer/supplement-target.service.ts`
- Modify: `backend/src/application/recipe-designer/recipe-designer.service.ts`
- Modify: `backend/src/interfaces/dto/recipe-designer/recipe-designer.dto.ts`
- Test: `backend/tests/application/recipe-designer/supplement-target.service.spec.ts`

**Interfaces:**
- `resolveDefaultTargets(nutritionFoodId): Promise<SupplementTargetDefinition[]>`
- `validateTargets(profile, targets): SupplementTargetDefinition[]`
- `computeTargets(profile, targets, weightG, totalWeightG): SupplementTarget[]`
- Target shape: `{ fieldPath, label, unit, targetValuePerKg }`.
- Accept one fieldPath; reject unknown/empty/zero; use derived fields for combinations.

- [ ] **Step 1: Failing tests for fiber default, single target, derived EPA+DHA, missing/empty target, unit conversion.**
- [ ] **Step 2: Implement service; no deficiency inference for new paths.**
- [ ] **Step 3: Add DTO validation/errors (400), no silent drop.**
- [ ] **Step 4: Run tests/build; commit.**

## Task 3: Add/update/publish/staging and historical recompute

**Files:**
- Modify: `backend/src/application/recipe-designer/recipe-designer.service.ts`
- Modify: `backend/src/application/custom-recipe/custom-recipe-delivery.service.ts` if target payload validation needed
- Create: `backend/src/application/recipe-designer/supplement-target-backfill.service.ts` (or script)
- Test: `backend/tests/application/recipe-designer/supplement-target-flow.spec.ts`

- [ ] **Step 1: AddItem/updateItem require supplement targets; defaults auto-applied server-side when absent.**
- [ ] **Step 2: Publish/private snapshot require targets; remove new-target inference fallback.**
- [ ] **Step 3: Recompute published `RecipeItem.supplementTargets` using current formula; produce diff/list before update; leave delivery snapshots unchanged.**
- [ ] **Step 4: Tests for no-target hard fail, fiber stage, historical diff, delivery snapshot immutability.**
- [ ] **Step 5: Commit.**

## Task 4: Preparation and structured steps persistence

**Files:**
- Modify: `backend/src/application/recipe-designer/recipe-designer.service.ts`
- Modify: `backend/src/interfaces/dto/recipe-designer/recipe-designer.dto.ts`
- Modify: `backend/src/application/custom-recipe/custom-recipe-delivery.service.ts` (only persist steps in private recipe; no delivery snapshot v2 yet)
- Test: `backend/tests/application/recipe-designer/preparation-steps.spec.ts`

- [ ] **Step 1: Add/edit preparation method/note/source; default from nutrition profile, not history.**
- [ ] **Step 2: Add/get structured production steps on design draft; validate shape/order.**
- [ ] **Step 3: Copy prep and steps into private snapshot; no delivery snapshot v2.**
- [ ] **Step 4: Tests for persistence, ordering, default source, publish/private snapshot.**
- [ ] **Step 5: Commit.**

## Task 5: Admin API/types and nutrition profile editor

**Files:**
- Modify: `admin-web/src/api/ingredients.ts`
- Modify: `admin-web/src/types/recipeDesigner.ts`
- Modify: `admin-web/src/views/Ingredients/components/IngredientNutritionEditor.vue`
- Modify: `admin-web/src/views/RecipeDesigner/Editor.vue` types
- Test: `admin-web/src/views/Ingredients/nutritionDefaultTargets.regression.spec.ts`

- [ ] **Step 1: Add default target payload/API.**
- [ ] **Step 2: Add nutrition profile target editor with non-empty field selector and combo support.**
- [ ] **Step 3: Tests/build.**
- [ ] **Step 4: Commit.**

## Task 6: Designer supplement picker + concentration + prep UI

**Files:**
- Create: `admin-web/src/views/RecipeDesigner/components/SupplementTargetDialog.vue`
- Modify: `admin-web/src/views/RecipeDesigner/Editor.vue`
- Modify: `admin-web/src/views/RecipeDesigner/components/AssessmentPanel.vue`
- Test: `admin-web/src/views/RecipeDesigner/supplementTargetUi.regression.spec.ts`

- [ ] **Step 1: On library add/smart add, resolve defaults or open target dialog; block add until target chosen.**
- [ ] **Step 2: Show target nutrient and actual concentration inline; update on weight/total changes.**
- [ ] **Step 3: Add editable preparation select/note/source per item; default marker.**
- [ ] **Step 4: Tests/build.**
- [ ] **Step 5: Commit.**

## Task 7: Designer production steps UI

**Files:**
- Create: `admin-web/src/views/RecipeDesigner/components/ProductionStepsEditor.vue`
- Modify: `admin-web/src/views/RecipeDesigner/Editor.vue`
- Test: `admin-web/src/views/RecipeDesigner/productionSteps.regression.spec.ts`

- [ ] **Step 1: Add step list add/edit/delete/reorder.**
- [ ] **Step 2: Load/save structured steps; handle legacy `productionSteps` read-only migration.**
- [ ] **Step 3: Tests/build.**
- [ ] **Step 4: Commit.**

## Task 8: Backfill, acceptance, deploy

- [ ] **Step 1: Run historical recompute diff; review affected published recipes.**
- [ ] **Step 2: Apply data migration/backfill; verify delivered snapshots unchanged.**
- [ ] **Step 3: Full backend/admin tests/build.**
- [ ] **Step 4: Deploy backend/admin after user approval.**
- [ ] **Step 5: Verify fiber powder and fish oil concentrations in design/preview.**
- [ ] **Step 6: Report results.**

## Self-Review

- Spec coverage: defaults, single-fieldPath combinations, formula denominator, hard failures, historical recompute, prep/steps, phase boundaries.
- Type consistency: `SupplementTarget`, `targetValuePerKg`, `preparationSource`, `productionStepsJson`.
- Review Focus tests assigned to Tasks 2/3/4/6/8.
- Phase 2 delivery rendering remains out of scope; document that.
