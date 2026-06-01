# Recipe Designer Assessment Position Restore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the nutrition assessment drawer on the user's last category and scroll position after they edit ingredient weights and reopen the drawer.

**Architecture:** Store a scroll offset per assessment category inside the editor page. Render the assessment body as a `scroll-view` bound to the selected category's saved scroll position, and reapply that position after assessment refreshes and category switches.

**Tech Stack:** Vue 3 composition API, uni-app `scroll-view`, Vitest source regression tests, WeChat Mini Program preview build.

---

## File Structure

- Modify: `miniapp/src/pages/recipe-designer/editor.vue`
  - Owns the assessment drawer UI and state.
  - Adds category scroll state, scroll event handling, and restore hooks after refresh/category switch.
- Modify: `miniapp/src/pages/recipe-designer.regression.spec.ts`
  - Adds a source-level regression test that verifies the drawer uses `scroll-view`, binds `scroll-top`, stores per-category scroll offsets, and restores them after refresh.
- Read-only reference: `docs/superpowers/specs/2026-05-30-recipe-designer-assessment-position-restore-design.md`
  - Confirms the feature should restore category plus scroll position, not infer a specific nutrient.

---

### Task 1: Add Failing Regression Coverage

**Files:**
- Modify: `miniapp/src/pages/recipe-designer.regression.spec.ts`
- Test: `miniapp/src/pages/recipe-designer.regression.spec.ts`

- [ ] **Step 1: Insert the failing regression test**

Add this test after the existing `renders compact categorized nutrition assessment rows` test:

```ts
  it('restores the nutrition assessment category scroll position after ingredient edits', () => {
    expect(editorSource).toContain('<scroll-view v-if="assessmentListVisible" scroll-y class="assessment-list"')
    expect(editorSource).toContain(':scroll-top="assessmentScrollTop"')
    expect(editorSource).toContain('@scroll="onAssessmentListScroll"')
    expect(editorSource).toContain('const assessmentScrollTopByCategory = ref<Partial<Record<AssessmentCategoryKey, number>>>({})')
    expect(editorSource).toContain('const assessmentScrollTop = ref(0)')
    expect(editorSource).toContain('function onAssessmentListScroll')
    expect(editorSource).toContain('function restoreAssessmentScrollPosition')
    expect(editorSource).toContain('rememberAssessmentScrollPosition()')
    expect(editorSource).toContain('restoreAssessmentScrollPosition(selectedAssessmentCategory.value)')
    expect(editorSource).not.toContain('<view v-if="assessmentListVisible" class="assessment-list">')
  })
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
cd miniapp && npm test -- src/pages/recipe-designer.regression.spec.ts
```

Expected: FAIL because `editor.vue` still renders the assessment list with a plain `view`, and the new scroll state/functions do not exist.

- [ ] **Step 3: Commit the failing test only**

Run:

```bash
git add miniapp/src/pages/recipe-designer.regression.spec.ts
git commit -m "test: cover assessment position restore"
```

---

### Task 2: Restore Assessment Category Scroll Position

**Files:**
- Modify: `miniapp/src/pages/recipe-designer/editor.vue`
- Test: `miniapp/src/pages/recipe-designer.regression.spec.ts`

- [ ] **Step 1: Add scroll state near the existing assessment drawer refs**

In `editor.vue`, place these refs after `selectedAssessmentCategory`:

```ts
const assessmentScrollTopByCategory = ref<Partial<Record<AssessmentCategoryKey, number>>>({})
const assessmentScrollTop = ref(0)
```

- [ ] **Step 2: Replace the assessment body wrapper with a scroll-view**

Replace:

```vue
      <view v-if="assessmentListVisible" class="assessment-list">
```

with:

```vue
      <scroll-view
        v-if="assessmentListVisible"
        scroll-y
        class="assessment-list"
        :scroll-top="assessmentScrollTop"
        @scroll="onAssessmentListScroll"
      >
```

Replace the matching closing tag for that wrapper:

```vue
      </view>
```

with:

```vue
      </scroll-view>
```

Keep the nested `assessment-list-surface` and all nutrient row markup unchanged.

- [ ] **Step 3: Add scroll persistence helpers near `selectAssessmentCategory`**

Add these functions before `selectAssessmentCategory`:

