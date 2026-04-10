# Dog Hot Breeds Top 10 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace manually maintained "common breeds" shortcuts with an automatically ranked Top 10 list of hot standard breeds on the dog-create flow, and remove the admin UI for manually curating common breeds.

**Architecture:** Keep breed metadata loading through the existing dog APIs, but add a dedicated backend endpoint that aggregates `dog.breed_id` usage, excludes the mixed-breed virtual ID, and returns the corresponding standard breed records in usage order. The miniapp dog-create page will consume that endpoint for the shortcut section, while admin breed management will stop exposing `isCommon`-driven curation controls.

**Tech Stack:** NestJS, Prisma, Vue 3 `script setup`, uni-app, Element Plus, Jest, Vitest

---

### Task 1: Add a hot standard breeds API under TDD

**Files:**
- Modify: `backend/tests/interfaces/controllers/dogs.controller.spec.ts`
- Modify: `backend/src/domain/dog/dog-breed.repository.ts`
- Modify: `backend/src/infrastructure/repositories/prisma-dog-breed.repository.ts`
- Modify: `backend/src/interfaces/controllers/dogs.controller.ts`

- [ ] **Step 1: Write the failing test**

Add a controller test that calls `GET /dogs/breeds/hot` and asserts the response:
- returns standard breeds ordered by usage count descending
- excludes the mixed-breed virtual ID
- limits the result set to 10 items

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand tests/interfaces/controllers/dogs.controller.spec.ts`
Expected: FAIL because the route and repository aggregation do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Add a repository method that groups `dog` rows by `breedId`, filters out the mixed-breed virtual ID, joins back to `dog_breed`, and returns the top 10 standard breed records in usage order. Expose that through a new `GET /dogs/breeds/hot` controller action.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand tests/interfaces/controllers/dogs.controller.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-04-10-dog-hot-breeds-top10.md backend/tests/interfaces/controllers/dogs.controller.spec.ts backend/src/domain/dog/dog-breed.repository.ts backend/src/infrastructure/repositories/prisma-dog-breed.repository.ts backend/src/interfaces/controllers/dogs.controller.ts
git commit -m "feat: add hot standard breed ranking API"
```

### Task 2: Switch the miniapp create flow to hot breeds

**Files:**
- Modify: `miniapp/src/pages/dog-create/index.vue`
- Modify: `miniapp/src/api/dogs.ts`

- [ ] **Step 1: Write the failing test**

Add or update a miniapp regression test so it asserts the create page:
- loads hot breeds through a dedicated API method
- labels the collapsed shortcut section as hot breeds
- no longer derives the shortcut list from `isCommon`

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/pages/dog-profile-create-view.spec.ts src/utils/dog-profile-create-actions.spec.ts`
Expected: FAIL because the page still uses `isCommon`-filtered breed metadata for the shortcut area.

- [ ] **Step 3: Write minimal implementation**

Add `dogApi.hotBreeds()` and update the create page to render the shortcut chips from that list while preserving the existing breed search and mixed-breed manual entry flows.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/pages/dog-profile-create-view.spec.ts src/utils/dog-profile-create-actions.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add miniapp/src/api/dogs.ts miniapp/src/pages/dog-create/index.vue
git commit -m "feat: show hot breeds in dog create flow"
```

### Task 3: Remove manual common-breed curation from admin

**Files:**
- Modify: `admin-web/src/views/Breeds/index.vue`
- Modify: `admin-web/src/views/Breeds/BreedTable.vue`
- Delete: `admin-web/src/views/Breeds/CommonBreedsManager.vue`

- [ ] **Step 1: Write the failing check**

Define the intended admin behavior:
- no dedicated "常见品种管理" card
- no "加入常见/已在常见" action in the breed table
- breed CRUD and custom-breed statistics remain intact

- [ ] **Step 2: Run build to capture the current baseline**

Run: `npm run build`
Expected: PASS before the cleanup, giving a clean baseline for the view changes.

- [ ] **Step 3: Write minimal implementation**

Remove the common-breed management card and the toggle action UI, then delete the now-unused `CommonBreedsManager` component.

- [ ] **Step 4: Run build to verify it passes**

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add admin-web/src/views/Breeds/index.vue admin-web/src/views/Breeds/BreedTable.vue admin-web/src/views/Breeds/CommonBreedsManager.vue
git commit -m "refactor: remove manual common breed management"
```
