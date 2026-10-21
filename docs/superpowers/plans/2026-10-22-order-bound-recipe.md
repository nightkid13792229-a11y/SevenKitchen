# 订单绑定食谱设计实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build order-bound recipe design with an in-editor template picker, per-order staging workspace, and one final batch delivery.

**Architecture:** Reuse the existing recipe designer/editor and custom-recipe delivery services. Add a persisted design mode plus an order design-slot table; each order-bound slot owns its own series/draft so N recipes have independent names and lifecycle. Template selection clones an existing recipe into a new order-bound draft; staging publishes the private recipe but does not deliver; final submission is admin-only and calls the existing batch-delivery service.

**Tech Stack:** NestJS, Prisma/PostgreSQL, Vue 3 + Element Plus, Vitest/Jest.

**Spec:** `docs/superpowers/specs/2026-10-22-order-bound-recipe-design.md`

## Global Constraints

- Catalog mode (`CATALOG`) has no order and no mandatory dog; order mode (`ORDER`) requires `orderId`, dog, and `recipeQuantity`.
- Order-bound dog is locked; no “change reference dog” in order mode.
- Template life-stage mismatch is a warning only; never block create/edit/stage/final delivery.
- Template is cloned; source recipe and source dog/customer are never modified or reattached.
- Same template may be reused in multiple slots; final recipes must have distinct recipe IDs.
- One slot = one independent series/draft; order-bound series are hidden from the catalog list.
- Staging creates a private custom recipe but shows nothing to the customer and sends no notification.
- Final first delivery is admin-only and must be atomic for all N recipes; existing order page delivery remains for legacy orders and aftersales re-delivery.
- No automatic backfill of in-flight orders; they may adopt an existing private recipe manually.
- All customer-visible copy and tests use Chinese business language.

## Review Focus

- **Life-stage mismatch:** template stage differs from dog stage; must warn, still allow create and finalize. Add test in Task 2/3.
- **Same-template reuse:** two slots created from the same source; must both be allowed and still produce distinct recipe IDs. Add test in Task 3/4.
- **In-flight legacy order:** order has no staging rows and existing order-page delivery; new final endpoint must reject/leave legacy path usable. Add test in Task 4.
- **Non-admin finalize:** staff can edit but cannot trigger first delivery/notification. Add test in Task 4.
- **Cross-order staging:** final submit containing a READY slot from another order/dog must fail atomically. Add test in Task 4.

---

