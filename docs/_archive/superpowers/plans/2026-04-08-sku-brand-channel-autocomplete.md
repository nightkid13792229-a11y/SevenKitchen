# SKU Brand/Channel Autocomplete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add global-history autocomplete for `品牌` and `采购渠道` in both the DIY recommended product dialog and the procurement SKU dialog on the ingredient edit page.

**Architecture:** Extend the backend ingredient/admin APIs with lightweight suggestion endpoints that aggregate distinct brands and purchase channels from `Ingredient`, `RecommendedProduct`, and `ProcurementSku`. Update the admin ingredient form to fetch these suggestions once and reuse them through `el-autocomplete` controls that still allow free-form input.

**Tech Stack:** NestJS, Prisma, Jest, Vue 3, Element Plus, TypeScript

---

### Task 1: Add backend tests for suggestion aggregation

**Files:**
- Modify: `backend/tests/interfaces/controllers/admin.controller.spec.ts`
- Modify: `backend/tests/application/ingredient/recommended-product.service.spec.ts`
- Modify: `backend/tests/application/ingredient/procurement-sku.service.spec.ts`

- [ ] Add failing controller coverage for `GET /api/v1/admin/ingredients/brand-suggestions` and `GET /api/v1/admin/ingredients/purchase-channel-suggestions`, asserting empty values are filtered and duplicates are removed.
- [ ] Run the targeted backend tests and verify the new assertions fail because the routes/service methods do not exist yet.

### Task 2: Implement backend suggestion APIs

**Files:**
- Modify: `backend/src/application/ingredient/recommended-product.service.ts`
- Modify: `backend/src/application/ingredient/procurement-sku.service.ts`
- Modify: `backend/src/interfaces/controllers/admin.controller.ts`

- [ ] Add service methods to return distinct active-history brand and purchase channel values from DIY recommended products and procurement SKUs.
- [ ] Add controller endpoints that merge ingredient history with the two SKU sources, trim blanks, deduplicate, sort, and return suggestion arrays.
- [ ] Re-run the targeted backend tests and confirm they pass.

### Task 3: Wire admin-web API helpers and failing type checks

**Files:**
- Modify: `admin-web/src/api/ingredients.ts`
- Modify: `admin-web/src/views/Ingredients/IngredientForm.vue`

- [ ] Add ingredient API methods for fetching brand suggestions and purchase channel suggestions.
- [ ] Replace the four plain text inputs in the two dialogs with autocomplete bindings in a way that initially fails `vue-tsc` until the supporting state/query handlers are added.
- [ ] Run `npx vue-tsc --noEmit --pretty false` in `admin-web` and verify the expected type errors show up.

### Task 4: Implement admin-web autocomplete behavior

**Files:**
- Modify: `admin-web/src/views/Ingredients/IngredientForm.vue`

- [ ] Add shared suggestion state, query handlers, and initial loading for global brand/channel suggestions.
- [ ] Reuse Element Plus `el-autocomplete` for DIY `品牌`/`采购渠道` and procurement SKU `品牌`/`采购渠道`, keeping free-form entry enabled.
- [ ] Ensure dialog open/edit flows populate the selected value correctly and continue to save unchanged payloads.
- [ ] Re-run `npx vue-tsc --noEmit --pretty false` and confirm it passes.

### Task 5: Final verification

**Files:**
- Modify: none

- [ ] Run targeted backend Jest commands for the touched suites.
- [ ] Run `npx vue-tsc --noEmit --pretty false` in `admin-web`.
- [ ] Summarize behavior: both dialogs offer click-to-select historical brands/channels while still allowing new manual input.
