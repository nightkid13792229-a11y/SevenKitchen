# Dog Breed Search Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade miniapp breed search so create-profile and dog-overview pages support fuzzy matching, built-in breed associations, typo tolerance, and stable result ranking.

**Architecture:** Keep both pages on the existing shared `dog-breed-search.ts` entry point, but upgrade that module from boolean filtering to scored search. Add a small built-in breed association catalog inside miniapp utilities so improvements take effect immediately even when backend alias data is incomplete.

**Tech Stack:** Vue 3 + uni-app miniapp, TypeScript, Vitest

---

### Task 1: Strengthen Search Tests First

**Files:**
- Modify: `miniapp/src/utils/dog-breed-search.spec.ts`
- Test: `miniapp/src/utils/dog-breed-search.spec.ts`

- [ ] **Step 1: Add failing tests for association search, typo tolerance, and ranking**

```ts
it('returns related poodle results when searching teddy terms', () => {
  expect(filterBreedsByKeyword(breeds, '泰迪').map(breed => breed.id)).toEqual([
    'teddy',
    'mini-poodle',
    'standard-poodle',
  ])
})

it('matches common shorthand aliases that are not stored in backend data', () => {
  expect(filterBreedsByKeyword(breeds, '边境牧羊犬').map(breed => breed.id)).toEqual([
    'border-collie',
  ])
})

it('tolerates small misspellings for common breeds', () => {
  expect(filterBreedsByKeyword(breeds, '雪纳锐').map(breed => breed.id)).toEqual([
    'mini-schnauzer',
  ])
})
```

- [ ] **Step 2: Run the targeted test to verify red**

Run: `pnpm test -- src/utils/dog-breed-search.spec.ts`
Expected: FAIL because current search only does simple `includes` matching.

### Task 2: Implement Scored Search and Built-In Breed Associations

**Files:**
- Create: `miniapp/src/utils/dog-breed-search-catalog.ts`
- Modify: `miniapp/src/utils/dog-breed-search.ts`
- Test: `miniapp/src/utils/dog-breed-search.spec.ts`

- [ ] **Step 1: Add a small built-in catalog for high-frequency breed associations**

```ts
export const BUILTIN_BREED_SEARCH_ALIASES: Record<string, string[]> = {
  '泰迪': ['泰迪犬', '玩具贵宾犬', '贵宾犬'],
  '贵宾犬(小型)': ['贵宾犬', '迷你贵宾犬', '泰迪'],
  '贵宾犬(标准)': ['贵宾犬', '标准贵宾犬', '大贵宾'],
  '边牧': ['边境牧羊犬'],
  '雪纳瑞(小型)': ['雪纳瑞', '小型雪纳瑞'],
  '法国斗牛犬': ['法斗', '法牛'],
  '拉布拉多': ['拉拉'],
  '德牧': ['德国牧羊犬'],
  '柯基': ['威尔士柯基'],
}
```

- [ ] **Step 2: Replace plain filter logic with scored matching**

```ts
type MatchScore = 100 | 95 | 90 | 80 | 70 | 0

function getBreedMatchScore(breed: SearchableBreed, keyword: string): number {
  // exact > prefix > contains > typo
}
```

- [ ] **Step 3: Keep page call sites unchanged**

`dog-create` and `dog-profile-overview` continue calling `filterBreedsByKeyword(...)`, so no template or event-flow changes are required.

- [ ] **Step 4: Run targeted tests to verify green**

Run: `pnpm test -- src/utils/dog-breed-search.spec.ts`
Expected: PASS

### Task 3: Verify Shared Page Behavior Stays Stable

**Files:**
- Modify: `miniapp/src/utils/dog-breed-search.spec.ts`
- Test: `miniapp/src/utils/dog-breed-search.spec.ts`

- [ ] **Step 1: Add regression coverage for existing alias behavior and empty-keyword behavior**

```ts
it('returns empty results for blank keywords', () => {
  expect(filterBreedsByKeyword(breeds, '   ')).toEqual([])
})

it('still matches backend-provided aliases after normalization', () => {
  expect(filterBreedsByKeyword(breeds, ' labrador  retriever ').map(breed => breed.id)).toEqual([
    'labrador',
  ])
})
```

- [ ] **Step 2: Run full miniapp utility tests related to breed search**

Run: `pnpm test -- src/utils/dog-breed-search.spec.ts src/utils/dog-breed-ui.spec.ts src/utils/dog-profile-overview.spec.ts`
Expected: PASS

### Task 4: Optional Fresh-Data Consistency Cleanup

**Files:**
- Modify: `backend/prisma/seed-dog-breeds.ts`
- Modify: `backend/prisma/seed-dog-breeds-200.ts`

- [ ] **Step 1: Align high-frequency seed data with the new search vocabulary**

Add `aliases` for high-frequency breeds in seed source files where practical so future environments start with more complete data.

- [ ] **Step 2: Keep seed behavior backward compatible**

Do not change IDs or seeding flow semantics; only enrich breed metadata.

- [ ] **Step 3: Run a lightweight syntax-level verification**

Run: `node -c prisma/seed-dog-breeds.ts && node -c prisma/seed-dog-breeds-200.ts`
Expected: exit code `0`
