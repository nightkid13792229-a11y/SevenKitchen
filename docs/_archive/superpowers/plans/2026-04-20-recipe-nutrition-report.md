# Recipe Nutrition Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin PDF upload and miniapp download/open support for recipe nutrition reports.

**Architecture:** Reuse the existing `Recipe.nutritionReportUrl` field. Add a dedicated PDF upload endpoint, persist and return the field through recipe APIs, and render a conditional miniapp action that opens the PDF document.

**Tech Stack:** NestJS, Prisma, Tencent COS, Vue 3, Element Plus, UniApp, Vitest/Jest.

---

### Task 1: Backend Report Field and Upload

**Files:**
- Modify: `backend/src/interfaces/controllers/admin.controller.ts`
- Modify: `backend/src/interfaces/controllers/recipes.controller.ts`
- Modify: `backend/src/application/recipe/recipe.service.ts`
- Modify: `backend/src/interfaces/dto/recipes/admin-recipe.dto.ts`
- Modify: `backend/src/interfaces/dto/recipes/recipe-response.dto.ts`
- Test: `backend/tests/interfaces/controllers/admin.controller.spec.ts`
- Test: `backend/tests/interfaces/controllers/recipes.controller.spec.ts`
- Test: `backend/tests/application/recipe/recipe.service.spec.ts`

- [ ] Write failing tests for rejecting non-PDF admin report uploads, storing uploads in `recipe-nutrition-reports`, and returning `nutritionReportUrl` from recipe detail APIs.
- [ ] Implement the dedicated `POST /api/v1/admin/recipes/upload-nutrition-report` endpoint with PDF validation.
- [ ] Include `nutritionReportUrl` in create, update, duplicate, admin detail, and public detail mapping.
- [ ] Run focused backend Jest tests and fix failures.

### Task 2: Admin Web Upload Entry

**Files:**
- Modify: `admin-web/src/api/recipes.ts`
- Modify: `admin-web/src/types/recipe.ts`
- Modify: `admin-web/src/views/Recipes/RecipeForm.vue`

- [ ] Add `nutritionReportUrl` to admin recipe types.
- [ ] Add `recipeApi.uploadNutritionReport(file)`.
- [ ] Add PDF upload, view, remove, and replace controls to the recipe form.
- [ ] Ensure create/update payloads include `nutritionReportUrl`.
- [ ] Run admin build/type-check.

### Task 3: Miniapp Download Entry

**Files:**
- Modify: `miniapp/src/pages/recipe-detail/index.vue`
- Test: `miniapp/src/pages/recipe-detail.regression.spec.ts`

- [ ] Write a regression test that checks the source only renders the report entry when `recipe.nutritionReportUrl` exists and uses `uni.downloadFile` plus `uni.openDocument`.
- [ ] Add `nutritionReportUrl` to the miniapp recipe detail type.
- [ ] Render the conditional report entry below the core nutrition section.
- [ ] Implement PDF download/open error handling.
- [ ] Run miniapp focused test and WeChat build.

### Task 4: Final Verification

**Files:**
- Verify all modified files with `git diff`.

- [ ] Run backend focused tests.
- [ ] Run `npm run build` in `admin-web`.
- [ ] Run `npm run test -- recipe-detail.regression.spec.ts` in `miniapp`.
- [ ] Run `npm run build:mp-weixin` in `miniapp`.
- [ ] Keep the WeChat DevTools verification path on `miniapp/dist/build/mp-weixin`; do not sync to `/Users/zhaochen/Documents/SevenKitchen-miniapp-preview` unless explicitly requested.
