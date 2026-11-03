# Recipe Cover Title Source Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop generating new recipe cover images with baked-in title text and remove the old top-left cover title overlay from the recipe detail page.

**Architecture:** Keep `coverImageUrl` as the clean image URL and `coverTitle` as display-only text. The miniapp renders `coverTitle` as a bottom badge when needed; backend admin create/update/regenerate flows must not call image title rendering.

**Tech Stack:** NestJS controller tests with Jest, Vue 3/uni-app SFC static regression tests with Vitest, scoped CSS.

---

### Task 1: Backend Regression Coverage

**Files:**
- Modify: `backend/tests/interfaces/controllers/admin.controller.spec.ts`

- [ ] **Step 1: Add failing tests**

Add tests that instantiate `AdminController` with mocked `recipeService` and `coverImageService`, then verify `createRecipe`, `updateRecipe`, and `regenerateCovers` do not call `coverImageService.renderTitleOnCover`.

- [ ] **Step 2: Verify red**

Run:

```bash
cd backend && npm test -- tests/interfaces/controllers/admin.controller.spec.ts
```

Expected: FAIL because the current controller bakes cover titles into images.

### Task 2: Detail Page Regression Coverage

**Files:**
- Modify: `miniapp/src/pages/recipe-detail.regression.spec.ts`

- [ ] **Step 1: Add failing test**

Add a test requiring the detail page to avoid `cover-title-overlay` and render a bottom badge only when both `recipe.coverImageUrl` and `recipe.coverTitle` exist.

- [ ] **Step 2: Verify red**

Run:

```bash
cd miniapp && npm test -- src/pages/recipe-detail.regression.spec.ts
```

Expected: FAIL because the detail page still uses the old top-left overlay.

### Task 3: Backend Implementation

**Files:**
- Modify: `backend/src/interfaces/controllers/admin.controller.ts`

- [ ] **Step 1: Preserve clean cover URLs on create/update**

Remove title-rendering blocks from `createRecipe` and `updateRecipe`; pass DTO cover fields through unchanged.

- [ ] **Step 2: Disable manual cover regeneration**

Make `regenerateCovers` return a successful disabled response without querying recipes or rendering titles.

- [ ] **Step 3: Verify backend tests pass**

Run:

```bash
cd backend && npm test -- tests/interfaces/controllers/admin.controller.spec.ts
```

Expected: PASS.

### Task 4: Detail Page Implementation

**Files:**
- Modify: `miniapp/src/pages/recipe-detail/index.vue`

- [ ] **Step 1: Replace top-left overlay with bottom badge**

Render the detail cover badge only when `recipe.coverImageUrl && recipe.coverTitle`.

- [ ] **Step 2: Replace overlay styles**

Remove `.cover-title-overlay` and `.cover-title-text`, add bottom gradient and badge styles.

- [ ] **Step 3: Verify detail tests pass**

Run:

```bash
cd miniapp && npm test -- src/pages/recipe-detail.regression.spec.ts
```

Expected: PASS.

### Task 5: Full Verification

**Files:**
- Review: `backend/src/interfaces/controllers/admin.controller.ts`
- Review: `miniapp/src/pages/recipe-detail/index.vue`
- Review: tests and this plan

- [ ] **Step 1: Run focused and full checks**

Run:

```bash
cd backend && npm test -- tests/interfaces/controllers/admin.controller.spec.ts
cd miniapp && npm test -- src/pages/recipe-detail.regression.spec.ts
cd miniapp && npm run build:mp-weixin
```

Expected: all commands exit 0.

- [ ] **Step 2: Review diff and commit**

Run:

```bash
git diff --check
git diff -- backend/src/interfaces/controllers/admin.controller.ts backend/tests/interfaces/controllers/admin.controller.spec.ts miniapp/src/pages/recipe-detail/index.vue miniapp/src/pages/recipe-detail.regression.spec.ts docs/superpowers/plans/2026-04-26-recipe-cover-title-source-cleanup.md
git add docs/superpowers/plans/2026-04-26-recipe-cover-title-source-cleanup.md backend/src/interfaces/controllers/admin.controller.ts backend/tests/interfaces/controllers/admin.controller.spec.ts miniapp/src/pages/recipe-detail/index.vue miniapp/src/pages/recipe-detail.regression.spec.ts
git commit -m "fix: stop baking recipe cover titles"
```
