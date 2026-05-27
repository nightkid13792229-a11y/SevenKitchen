# Recipe Designer Nutrition Assessment UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the recipe designer editor's flat nutrition assessment drawer with a compact, categorized assessment view that shows standard context, category alert bubbles, dry-matter percentage, and range-position bars.

**Architecture:** Keep the backend assessment contract unchanged. Add frontend-only helpers in `miniapp/src/pages/recipe-designer/assessment.ts` to normalize grouped entries into five visible categories, then update `editor.vue` to render fixed category tabs and compact nutrient rows. Use existing `groupedEntries/details` to pick the energy-basis detail and dry-matter detail.

**Tech Stack:** Vue 3 `script setup`, uni-app mp-weixin, TypeScript, Vitest regression tests.

---

### Task 1: Regression Tests For New Assessment Shape

**Files:**
- Modify: `miniapp/src/pages/recipe-designer.regression.spec.ts`
- Test: `miniapp/src/pages/recipe-designer.regression.spec.ts`

- [ ] **Step 1: Write failing source regression assertions**

Add assertions to the existing `recipe designer editor guardrails` suite:

```ts
it('renders compact categorized nutrition assessment rows', () => {
  expect(editorSource).toContain('assessment-category-tabs')
  expect(editorSource).toContain('assessment-category-badge')
  expect(editorSource).toContain('selectedAssessmentCategory')
  expect(editorSource).toContain('visibleAssessmentEntries')
  expect(editorSource).toContain('formatAssessmentBasisLabel')
  expect(editorSource).toContain('formatDryMatterPercent')
  expect(editorSource).toContain('getAssessmentRangeStyle')
  expect(editorSource).toContain('下限')
  expect(editorSource).toContain('上限')
  expect(editorSource).toContain('当前')
  expect(editorSource).not.toContain('summary-grid')
  expect(editorSource).not.toContain('按需关注优先')
})
```

Add helper import assertions:

```ts
import {
  buildAssessmentCategories,
  getAssessmentCategoryLabel,
  getAssessmentCategoryTitle,
  getAssessmentCategoryAttentionCount,
  getAssessmentDisplayEntry,
} from './recipe-designer/assessment'
```

Add a real helper behavior test:

```ts
describe('recipe designer assessment categorization', () => {
  it('builds the five fixed categories with red-badge attention counts and display details', () => {
    const categories = buildAssessmentCategories([
      {
        nutrientKey: 'crude_fat',
        label: '粗脂肪',
        category: 'MACRO',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'g',
        minValue: 13.8,
        maxValue: 60,
        currentValue: 12.2,
        status: 'DEFICIENT',
        details: [
          {
            nutrientKey: 'crude_fat',
            label: '粗脂肪',
            category: 'MACRO',
            expressionBasis: 'PER_1000_KCAL_ME',
            unit: 'g',
            minValue: 13.8,
            maxValue: 60,
            currentValue: 12.2,
            status: 'DEFICIENT',
          },
          {
            nutrientKey: 'crude_fat',
            label: '粗脂肪',
            category: 'MACRO',
            expressionBasis: 'PER_100G_DRY_MATTER',
            unit: '%',
            minValue: null,
            maxValue: null,
            currentValue: 7.1,
            status: 'COMPLIANT',
          },
        ],
      },
      {
        nutrientKey: 'vitamin_a',
        label: '维生素A',
        category: 'VITAMIN',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'IU',
        minValue: 1250,
        maxValue: 100000,
        currentValue: null,
        status: 'MISSING_DATA',
      },
    ])

    expect(categories.map((category) => category.key)).toEqual([
      'MACRO',
      'AMINO_ACID',
      'FATTY_ACID',
      'MINERAL',
      'VITAMIN',
    ])
    expect(getAssessmentCategoryLabel('MINERAL')).toBe('微量')
    expect(getAssessmentCategoryTitle('MINERAL')).toBe('微量元素')
    expect(getAssessmentCategoryAttentionCount(categories[0])).toBe(1)
    expect(getAssessmentCategoryAttentionCount(categories[4])).toBe(1)
    expect(getAssessmentDisplayEntry(categories[0].entries[0]).dryMatterValue).toBe(7.1)
  })
})
```

