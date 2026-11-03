# Recipe Editor Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make recipe editing responsive by batching order persistence, deferring duplicate assessments, and avoiding full-list work during drag and text entry.

**Architecture:** The miniapp owns transient input and drag state, while the backend remains the authority for persisted items and assessment results. A batch order endpoint persists a complete validated order in one transaction; the existing assessment endpoint remains compatible but is called by a coalescing client scheduler after nutrition-affecting changes settle.

**Tech Stack:** Vue 3 / uni-app / Vitest, NestJS / Prisma / PostgreSQL, Jest.

---

### Task 1: Add pure client scheduling and order helpers

**Files:**
- Create: `miniapp/src/pages/recipe-designer/editor-performance.ts`
- Create: `miniapp/src/pages/recipe-designer/editor-performance.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it('keeps only the most recent scheduled assessment', async () => {
  const calls: number[] = []
  const scheduler = createLatestTaskScheduler(async (version) => calls.push(version), 0)
  scheduler.schedule(1)
  scheduler.schedule(2)
  await scheduler.flush()
  expect(calls).toEqual([2])
})

it('moves one identified item only when the drag ends', () => {
  expect(moveItemToIndex([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 'a', 2).map(({ id }) => id))
    .toEqual(['b', 'c', 'a'])
})
```

- [ ] **Step 2: Run the Vitest file and confirm the missing exports fail.**
- [ ] **Step 3: Implement the minimal scheduler and order helper.**
- [ ] **Step 4: Re-run the file and confirm it passes.**

### Task 2: Add and test batch ordering API

**Files:**
- Modify: `backend/src/interfaces/dto/recipe-designer/recipe-designer.dto.ts`
- Modify: `backend/src/interfaces/controllers/recipe-designer.controller.ts`
- Modify: `backend/src/application/recipe-designer/recipe-designer.service.ts`
- Modify: `backend/tests/interfaces/controllers/recipe-designer.controller.spec.ts`
- Modify: `backend/tests/application/recipe-designer/recipe-designer.service.spec.ts`

- [ ] **Step 1: Write controller and service tests for a complete order, duplicate IDs, missing IDs, and a foreign item.**
- [ ] **Step 2: Run the focused Jest tests and confirm the new route and service method fail.**
- [ ] **Step 3: Add `UpdateRecipeDesignItemOrderDto`, `PUT drafts/:id/item-order`, and `updateItemOrder`. Validate order membership once and update item positions in one transaction.**
- [ ] **Step 4: Re-run focused Jest tests and confirm the expected request reaches the service with the authenticated access context.**

### Task 3: Use the batch endpoint and responsive editor state

**Files:**
- Modify: `miniapp/src/api/recipe-designer.ts`
- Modify: `miniapp/src/api/recipe-designer.spec.ts`
- Modify: `miniapp/src/pages/recipe-designer/editor.vue`
- Modify: `miniapp/src/pages/recipe-designer.regression.spec.ts`

- [ ] **Step 1: Write API and regression tests requiring `updateItemOrder`, deferred assessment scheduling, local weight drafts, and a drag move that does not assign `items.value`.**
- [ ] **Step 2: Run the focused Vitest files and confirm the assertions fail.**
- [ ] **Step 3: Add the API wrapper; use local input drafts; schedule assessment after saved nutrition changes; capture row bounds once; move only on drop; call the batch endpoint once.**
- [ ] **Step 4: Run focused Vitest tests and confirm they pass.**

### Task 4: Add server-side assessment cache and database index

**Files:**
- Modify: `backend/src/application/recipe-designer/fediaf-target-provider.ts`
- Create: `backend/prisma/migrations/202607160001_add_design_recipe_item_order_index/migration.sql`
- Modify: `backend/prisma/schema.prisma`
- Test: `backend/tests/application/recipe-designer/fediaf-target-provider.spec.ts`

- [ ] **Step 1: Write a provider test that repeats one scenario and expects one database read.**
- [ ] **Step 2: Run the focused Jest test and confirm it fails.**
- [ ] **Step 3: Cache immutable mapped targets by scenario, add the composite Prisma index and migration SQL.**
- [ ] **Step 4: Re-run the test and Prisma schema validation.**

### Task 5: Verify, commit, merge, and deploy

**Files:**
- Modify: none unless verification exposes a defect.

- [ ] **Step 1: Run all touched Jest/Vitest suites, full backend build, and `miniapp` production build.**
- [ ] **Step 2: Validate the new migration against a disposable database or `prisma migrate diff`; inspect the worktree diff.**
- [ ] **Step 3: Commit intentional changes, merge the branch through the repository workflow, and push `main`.**
- [ ] **Step 4: Run the documented remote deployment script, then verify service health and the batch-order endpoint in production.**

## Self-review

- The plan maps every approved design decision to a task: local input/drag state (Tasks 1 and 3), one-call order persistence (Tasks 2 and 3), target caching and index (Task 4), and release verification (Task 5).
- All implementation steps name concrete files, behavior, and commands; no placeholder work remains.
- Types introduced by the API task are consumed by the miniapp task with the same `itemIds` contract.

