# Recipe Series Copy Supplement Targets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Future recipe-series copies select the newest official stage and create editable drafts with preserved supplement targets and calculated non-zero starting doses.

**Architecture:** Add nullable `supplementTargets` JSON persistence to `DesignRecipeItem`; prefer a latest official recipe over a design draft for each stage; convert its dynamic targets to no-loss draft doses through the existing backend supplement-dose resolver. Old drafts and existing copies remain unchanged.

**Tech Stack:** NestJS, TypeScript, Prisma/PostgreSQL, Jest.

---

### Task 1: Add draft target persistence

**Files:**

- Create: `backend/prisma/migrations/202608040001_add_design_recipe_item_supplement_targets/migration.sql`
- Modify: `backend/prisma/schema.prisma:2207-2228`
- Modify: `backend/src/application/recipe-designer/recipe-designer.service.ts:93-185, 280-450`
- Test: `backend/tests/prisma/recipe-designer-local-repair.spec.ts`

- [ ] **Step 1: Write the failing schema test**

Read the schema and migration in `recipe-designer-local-repair.spec.ts`; assert the model and SQL contain:

```ts
expect(designRecipeItemBlock).toMatch(
  /supplementTargets\s+Json\?\s+@map\("supplement_targets"\)/,
);
expect(migration).toContain(
  'ADD COLUMN IF NOT EXISTS "supplement_targets" JSONB',
);
```

- [ ] **Step 2: Verify red**

Run: `cd backend && npx jest tests/prisma/recipe-designer-local-repair.spec.ts --runInBand`
Expected: FAIL because neither field exists.

- [ ] **Step 3: Implement the nullable column and read shape**

Create the migration:

```sql
ALTER TABLE "design_recipe_item"
  ADD COLUMN IF NOT EXISTS "supplement_targets" JSONB;
```

Add this Prisma field beside `nutrientTargetValue`:

```prisma
supplementTargets Json? @map("supplement_targets")
```

Add `supplementTargets: true` to `DESIGN_RECIPE_INCLUDE.items.select` and `DESIGN_RECIPE_LIST_SELECT.items.select`; extend the local design item types with `supplementTargets?: unknown | null`.

- [ ] **Step 4: Verify green and commit**