- [ ] **Step 2: Run focused miniapp regression test to verify RED**

Run:

```bash
cd miniapp && npm test -- src/pages/recipe-designer.regression.spec.ts
```

Expected before implementation: FAIL because `buildAssessmentCategories` and the compact drawer markup do not exist yet.

### Task 2: Assessment Normalization Helpers

**Files:**
- Modify: `miniapp/src/pages/recipe-designer/assessment.ts`
- Test: `miniapp/src/pages/recipe-designer.regression.spec.ts`

- [ ] **Step 1: Add frontend assessment view types and helpers**

Add:

```ts
export type AssessmentCategoryKey = 'MACRO' | 'AMINO_ACID' | 'FATTY_ACID' | 'MINERAL' | 'VITAMIN'

export interface AssessmentEntryLike {
  nutrientKey?: string
  key?: string
  label?: string
  name?: string
  nutrientName?: string
  category?: string
  expressionBasis?: string
  unit?: string
  minValue?: number | null
  targetMin?: number | null
  min?: number | null
  maxValue?: number | null
  targetMax?: number | null
  max?: number | null
  currentValue?: number | null
  current?: number | null
  actual?: number | null
  value?: number | null
  status?: string
  details?: AssessmentEntryLike[]
}

export interface AssessmentCategoryGroup {
  key: AssessmentCategoryKey
  entries: AssessmentEntryLike[]
}
```

Implement helpers:

```ts
export const ASSESSMENT_CATEGORY_ORDER: AssessmentCategoryKey[] = [
  'MACRO',
  'AMINO_ACID',
  'FATTY_ACID',
  'MINERAL',
  'VITAMIN',
]

export function buildAssessmentCategories(entries: AssessmentEntryLike[] = []): AssessmentCategoryGroup[]
export function getAssessmentCategoryLabel(key: AssessmentCategoryKey): string
export function getAssessmentCategoryTitle(key: AssessmentCategoryKey): string
export function getAssessmentCategoryAttentionCount(group: AssessmentCategoryGroup): number
export function getAssessmentDisplayEntry(entry: AssessmentEntryLike): {
  basisEntry: AssessmentEntryLike
  dryMatterValue: number | null
}
```

Sorting order inside each category: `MISSING_DATA`, `EXCESS`, `DEFICIENT`, `COMPLIANT`.

- [ ] **Step 2: Re-run focused miniapp regression test**

Run:

```bash
cd miniapp && npm test -- src/pages/recipe-designer.regression.spec.ts
```

Expected after helper implementation but before template changes: FAIL only on missing editor markup/source assertions.

### Task 3: Compact Drawer Template And Styles

**Files:**
- Modify: `miniapp/src/pages/recipe-designer/editor.vue`
- Test: `miniapp/src/pages/recipe-designer.regression.spec.ts`

- [ ] **Step 1: Import new helpers**

Update the assessment imports:

```ts
import {
  buildAssessmentCategories,
  getAssessmentCategoryAttentionCount,
  getAssessmentCategoryLabel,
  getAssessmentCategoryTitle,
  getAssessmentDisplayEntry,
  getAssessmentStatusClass,
  getAssessmentStatusLabel,
  getOverallStatusLabel,
  getScenarioLabel,
  normalizeAssessmentSummary,
  type AssessmentCategoryGroup,
  type AssessmentCategoryKey,
} from './assessment'
```

- [ ] **Step 2: Add computed state and formatting functions**

Add:

```ts
const selectedAssessmentCategory = ref<AssessmentCategoryKey>('MACRO')

const assessmentCategories = computed(() => buildAssessmentCategories(assessmentEntries.value))
const selectedAssessmentCategoryGroup = computed<AssessmentCategoryGroup>(() => {
  return assessmentCategories.value.find((group) => group.key === selectedAssessmentCategory.value) || assessmentCategories.value[0]
})
const visibleAssessmentEntries = computed(() => selectedAssessmentCategoryGroup.value?.entries || [])
const assessmentStandardName = computed(() => assessment.value?.standardName || 'FEDIAF 2025 犬标准')
const assessmentLifeStageLabel = computed(() => getScenarioLabel(assessment.value?.scenario || scenario.value))
```

Add functions:

```ts
function selectAssessmentCategory(key: AssessmentCategoryKey) {
  selectedAssessmentCategory.value = key
}

function formatAssessmentBasisLabel(entry: any) {
  const display = getAssessmentDisplayEntry(entry)
  const basis = display.basisEntry.expressionBasis || entry.expressionBasis
  return basis === 'PER_1000_KCAL_ME' ? '每1000 kcal ME' : formatExpressionBasis(basis)
}

function formatDryMatterPercent(entry: any) {
  const value = getAssessmentDisplayEntry(entry).dryMatterValue
  return value === null || value === undefined ? '-' : `${formatAssessmentNumber(value)}%`
}

function getAssessmentRangeStyle(entry: any) {
  return `--current-pos:${resolveAssessmentPosition(entry)}%`
}
```

Keep the exact implementation compact and deterministic in the source file.

- [ ] **Step 3: Replace summary grid with category tabs and nutrient rows**

Remove the `summary-grid` block. Render:

```vue
<view class="assessment-standard">
  <text class="standard-name">{{ assessmentStandardName }}</text>
  <text class="standard-stage">{{ assessmentLifeStageLabel }}</text>
</view>
<view class="assessment-category-tabs">
  ...
</view>
<view class="assessment-category-title">
  {{ getAssessmentCategoryTitle(selectedAssessmentCategoryGroup.key) }}
</view>
```

For each nutrient row, render name line, dry matter, status, range bound labels and current marker. Missing-data rows render `缺少当前配方含量，暂不能定位到标准范围`.

- [ ] **Step 4: Add scoped styles**

Add styles for:

```scss
.assessment-standard
.standard-name
.standard-stage
.assessment-category-tabs
.assessment-category-tab
.assessment-category-badge
.assessment-category-title
.entry-heading
.entry-name-line
.entry-basis
.entry-dry-matter
.entry-range
.entry-range-bound
.entry-range-current
.entry-missing-detail
```

Use fixed five-column grid for category tabs and red `#ef4444` badges.

- [ ] **Step 5: Re-run focused miniapp regression test**

Run:

```bash
cd miniapp && npm test -- src/pages/recipe-designer.regression.spec.ts
```

Expected: PASS.

### Task 4: Dev Output Verification

**Files:**
- No new source files.

- [ ] **Step 1: Run focused miniapp API and regression tests**

Run:

```bash
cd miniapp && npm test -- src/pages/recipe-designer.regression.spec.ts src/api/recipe-designer.spec.ts
```

Expected: PASS.

- [ ] **Step 2: Run miniapp dev preview build**

Run:

```bash
cd miniapp && npm run preview
```

Expected: command builds WeChat miniapp dev output under `miniapp/dist/dev/mp-weixin`. If the command enters watch mode after a successful build, stop it after the successful build output appears.

- [ ] **Step 3: Verify dev output contains the new assessment UI and does not use build output**

Run:

```bash
rg -n "assessment-category-tabs|assessment-category-badge|每1000 kcal ME|FEDIAF 2025 犬标准" miniapp/dist/dev/mp-weixin/pages/recipe-designer
```

Expected: matches in `dist/dev/mp-weixin`.

Do not use `miniapp/dist/build/mp-weixin` for this verification.