```ts
function normalizeAssessmentScrollTop(value: unknown) {
  const scrollTop = Number(value)
  return Number.isFinite(scrollTop) && scrollTop > 0 ? scrollTop : 0
}

function getAssessmentScrollTop(category: AssessmentCategoryKey) {
  return normalizeAssessmentScrollTop(assessmentScrollTopByCategory.value[category])
}

function rememberAssessmentScrollPosition(category: AssessmentCategoryKey = selectedAssessmentCategory.value) {
  assessmentScrollTopByCategory.value = {
    ...assessmentScrollTopByCategory.value,
    [category]: normalizeAssessmentScrollTop(assessmentScrollTop.value),
  }
}

function restoreAssessmentScrollPosition(category: AssessmentCategoryKey = selectedAssessmentCategory.value) {
  assessmentScrollTop.value = getAssessmentScrollTop(category)
}

function onAssessmentListScroll(event: any) {
  const scrollTop = normalizeAssessmentScrollTop(event.detail?.scrollTop)
  assessmentScrollTop.value = scrollTop
  assessmentScrollTopByCategory.value = {
    ...assessmentScrollTopByCategory.value,
    [selectedAssessmentCategory.value]: scrollTop,
  }
}
```

- [ ] **Step 4: Update category selection to save and restore positions**

Replace the current `selectAssessmentCategory` body:

```ts
function selectAssessmentCategory(key: AssessmentCategoryKey, expandDrawer = false) {
  selectedAssessmentCategory.value = key
  if (expandDrawer && !assessmentListVisible.value) {
    setAssessmentExpanded(true)
  }
}
```

with:

```ts
function selectAssessmentCategory(key: AssessmentCategoryKey, expandDrawer = false) {
  rememberAssessmentScrollPosition()
  selectedAssessmentCategory.value = key
  if (expandDrawer && !assessmentListVisible.value) {
    setAssessmentExpanded(true)
  }
  void nextTick(() => restoreAssessmentScrollPosition(key))
}
```

- [ ] **Step 5: Restore after assessment refreshes**

In `refreshAssessment()`, after `refreshDetailModalFromAssessment()`, add:

```ts
  await nextTick()
  restoreAssessmentScrollPosition(selectedAssessmentCategory.value)
```

The function should end as:

```ts
async function refreshAssessment() {
  const res: any = await recipeDesignerApi.assessDraft(draftId.value)
  const data = res?.data ?? res
  assessment.value = data
  const assessedItems = data?.items || data?.draft?.items
  if (Array.isArray(assessedItems)) {
    items.value = mergeAssessedItems(items.value, assessedItems)
  }
  refreshDetailModalFromAssessment()
  await nextTick()
  restoreAssessmentScrollPosition(selectedAssessmentCategory.value)
}
```

- [ ] **Step 6: Preserve or reset category deliberately when assessment data changes**

Replace the existing `watch(assessmentCategories, ...)` body with:

```ts
watch(assessmentCategories, (categories) => {
  const activeGroup = categories.find((group) => group.key === selectedAssessmentCategory.value)
  if (activeGroup && activeGroup.entries.length > 0) {
    void nextTick(() => restoreAssessmentScrollPosition(selectedAssessmentCategory.value))
    return
  }

  const fallbackCategory =
    categories.find((group) => getAssessmentCategoryAttentionCount(group) > 0)?.key || 'MACRO'
  selectedAssessmentCategory.value = fallbackCategory
  void nextTick(() => restoreAssessmentScrollPosition(fallbackCategory))
})
```

- [ ] **Step 7: Run the focused regression test and verify it passes**

Run:

```bash
cd miniapp && npm test -- src/pages/recipe-designer.regression.spec.ts
```

Expected: PASS.

- [ ] **Step 8: Commit the implementation**

Run:

```bash
git add miniapp/src/pages/recipe-designer/editor.vue
git commit -m "fix: restore assessment drawer scroll position"
```

---

### Task 3: Build Verification

**Files:**
- No source changes expected.
- Validate: `miniapp/dist/dev/mp-weixin`

- [ ] **Step 1: Run the miniapp preview build**

Run:

```bash
cd miniapp && npm run preview
```

Expected: command completes successfully and generates the WeChat Mini Program preview output under:

```text
miniapp/dist/dev/mp-weixin
```

- [ ] **Step 2: Check git status**

Run:

```bash
git status --short
```

Expected: only intentional tracked changes remain, or the working tree is clean if all implementation commits were created.