Run: `cd backend && npx jest tests/prisma/recipe-designer-local-repair.spec.ts --runInBand`
Expected: PASS.

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/202608040001_add_design_recipe_item_supplement_targets/migration.sql backend/src/application/recipe-designer/recipe-designer.service.ts backend/tests/prisma/recipe-designer-local-repair.spec.ts
git commit -m "feat: persist supplement targets in recipe drafts"
```

### Task 2: Prefer official recipes when choosing a copied stage

**Files:**

- Modify: `backend/src/application/recipe-designer/recipe-designer.service.ts:2103-2136`
- Test: `backend/tests/application/recipe-designer/recipe-designer.service.spec.ts:6280-6750`

- [ ] **Step 1: Write the failing priority test**

Arrange one low-activity stage with both a legacy design draft (`weightG: 0`) and a `PUBLIC` v10 recipe with a supplement target. Call `duplicateSeriesStage` and assert `designRecipe.create` receives the official item, rather than the legacy draft item.

- [ ] **Step 2: Verify red**

Run: `cd backend && npx jest tests/application/recipe-designer/recipe-designer.service.spec.ts --runInBand -t "prefers the latest official stage"`
Expected: FAIL because the current loop chooses `design` first.

- [ ] **Step 3: Reverse only the stage source precedence**

Replace the body of the `ORDERED_RECIPE_SERIES_LIFE_STAGES` loop with:

```ts
for (const lifeStage of ORDERED_RECIPE_SERIES_LIFE_STAGES) {
  const recipe = recipesByStage.get(lifeStage);
  if (recipe) {
    sources.push({ kind: 'recipe', lifeStage, recipe });
    continue;
  }
  const design = designsByStage.get(lifeStage);
  if (design) sources.push({ kind: 'design', lifeStage, design });
}
```

Keep `getLatestCopyableSeriesRecipes` unchanged so status/version/update-time selection remains stable.

- [ ] **Step 4: Verify green and commit**

Run both:

```bash
cd backend && npx jest tests/application/recipe-designer/recipe-designer.service.spec.ts --runInBand -t "prefers the latest official stage"
cd backend && npx jest tests/application/recipe-designer/recipe-designer.service.spec.ts --runInBand -t "duplicates a whole recipe series"
```

Expected: PASS.

```bash
git add backend/src/application/recipe-designer/recipe-designer.service.ts backend/tests/application/recipe-designer/recipe-designer.service.spec.ts
git commit -m "fix: prefer official recipes when copying series stages"
```

### Task 3: Calculate copied supplement weights from official targets

**Files:**

- Modify: `backend/src/application/recipe-designer/recipe-designer.service.ts:2378-2461`
- Test: `backend/tests/application/recipe-designer/recipe-designer.service.spec.ts`

- [ ] **Step 1: Write failing conversion tests**

Use 1,000g of food and a supplement profile containing `minerals.calcium: 40000` with `rawBasisType: 'PER_100_G'`. Its target is 800mg calcium/kg:

```ts
supplementTargets: [{
  fieldPath: 'minerals.calcium', label: '钙', targetValuePerKg: 800, unit: 'mg',
}],
```

Assert the newly created draft item stores the exact target array and `weightG: 2`. Add a two-target fixture that selects the largest required dose, and a missing-concentration fixture that falls back to `exampleWeight: 0.5` without failing the series copy.

- [ ] **Step 2: Verify red**

Run: `cd backend && npx jest tests/application/recipe-designer/recipe-designer.service.spec.ts --runInBand -t "calculates supplement draft doses from official targets"`
Expected: FAIL because the source lacks nutrition profiles and only uses `exampleWeight`.

- [ ] **Step 3: Load source profiles and implement one resolver helper**

Include `ingredient: { select: { type: true, nutritionProfile: true, unitDisplayLabel: true }}` on official recipe items. Extend `RecipeSeriesCopyableRecipeItem` with `supplementTargets` and the optional ingredient shape. Import `calculateSupplementDose`.

Implement a helper with this core logic:

```ts
const targets = this.normalizeSupplementTargets(item.supplementTargets);
if (targets.length && item.ingredient?.nutritionProfile && totalFoodWeightG > 0) {
  try {
    return calculateSupplementDose({
      nutritionProfile: item.ingredient.nutritionProfile,
      targets,
      basisWeightG: totalFoodWeightG,
      displayUnit: item.ingredient.unitDisplayLabel,
      lossRate: 1,
    }).amount;
  } catch { /* fall back below for historical profile gaps */ }
}
return this.resolveRecipeItemDesignWeight(item);
```

In `toCopiedDesignRecipeItemsFromRecipe`, total only non-supplement food weights, call this helper for supplements, and persist normalized targets through `this.toJsonValue(targets)`. Do not block an entire copy because one old supplement has an incomplete profile.

- [ ] **Step 4: Verify green and commit**

Run:

```bash
cd backend && npx jest tests/application/recipe-designer/recipe-designer.service.spec.ts --runInBand -t "calculates supplement draft doses from official targets"
cd backend && npx jest tests/domain/pricing/pricing-supplement-resolver.spec.ts --runInBand
```

Expected: PASS.

```bash
git add backend/src/application/recipe-designer/recipe-designer.service.ts backend/tests/application/recipe-designer/recipe-designer.service.spec.ts
git commit -m "fix: calculate copied supplement draft doses"
```

### Task 4: Preserve targets in draft copy and publish flows

**Files:**

- Modify: `backend/src/application/recipe-designer/recipe-designer.service.ts:2463-2475, 3390-3410, 4315-4350`
- Test: `backend/tests/application/recipe-designer/recipe-designer.service.spec.ts`

- [ ] **Step 1: Write failing preservation tests**

Extend the `copyStageItemsToDraft` fixture with two targets and assert `items.create` retains the full array. Add equivalent coverage for duplicating a design-source series. Add a publish fixture whose new assessment has no target output and assert existing draft targets are used as the publication fallback.

- [ ] **Step 2: Verify red**

Run: `cd backend && npx jest tests/application/recipe-designer/recipe-designer.service.spec.ts --runInBand -t "preserves supplement targets"`
Expected: FAIL because `toCopiedDesignRecipeItemData` and publish fallback omit the JSON value.

- [ ] **Step 3: Forward normalized targets at every existing boundary**

Add to `toCopiedDesignRecipeItemData`:

```ts
supplementTargets: item.supplementTargets
  ? this.toJsonValue(this.normalizeSupplementTargets(item.supplementTargets))
  : undefined,
```

Use the same normalized value in revision creation and private snapshots that serialize recipe items. In `buildPublishedRecipeItemCreateData`, keep newly assessed targets first, then use:

```ts
const storedTargets = this.normalizeSupplementTargets(item.supplementTargets);
const supplementTargetPayload = this.buildPublishedSupplementTargets(supplementTargets)
  ?? (storedTargets.length ? storedTargets : null);
```

- [ ] **Step 4: Verify green and commit**

Run: `cd backend && npx jest tests/application/recipe-designer/recipe-designer.service.spec.ts --runInBand`
Expected: PASS.

```bash
git add backend/src/application/recipe-designer/recipe-designer.service.ts backend/tests/application/recipe-designer/recipe-designer.service.spec.ts
git commit -m "fix: preserve supplement targets across recipe drafts"
```

### Task 5: Regenerate and verify the integration

**Files:**

- Verify: `backend/prisma/schema.prisma`
- Verify: `backend/prisma/migrations/202608040001_add_design_recipe_item_supplement_targets/migration.sql`
- Verify: `backend/tests/application/recipe-designer/recipe-designer.service.spec.ts`

- [ ] **Step 1: Generate Prisma client and build**

Run: `cd backend && npm run prisma:generate:build && npm run build`
Expected: exit 0; resolve item-shape type errors without using `as any`.

- [ ] **Step 2: Run affected test suites**

Run:

```bash
cd backend && npx jest tests/application/recipe-designer/recipe-designer.service.spec.ts tests/prisma/recipe-designer-local-repair.spec.ts tests/application/recipe/recipe-supplement-targets.spec.ts tests/domain/pricing/pricing-supplement-resolver.spec.ts --runInBand
```

Expected: all suites PASS.

- [ ] **Step 3: Validate Prisma and final diff**

Run: `cd backend && npx prisma validate --schema prisma/schema.prisma`
Expected: schema valid.

Run: `git diff --check`
Expected: no whitespace errors. Stage and commit only files listed in this plan if final verification needs adjustments.
