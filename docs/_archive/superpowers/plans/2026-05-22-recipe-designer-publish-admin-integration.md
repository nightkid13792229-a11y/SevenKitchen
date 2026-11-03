# Recipe Designer Publish Admin Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make recipes published from the miniapp recipe designer open cleanly in the existing Web admin recipe edit form.

**Architecture:** Keep the recipe designer as the nutrition design surface and the Web admin as the operational edit surface. Publish continues to create formal `Recipe` and `RecipeItem` records, but the publish mapper now also emits admin-compatible metadata: macro nutrition summary, life stages, health tag assignments, and readable design source.

**Tech Stack:** NestJS service layer, Prisma nested creates, Jest service tests.

---

### Task 1: Lock Published Recipe Mapping With a Failing Test

**Files:**
- Modify: `backend/tests/application/recipe-designer/recipe-designer.service.spec.ts`

- [x] **Step 1: Write the failing test**

Add a service test that publishes a compliant designer draft with one mapped ingredient, no explicit life stages, and two health tags. Assert that `prisma.recipe.create` receives:

```ts
expect(createData.designSource).toBe('食谱设计器');
expect(createData.applicableLifeStages).toEqual(['PREGNANCY', 'LACTATION']);
expect(createData.healthTagAssignments).toEqual({
  create: [{ healthTagId: 'tag-skin' }, { healthTagId: 'tag-weight' }],
});
expect(createData.nutritionDetailedData).toEqual({
  moisture_pct: 70,
  protein_dm_pct: 66.67,
  fat_dm_pct: 10,
  fiber_dm_pct: 0,
  ash_dm_pct: 3.33,
  carbs_dm_pct: 0,
  ca_p_ratio: 1.2,
  energy_density_kcal_per_kg: 1200,
});
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- recipe-designer.service.spec.ts --runInBand
```

Expected: FAIL because publish still writes raw assessment nutrients, empty life stages, no nested health tag assignments, and machine-readable design source.

### Task 2: Implement Admin-Compatible Publish Mapping

**Files:**
- Modify: `backend/src/application/recipe-designer/recipe-designer.service.ts`

- [x] **Step 1: Add mapping helpers**

Add helpers for:

```ts
const RECIPE_DESIGNER_PUBLISHED_SOURCE = '食谱设计器';
const PUBLISHED_RECIPE_LIFE_STAGES_BY_SCENARIO: Record<FediafDogScenarioCode, string[]> = {
  EARLY_GROWTH_REPRODUCTION: ['PUPPY'],
  LATE_GROWTH: ['PUPPY'],
  ADULT_MER_95: ['ADULT'],
  ADULT_MER_110: ['ADULT'],
  REPRODUCTION: ['PREGNANCY', 'LACTATION'],
};
```

Map `DesignRecipeAssessmentResult.macroMetrics` into Web admin `nutritionDetailedData` keys and use `ca_p_ratio` from the ratio assessment entry.

- [x] **Step 2: Wire helpers into `publishDraft`**

Update `tx.recipe.create` data so published recipes include admin-compatible `nutritionDetailedData`, readable `designSource`, fallback `applicableLifeStages`, and nested `healthTagAssignments` when tags exist.

- [x] **Step 3: Run targeted tests**

Run:

```bash
npm test -- recipe-designer.service.spec.ts --runInBand
```

Expected: PASS.

### Task 3: Regression Verification

**Files:**
- No additional production files.

- [x] **Step 1: Run controller and recipe designer regression tests**

Run:

```bash
npm test -- recipe-designer.service.spec.ts recipe-designer.controller.spec.ts recipe.service.spec.ts --runInBand
```

Expected: PASS.

- [x] **Step 2: Report remaining scope**

Report that Web admin editing itself already reads the formal `Recipe` model; this change makes designer-published rows populate the expected edit sections. Media, description, production steps, and operational polish remain Web-admin editable after publish.
