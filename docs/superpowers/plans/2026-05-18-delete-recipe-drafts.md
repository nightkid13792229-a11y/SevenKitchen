# Delete Recipe Drafts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow staff to hard-delete their own unpublished recipe design drafts from the mobile draft list.

**Architecture:** Backend owns deletion safety: it looks up the draft by id, verifies ownership, rejects published drafts, and deletes the draft so related items cascade. The miniapp exposes a delete action in the draft list, asks for confirmation, calls the backend API, and removes the draft from the visible list.

**Tech Stack:** NestJS, Prisma, Jest, Vue 3, uni-app, Vitest.

---

### Task 1: Backend Delete Draft Endpoint

**Files:**
- Modify: `backend/src/application/recipe-designer/recipe-designer.service.ts`
- Modify: `backend/src/interfaces/controllers/recipe-designer.controller.ts`
- Test: `backend/tests/application/recipe-designer/recipe-designer.service.spec.ts`
- Test: `backend/tests/interfaces/controllers/recipe-designer.controller.spec.ts`

- [ ] Add service tests for deleting an unpublished owned draft, rejecting a published draft, and hiding non-owned drafts as not found.
- [ ] Implement `deleteDraft(id, userId)` using `findUnique` followed by `delete`.
- [ ] Add `DELETE /api/v1/recipe-designer/drafts/:id` and pass `CurrentUser.userId`.
- [ ] Run backend recipe-designer service and controller tests.

### Task 2: Miniapp Draft List Delete Action

**Files:**
- Modify: `miniapp/src/api/recipe-designer.ts`
- Modify: `miniapp/src/api/recipe-designer.spec.ts`
- Modify: `miniapp/src/pages/recipe-designer/list.vue`
- Modify: `miniapp/src/pages/recipe-designer.regression.spec.ts`

- [ ] Add `recipeDesignerApi.deleteDraft(draftId)` with `DELETE /recipe-designer/drafts/:id`.
- [ ] Add a delete button on each draft card unless the draft is published.
- [ ] Confirm before deleting with `uni.showModal`.
- [ ] On success, remove the draft locally and show a success toast.
- [ ] Run focused miniapp tests and the full miniapp test suite.

### Task 3: Verification

**Files:**
- No production files beyond Tasks 1 and 2.

- [ ] Run `npm test` for focused backend tests.
- [ ] Run `npm test` for focused miniapp tests.
- [ ] Run `npm run build:mp-weixin`.
- [ ] Verify the local API can delete an unpublished draft and refuses a published draft or non-owned draft.
- [ ] Commit the completed change.
