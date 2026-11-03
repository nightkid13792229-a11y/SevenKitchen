# Recipe Designer Admin Status Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add administrator-facing recipe designer filtering that aligns with Web admin recipe categories: draft, published, and private custom recipes.

**Architecture:** Keep `DesignRecipeStatus` as the design workflow status and introduce a recipe-management category mapping at the recipe designer series API boundary. The backend computes each series stage category from linked `Recipe.status` and design draft state, filters series by an optional `status` query, and returns the category to the miniapp. The miniapp shows a segmented filter only for staff/admin mode.

**Tech Stack:** NestJS, Prisma, Jest, uni-app Vue 3, Vitest.

---

## File Structure

- `backend/src/interfaces/dto/recipe-designer/recipe-designer.dto.ts`  
  Add a list-series query DTO accepting `DRAFT`, `PUBLIC`, or `PRIVATE_CUSTOM`.

- `backend/src/interfaces/controllers/recipe-designer.controller.ts`  
  Accept the list-series query DTO and pass it to the service.

- `backend/src/application/recipe-designer/recipe-designer.service.ts`  
  Compute `recipeStatusCategory` for each stage and filter cards server-side.

- `backend/tests/application/recipe-designer/recipe-designer.service.spec.ts`  
  Add service-level tests for category precedence and filtering.

- `backend/tests/interfaces/controllers/recipe-designer.controller.spec.ts`  
  Lock controller delegation of the list-series query.

- `miniapp/src/api/recipe-designer.ts`  
  Add client types and optional `status` query for list-series.

- `miniapp/src/pages/recipe-designer/list.vue`  
  Add staff/admin-only segmented filter and request filtered series from the backend.

- `miniapp/src/pages/recipe-designer.regression.spec.ts`  
  Lock the admin-only filter UI and API usage.

## Tasks

### Task 1: Backend Contract Tests

- [ ] Add service tests proving `PRIVATE_CUSTOM` wins over `PUBLIC`, `PUBLIC` wins over design drafts, and `DRAFT` includes unpublished designs or draft recipes.
- [ ] Add service tests proving `listSeries(access, { status })` returns only matching series cards.
- [ ] Add controller tests proving `GET /series` passes query DTO plus access context to the service.
- [ ] Run targeted backend tests and confirm the new tests fail before implementation.

### Task 2: Backend Implementation

- [ ] Add the list-series query DTO.
- [ ] Update controller method signature.
- [ ] Add stage category calculation and server-side filtering.
- [ ] Run targeted backend tests and confirm they pass.

### Task 3: Miniapp Contract Tests

- [ ] Add regression expectations for the staff/admin-only category filter.
- [ ] Add regression expectations for `recipeDesignerApi.listSeries({ status })`.
- [ ] Run targeted miniapp tests and confirm they fail before implementation.

### Task 4: Miniapp Implementation

- [ ] Add API query typing.
- [ ] Add the segmented filter to `list.vue` for internal users only.
- [ ] Ensure customer mode still hides published/admin classification language.
- [ ] Run targeted miniapp tests and confirm they pass.

### Task 5: Verification

- [ ] Run backend targeted tests.
- [ ] Run miniapp targeted tests.
- [ ] Review `git diff` for unrelated changes.
