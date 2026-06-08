# Recipe Designer Mobile Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the miniapp recipe designer editing flow so ingredient picking is stable, nutrition assessment dragging is forgiving, empty stage visits do not become review states, and new life stages can start from published-stage ingredient templates.

**Architecture:** Keep visual fixes in the existing miniapp editor component and source-level regression tests. Add a backend-supported `sourceDraftId` option to stage draft creation so template copying is atomic, permission-checked, and preserves ingredient structure while keeping the target life stage editable.

**Tech Stack:** Uni-app Vue 3 miniapp, Vitest source regression tests, NestJS service/controller, Prisma, Jest backend tests.

---

### Task 1: Lock Miniapp UX Contracts

**Files:**
- Modify: `miniapp/src/pages/recipe-designer.regression.spec.ts`
- Modify: `miniapp/src/api/recipe-designer.spec.ts`

- [ ] Add failing regression checks that the ingredient picker has fixed header/body/footer structure, the assessment drag handler is bound to the full drawer header area rather than only a tiny grip, the stage creation payload can include `sourceDraftId`, and the list page presents template choices for stages without a draft.
- [ ] Run `cd miniapp && npm test -- src/pages/recipe-designer.regression.spec.ts src/api/recipe-designer.spec.ts` and confirm the new checks fail.

### Task 2: Lock Backend Stage Copy And Review-State Contracts

**Files:**
- Modify: `backend/tests/application/recipe-designer/recipe-designer.service.spec.ts`
- Modify: `backend/tests/interfaces/controllers/recipe-designer.controller.spec.ts`

- [ ] Add failing tests that `createSeriesStageDraft` copies items from a same-series published source design when `sourceDraftId` is provided.
- [ ] Add failing tests that assessing an empty draft keeps status `DRAFT` and `reviewStatus` `NONE`, so a no-op visit does not become `IN_REVIEW`.
- [ ] Add controller/DTO contract coverage for `sourceDraftId`.
- [ ] Run targeted Jest tests and confirm the new checks fail.

### Task 3: Implement Backend Behavior

**Files:**
- Modify: `backend/src/interfaces/dto/recipe-designer/recipe-designer.dto.ts`
- Modify: `backend/src/application/recipe-designer/recipe-designer.service.ts`

- [ ] Add optional `sourceDraftId` to `CreateRecipeSeriesStageDraftDto`.
- [ ] In `createSeriesStageDraft`, when creating a new target draft, validate the source design belongs to the same series, is published, and has items; copy item structure into the new draft.
- [ ] Adjust assessment persistence so zero-included-item drafts remain `DRAFT`/`NONE`.
- [ ] Run backend targeted tests until green.

### Task 4: Implement Miniapp Behavior

**Files:**
- Modify: `miniapp/src/api/recipe-designer.ts`
- Modify: `miniapp/src/pages/recipe-designer/list.vue`
- Modify: `miniapp/src/pages/recipe-designer/editor.vue`

- [ ] Add `sourceDraftId` typing and API payload forwarding.
- [ ] On the series list, for an uncreated stage with published template candidates, show an action sheet: blank start or copy one published stage.
- [ ] In the editor, make the picker panel a flex column with fixed header/search and fixed footer, and make only the middle list scroll.
- [ ] Move nutrition assessment drag handlers to the top header/handle area, leaving no explicit expand/collapse button.
- [ ] Run miniapp targeted tests until green.

### Task 5: Verify

**Files:**
- No production edits.

- [ ] Run `cd miniapp && npm test -- src/pages/recipe-designer.regression.spec.ts src/api/recipe-designer.spec.ts`.
- [ ] Run targeted backend Jest tests.
- [ ] Run type/build checks if targeted tests expose compile issues.
- [ ] Review `git diff` for unrelated changes.