## Task 1: Schema and migration

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20261022020000_order_bound_recipe/migration.sql`
- Test: `backend/tests/prisma/order-bound-recipe-schema.spec.ts`

**Interfaces:**
- Produces:
  - `enum RecipeDesignMode { CATALOG ORDER }`
  - `enum OrderRecipeDesignStatus { EDITING READY DELIVERED REMOVED }`
  - `RecipeSeries.designMode`, `.orderId`, `.orderQuantity`
  - `OrderRecipeDesign` model
  - `CustomRecipeOrder.orderDesigns`, `Recipe.orderRecipeDesigns`, `RecipeSeries.orderDesign`

- [ ] **Step 1: Write failing schema guard tests** asserting enums, default `CATALOG`, nullable context, `OrderRecipeDesign` fields/relations, unique keys, additive migration.
- [ ] **Step 2: Run test; expect failure.**
- [ ] **Step 3: Add schema and migration.**
  - `RecipeSeries`: `designMode @default(CATALOG)`, `orderId?`, `orderQuantity?`; indexes.
  - `OrderRecipeDesign`: `id`, `orderId`, `dogId`, `seriesId @unique`, `designDraftId @unique`, `recipeId? @unique`, `sourceRecipeId?`, `sourceKind?`, `status @default(EDITING)`, `stageWarning?`, `createdBy`, timestamps; unique `[orderId, seriesId]`; relations.
  - Add reverse relations.
  - Generate migration via `prisma migrate diff`; apply locally `prisma migrate deploy` + `prisma generate`; production untouched.
- [ ] **Step 4: Run schema tests + `npx tsc --noEmit -p tsconfig.build.json`; expect pass.**
- [ ] **Step 5: Commit `feat: add order-bound recipe design schema`.**

## Task 2: Template search and stage comparison

**Files:**
- Create: `backend/src/application/recipe-designer/order-recipe-template.service.ts`
- Modify: `backend/src/interfaces/controllers/recipe-designer.controller.ts`
- Modify: `backend/src/application/recipe-designer/recipe-designer.service.ts` (only if reuse helpers)
- Create: `backend/tests/application/recipe-designer/order-recipe-template.service.spec.ts`
- Create: `admin-web/src/api/orderRecipeDesign.ts` (types only initially; UI later)
- Create: `admin-web/src/types/orderRecipeDesign.ts`

**Interfaces:**
- Produces service:
  - `searchTemplates(input: { keyword?: string; kind: 'ALL'|'CATALOG'|'CUSTOM' }) : Promise<TemplateSummary[]>`
  - `compareStage(templateLifeStage: string|null, dogId: string): Promise<{ matches: boolean; templateStage: string|null; dogStage: string|null; warning: string|null }>`
- TemplateSummary: `{ recipeId, recipeVersion, name, sourceKind, lifeStage, primaryProtein, ingredientCount, macroSummary, updatedAt }`.
- Route: `GET /api/v1/recipe-designer/recipe-templates?keyword=&kind=`.
- Stage comparison must never throw on mismatch.

- [ ] **Step 1: Write failing service tests** for catalog/custom filtering, keyword, summary fields, mismatch warning, no-stage warning.
- [ ] **Step 2: Run; expect fail.**
- [ ] **Step 3: Implement service and controller route with internal-role guard.**
- [ ] **Step 4: Run tests/build; expect pass.**
- [ ] **Step 5: Commit `feat: add recipe template search`.**

## Task 3: Order workspace, clone from template, staging

**Files:**
- Create: `backend/src/application/recipe-designer/order-recipe-design.service.ts`
- Modify: `backend/src/interfaces/controllers/recipe-designer.controller.ts`
- Modify: `backend/src/application/recipe-designer/recipe-designer.service.ts` (expose clone helper)
- Create: `backend/tests/application/recipe-designer/order-recipe-design.service.spec.ts`
- Create: `backend/tests/controllers/order-recipe-design.controller.spec.ts`

**Interfaces:**
- Service methods:
  - `getWorkspace(orderId): Promise<{ orderId; dogId; dogName; quantity; readyCount; slots: WorkspaceSlot[] }>`
  - `createFromTemplate(orderId, input: { sourceRecipeId: string; name?: string }, operatorId): Promise<{ seriesId; draftId; stageWarning: string|null }>`
  - `createBlank(orderId, operatorId): Promise<{ seriesId; draftId }>`
  - `stageDraft(orderId, designId, operatorId): Promise<{ status: 'READY'; recipeId; readyCount }>`
  - `removeSlot(orderId, designId, operatorId): Promise<void>`
- `WorkspaceSlot`: `{ designId, seriesId, draftId, name, status, recipeId, sourceRecipeId, stageWarning, updatedAt }`.
- Routes:
  - `GET /api/v1/recipe-designer/orders/:orderId/workspace`
  - `POST /api/v1/recipe-designer/orders/:orderId/designs/from-template`
  - `POST /api/v1/recipe-designer/orders/:orderId/designs/blank`
  - `POST /api/v1/recipe-designer/orders/:orderId/designs/:designId/ready`
  - `DELETE /api/v1/recipe-designer/orders/:orderId/designs/:designId`
- Clone requirements:
  - copy template items/ratios/weights/prep methods into a new `DesignRecipe` under a new order-bound `RecipeSeries`;
  - set `designMode=ORDER`, `orderId`, `orderQuantity`, `referenceDogId=customerDogId`, `customerDogId`;
  - set `sourceRecipeId/sourceKind` on slot;
  - do not mutate source;
  - enforce capacity `readyCount < order.recipeQuantity`;
  - same template reuse allowed.
- Stage (`POST .../ready`) requires ADMIN, because it uses the existing private-publish path; staff can design/save but cannot stage.
  - publish private custom recipe via existing private snapshot path/service;
  - ensure it is private/not delivered/not notified;
  - write READY slot;
  - idempotent if already READY.
- Do not use order page `deliverBatch`.

- [ ] **Step 1: Write failing tests** for workspace shape, clone content, locked dog, stage warning, capacity, same-template reuse, stage no delivery/notification.
- [ ] **Step 2: Run; expect fail.**
- [ ] **Step 3: Implement service/controller.**
- [ ] **Step 4: Run tests/build; expect pass.**
- [ ] **Step 5: Commit `feat: add order recipe design workspace`.**

## Task 4: Final submit, admin-only atomic delivery

**Files:**
- Modify: `backend/src/interfaces/controllers/custom-recipe/admin-custom-recipe.controller.ts`
- Modify: `backend/src/application/custom-recipe/custom-recipe.service.ts` or create `backend/src/application/custom-recipe/order-design-submit.service.ts`
- Create: `backend/tests/controllers/order-design-submit.controller.spec.ts`
- Create: `backend/tests/application/custom-recipe/order-design-submit.service.spec.ts`

**Interfaces:**
- Route: `POST /api/v1/admin/custom-recipe/orders/:orderId/submit-designs`, `AdminGuard`.
- Service `submitOrderDesigns(orderId, operatorId)`:
  - require exactly `recipeQuantity` READY slots;
  - all slots belong to order/dog;
  - call existing batch delivery with distinct private recipe IDs;
  - update all slots DELIVERED only after success;
  - one notification; idempotent;
  - no partial delivery.
- Reject new-flow orders with incomplete staging; legacy in-flight orders without slots keep old path.
- Guard order page single `deliver()` against new-flow orders (check designMode/slots) so N cannot be bypassed.

- [ ] **Step 1: Write failing tests** for N-ready success, incomplete reject, foreign slot reject, coordinator/admin-only, atomic failure, duplicate submit.
- [ ] **Step 2: Run; expect fail.**
- [ ] **Step 3: Implement endpoint/service/guard.**
- [ ] **Step 4: Run tests/build; expect pass.**
- [ ] **Step 5: Commit `feat: add atomic order design submission`.**

## Task 5: Admin API client and workspace UI

**Files:**
- Create: `admin-web/src/api/orderRecipeDesign.ts`
- Create: `admin-web/src/types/orderRecipeDesign.ts`
- Create: `admin-web/src/views/RecipeDesigner/OrderDesignWorkspace.vue`
- Create: `admin-web/src/views/RecipeDesigner/components/TemplatePickerDrawer.vue`
- Modify: `admin-web/src/router/index.ts`
- Modify: `admin-web/src/views/CustomRecipes/OrderDetail.vue` (design link to workspace)
- Test: `admin-web/src/views/RecipeDesigner/orderDesignWorkspace.regression.spec.ts`
- Test: `admin-web/src/utils/__tests__/orderRecipeDesign.spec.ts`

**Interfaces:**
- Route `/order-design/:orderId` (or chosen equivalent) opens workspace.
- Workspace uses Task 3 APIs; N slots, progress, template picker, open editor, remove, admin-only final submit.
- Lock dog in editor via existing `lockReferenceDog`.
- OrderDetail “开始设计/继续设计” goes to workspace, not `?dogId&openCreate=1`.

- [ ] **Step 1: Write failing UI/source tests** for slot list, progress, template picker, admin final button, staff waiting state, no leave-page requirement.
- [ ] **Step 2: Run; expect fail.**
- [ ] **Step 3: Implement API/types/workspace/template drawer/route/order link.**
- [ ] **Step 4: Run admin tests/build; expect pass.**
- [ ] **Step 5: Commit `feat: add order design workspace UI`.**

## Task 6: Editor template/staging integration

**Files:**
- Modify: `admin-web/src/views/RecipeDesigner/Editor.vue`
- Modify: `admin-web/src/views/RecipeDesigner/components/TemplatePickerDrawer.vue`
- Modify: `admin-web/src/views/RecipeDesigner/index.vue` (hide ORDER series from catalog list)
- Modify: `admin-web/src/views/RecipeDesigner/OrderDesignWorkspace.vue`
- Test: `admin-web/src/views/RecipeDesigner/orderDesignEditor.regression.spec.ts`

**Interfaces:**
- Order-mode editor top bar shows order ID/dog/N progress.
- Template picker available inside editor; choosing creates/replaces a slot draft (or only used at slot creation).
- “加入本单待提交” uses Task 3 ready endpoint; updates progress.
- N/N ready shows admin submit or staff waiting copy.
- Catalog editor has no order progress/staging/template requirement.

- [ ] **Step 1: Write failing source tests** for order header, template picker, ready action, staff waiting, catalog absence.
- [ ] **Step 2: Run; expect fail.**
- [ ] **Step 3: Implement editor context/staging integration.**
- [ ] **Step 4: Run admin tests/build; expect pass.**
- [ ] **Step 5: Commit `feat: integrate order staging into editor`.**

## Task 7: End-to-end acceptance

**Files:**
- Create: `docs/superpowers/acceptance/2026-10-22-order-bound-recipe.md`
- Test: backend/frontend existing suites.

- [ ] **Step 1: Document acceptance steps** with Foxy 2-份 order, template reuse, mismatch warning, 1/2 wait, final 2/2 admin delivery, single notification.
- [ ] **Step 2: Run backend full tests, admin full tests/build, miniapp tests if touched.**
- [ ] **Step 3: Deploy backend/admin after tests.**
- [ ] **Step 4: Manually verify Foxy workspace and final delivery.**
- [ ] **Step 5: Commit acceptance doc and report.**

## Self-Review

- Spec coverage: schema, template search, clone, workspace, staging, final atomic delivery, modes, warnings, reuse, roles, in-flight compatibility, UI.
- Type consistency: `OrderRecipeDesign`, `WorkspaceSlot`, `designId`, `recipeQuantity`, `READY/DELIVERED`.
- Review Focus tests assigned to Tasks 2/3/4.
- Execution method: user explicitly requested direct development; use subagent-driven implementation per task, then final whole-branch review.
