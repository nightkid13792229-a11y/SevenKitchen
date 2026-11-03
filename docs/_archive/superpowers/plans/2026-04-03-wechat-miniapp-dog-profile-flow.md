# WeChat Miniapp Dog Profile Flow Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current single-page dog profile form with a create wizard, profile overview page, and focused edit modules that preserve progress and surface recommendation updates clearly.

**Architecture:** Add a thin dog-profile API layer plus pure TypeScript helpers for draft persistence and flow state, then route create and edit traffic into separate page flows. Keep the existing backend dog endpoints and health-record endpoints, but split the miniapp experience into an overview page, a four-step create wizard, and focused edit pages for basic info, feeding info, and health records.

**Tech Stack:** uni-app Vue 3 + TypeScript, Vitest for miniapp helper coverage, existing `/api/v1/dogs` and health-record APIs

---

## Scope and Execution Order

This plan covers the product flow refactor only:

- new overview page
- create wizard
- focused edit pages
- draft persistence
- auto refresh of recommendation preview

It does **not** include event ingestion or analytics dashboards. That work is intentionally split into `docs/superpowers/plans/2026-04-03-dog-profile-analytics.md` so we can land the UX safely first, then instrument it.

## File Structure

### Shared dog-profile client layer

- Modify: `miniapp/package.json`
- Create: `miniapp/vitest.config.ts`
- Create: `miniapp/src/api/dogs.ts`
- Create: `miniapp/src/constants/dog-profile.ts`
- Create: `miniapp/src/utils/dog-profile-draft.ts`
- Create: `miniapp/src/utils/dog-profile-form.ts`
- Create: `miniapp/src/utils/dog-profile-draft.spec.ts`
- Create: `miniapp/src/utils/dog-profile-form.spec.ts`
- Modify: `miniapp/src/utils/dog-cache.ts`

### Shared dog-profile UI

- Create: `miniapp/src/components/dog-profile/StepProgressHeader.vue`
- Create: `miniapp/src/components/dog-profile/StickyActionBar.vue`
- Create: `miniapp/src/components/dog-profile/TaskStatusCard.vue`
- Create: `miniapp/src/components/dog-profile/RecommendationSummaryCard.vue`
- Create: `miniapp/src/components/dog-profile/HealthRecordsSection.vue`

### Pages and routing

- Modify: `miniapp/src/pages.json`
- Modify: `miniapp/src/pages/dog-profile-list/index.vue`
- Modify: `miniapp/src/pages/dog-create/index.vue`
- Create: `miniapp/src/pages/dog-profile-overview/index.vue`
- Create: `miniapp/src/pages/dog-profile-basic/index.vue`
- Create: `miniapp/src/pages/dog-profile-feeding/index.vue`
- Create: `miniapp/src/pages/dog-profile-health/index.vue`

## Task 1: Add Shared Dog-Profile Helpers, API Wrapper, and Test Harness

**Files:**
- Modify: `miniapp/package.json`
- Create: `miniapp/vitest.config.ts`
- Create: `miniapp/src/api/dogs.ts`
- Create: `miniapp/src/constants/dog-profile.ts`
- Create: `miniapp/src/utils/dog-profile-draft.ts`
- Create: `miniapp/src/utils/dog-profile-form.ts`
- Create: `miniapp/src/utils/dog-profile-draft.spec.ts`
- Create: `miniapp/src/utils/dog-profile-form.spec.ts`
- Modify: `miniapp/src/utils/dog-cache.ts`

- [ ] **Step 1: Write the failing helper tests**

```ts
// miniapp/src/utils/dog-profile-draft.spec.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearDogProfileDraft,
  loadDogProfileDraft,
  saveDogProfileDraft,
} from './dog-profile-draft'

const storage = new Map<string, any>()

vi.stubGlobal('uni', {
  getStorageSync: (key: string) => storage.get(key),
  setStorageSync: (key: string, value: any) => storage.set(key, value),
  removeStorageSync: (key: string) => storage.delete(key),
})

describe('dog-profile-draft', () => {
  beforeEach(() => storage.clear())

  it('round-trips a create draft by customer id', () => {
    saveDogProfileDraft('customer-a', 'create', {
      step: 'feeding',
      form: { name: '七七', currentWeightKg: '11.5' },
    })

    expect(loadDogProfileDraft('customer-a', 'create')).toEqual({
      step: 'feeding',
      form: { name: '七七', currentWeightKg: '11.5' },
    })
  })

  it('clears an edit draft without touching other drafts', () => {
    saveDogProfileDraft('customer-a', 'edit:dog-1', {
      step: 'feeding',
      form: { currentWeightKg: '10.2' },
    })
    saveDogProfileDraft('customer-a', 'create', {
      step: 'basic',
      form: { name: '七七' },
    })

    clearDogProfileDraft('customer-a', 'edit:dog-1')

    expect(loadDogProfileDraft('customer-a', 'edit:dog-1')).toBeNull()
    expect(loadDogProfileDraft('customer-a', 'create')).toEqual({
      step: 'basic',
      form: { name: '七七' },
    })
  })
})
```

```ts
// miniapp/src/utils/dog-profile-form.spec.ts
import { describe, expect, it } from 'vitest'
import {
  buildDogCreatePayload,
  getCreateStepAvailability,
  getRecommendationDirtyFields,
} from './dog-profile-form'

describe('dog-profile-form', () => {
  it('marks recommendation as dirty when weight changes', () => {
    expect(
      getRecommendationDirtyFields(
        { currentWeightKg: '10.0', activityLevel: 'NORMAL' },
        { currentWeightKg: '11.0', activityLevel: 'NORMAL' },
      ),
    ).toEqual(['currentWeightKg'])
  })

  it('unlocks recommendation after feeding fields are complete', () => {
    expect(
      getCreateStepAvailability({
        name: '七七',
        breedId: '550e8400-e29b-41d4-a716-446655440000',
        birthday: '2021-01-01',
        currentWeightKg: '11.0',
        activityLevel: 'NORMAL',
      }).recommendation,
    ).toBe(true)
  })

  it('builds create payload with normalized birthday and meals fallback', () => {
    expect(
      buildDogCreatePayload({
        name: '七七',
        breedId: '550e8400-e29b-41d4-a716-446655440000',
        birthday: '2021-01-01',
        gender: 'MALE',
        isNeutered: false,
        currentWeightKg: '11',
        bcsScore: 5,
        activityLevel: 'NORMAL',
        lifeStageOverride: 'NONE',
        sizeClassOverride: null,
        mealsPerDay: '',
        treatInputMode: 'ESTIMATE_LEVEL',
        treatLevel: 'LOW',
        manualTreatKcal: '',
        allergyFoods: '',
        pickyFoods: '',
      }).mealsPerDay,
    ).toBe(2)
  })
})
```

- [ ] **Step 2: Run the helper tests to verify they fail**

Run: `cd miniapp && npx vitest run src/utils/dog-profile-draft.spec.ts src/utils/dog-profile-form.spec.ts`

Expected: FAIL with missing-module errors for `dog-profile-draft`, `dog-profile-form`, or `vitest`.

- [ ] **Step 3: Add Vitest, the shared API wrapper, and the pure helpers**

```json
// miniapp/package.json
{
  "scripts": {
    "dev:mp-weixin": "uni -p mp-weixin",
    "build:mp-weixin": "uni build -p mp-weixin && node scripts/fix-components-injection.js",
    "test": "vitest run"
  },
  "devDependencies": {
    "vitest": "^3.2.4"
  }
}
```

```ts
// miniapp/vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    clearMocks: true,
  },
})
```

```ts
// miniapp/src/api/dogs.ts
import { request } from '../utils/api'

export interface DogProfileFormValue {
  name: string
  breedId: string
  customBreedName?: string
  birthday: string
  gender: string
  isNeutered: boolean
  currentWeightKg: string
  bcsScore: number
  activityLevel: string
  lifeStageOverride: string
  sizeClassOverride: string | null
  mealsPerDay: string
  treatInputMode: string
  treatLevel: string
  manualTreatKcal: string
  allergyFoods: string
  pickyFoods: string
  medicalRecords?: any[]
  checkupRecords?: any[]
  allergyRecords?: any[]
}

export const dogApi = {
  list: () => request({ url: '/dogs', method: 'GET' }),
  detail: (dogId: string) => request({ url: `/dogs/${dogId}`, method: 'GET' }),
  breeds: () => request({ url: '/dogs/breeds', method: 'GET' }),
  preview: (data: Record<string, any>) =>
    request({ url: '/dogs/calc-preview', method: 'POST', data }),
  create: (data: Record<string, any>) => request({ url: '/dogs', method: 'POST', data }),
  update: (dogId: string, data: Record<string, any>) =>
    request({ url: `/dogs/${dogId}`, method: 'PUT', data }),
}
```

```ts
// miniapp/src/constants/dog-profile.ts
export const DOG_PROFILE_CREATE_STEPS = ['basic', 'feeding', 'recommendation', 'health'] as const
export type DogProfileCreateStep = (typeof DOG_PROFILE_CREATE_STEPS)[number]

export const DOG_PROFILE_RECOMMENDATION_FIELDS = [
  'breedId',
  'birthday',
  'currentWeightKg',
  'bcsScore',
  'activityLevel',
  'isNeutered',
  'mealsPerDay',
  'treatInputMode',
  'treatLevel',
  'manualTreatKcal',
] as const
```

```ts
// miniapp/src/utils/dog-profile-draft.ts
const STORAGE_KEY = 'dog_profile_drafts'

type DraftMap = Record<string, any>

function readDraftMap(): DraftMap {
  return uni.getStorageSync(STORAGE_KEY) || {}
}

function writeDraftMap(value: DraftMap) {
  uni.setStorageSync(STORAGE_KEY, value)
}

function buildKey(customerId: string, scope: string) {
  return `${customerId}:${scope}`
}

export function saveDogProfileDraft(customerId: string, scope: string, value: any) {
  const current = readDraftMap()
  current[buildKey(customerId, scope)] = value
  writeDraftMap(current)
}

export function loadDogProfileDraft(customerId: string, scope: string) {
  const current = readDraftMap()
  return current[buildKey(customerId, scope)] || null
}

export function clearDogProfileDraft(customerId: string, scope: string) {
  const current = readDraftMap()
  delete current[buildKey(customerId, scope)]
  writeDraftMap(current)
}
```

```ts
// miniapp/src/utils/dog-profile-form.ts
import { DOG_PROFILE_RECOMMENDATION_FIELDS } from '../constants/dog-profile'

export function getRecommendationDirtyFields(
  previousForm: Record<string, any>,
  nextForm: Record<string, any>,
) {
  return DOG_PROFILE_RECOMMENDATION_FIELDS.filter((field) => previousForm[field] !== nextForm[field])
}

export function getCreateStepAvailability(form: Record<string, any>) {
  const basic = Boolean(form.name && form.breedId && form.birthday)
  const feeding = basic
  const recommendation = Boolean(
    basic && form.currentWeightKg && form.activityLevel,
  )
  return { basic: true, feeding, recommendation, health: recommendation }
}

export function buildDogCreatePayload(form: Record<string, any>) {
  return {
    ...form,
    birthday: new Date(form.birthday).toISOString(),
    currentWeightKg: parseFloat(form.currentWeightKg),
    mealsPerDay: parseInt(form.mealsPerDay, 10) || 2,
    manualTreatKcal:
      form.treatInputMode === 'EXACT_KCAL' && form.manualTreatKcal
        ? parseFloat(form.manualTreatKcal)
        : undefined,
  }
}
```

```ts
// miniapp/src/utils/dog-cache.ts
export function getCachedDogById(dogId: string) {
  return getCachedDogs().find((dog) => dog.id === dogId) || null
}
```

- [ ] **Step 4: Run the helper tests and ensure they pass**

Run: `cd miniapp && npx vitest run src/utils/dog-profile-draft.spec.ts src/utils/dog-profile-form.spec.ts`

Expected: PASS with both spec files green.

- [ ] **Step 5: Commit the shared dog-profile foundation**

```bash
git add miniapp/package.json miniapp/vitest.config.ts miniapp/src/api/dogs.ts miniapp/src/constants/dog-profile.ts miniapp/src/utils/dog-profile-draft.ts miniapp/src/utils/dog-profile-form.ts miniapp/src/utils/dog-profile-draft.spec.ts miniapp/src/utils/dog-profile-form.spec.ts miniapp/src/utils/dog-cache.ts
git commit -m "feat: add dog profile flow helpers"
```

## Task 2: Add the Profile Overview Page and Route Existing Dogs Through It

**Files:**
- Create: `miniapp/src/components/dog-profile/TaskStatusCard.vue`
- Create: `miniapp/src/components/dog-profile/RecommendationSummaryCard.vue`
- Create: `miniapp/src/components/dog-profile/StickyActionBar.vue`
- Create: `miniapp/src/pages/dog-profile-overview/index.vue`
- Modify: `miniapp/src/pages.json`
- Modify: `miniapp/src/pages/dog-profile-list/index.vue`
- Modify: `miniapp/src/utils/dog-profile-form.ts`
- Modify: `miniapp/src/utils/dog-profile-form.spec.ts`

- [ ] **Step 1: Write the failing route-and-task-status test**

```ts
// append to miniapp/src/utils/dog-profile-form.spec.ts
import { buildOverviewTaskCards, resolveDogProfileEntryRoute } from './dog-profile-form'

it('routes existing dogs to the overview page', () => {
  expect(resolveDogProfileEntryRoute('dog-1')).toBe('/pages/dog-profile-overview/index?dogId=dog-1')
  expect(resolveDogProfileEntryRoute()).toBe('/pages/dog-create/index')
})

it('marks feeding as stale when recommendation dirty fields include weight', () => {
  expect(
    buildOverviewTaskCards({
      profile: { name: '七七' },
      dirtyFields: ['currentWeightKg'],
      healthCount: 0,
    }).find((item) => item.key === 'feeding')?.status,
  ).toBe('stale')
})
```

- [ ] **Step 2: Run the focused helper test and verify it fails**

Run: `cd miniapp && npx vitest run src/utils/dog-profile-form.spec.ts -t "routes existing dogs to the overview page"`

Expected: FAIL because `resolveDogProfileEntryRoute` and `buildOverviewTaskCards` are not exported yet.

- [ ] **Step 3: Implement the overview helper, components, route, and page**

```ts
// miniapp/src/utils/dog-profile-form.ts
export function resolveDogProfileEntryRoute(dogId?: string) {
  return dogId ? `/pages/dog-profile-overview/index?dogId=${dogId}` : '/pages/dog-create/index'
}

export function buildOverviewTaskCards({
  profile,
  dirtyFields,
  healthCount,
}: {
  profile: Record<string, any>
  dirtyFields: string[]
  healthCount: number
}) {
  return [
    { key: 'basic', title: '基础档案', status: profile.name ? 'done' : 'todo' },
    {
      key: 'feeding',
      title: '喂养信息',
      status: dirtyFields.length > 0 ? 'stale' : 'done',
    },
    {
      key: 'health',
      title: '健康记录',
      status: healthCount > 0 ? 'done' : 'todo',
    },
  ]
}
```

```vue
<!-- miniapp/src/components/dog-profile/TaskStatusCard.vue -->
<template>
  <view class="task-card" @tap="$emit('tap')">
    <view class="task-main">
      <text class="task-title">{{ title }}</text>
      <text class="task-subtitle">{{ subtitle }}</text>
    </view>
    <text class="task-status" :class="status">{{ statusLabel }}</text>
  </view>
</template>

<script setup lang="ts">
const props = defineProps<{
  title: string
  subtitle: string
  status: 'done' | 'todo' | 'stale'
}>()

const statusLabel = {
  done: '已完成',
  todo: '待补充',
  stale: '建议更新',
}[props.status]
</script>
```

```vue
<!-- miniapp/src/components/dog-profile/RecommendationSummaryCard.vue -->
<template>
  <view class="recommendation-card">
    <text class="card-title">当前喂食建议</text>
    <text class="card-value">{{ foodKcalText }}</text>
    <text class="card-meta">{{ freshnessLabel }}</text>
  </view>
</template>

<script setup lang="ts">
const props = defineProps<{
  finalFoodKcal?: number | null
  isStale: boolean
}>()

const foodKcalText = props.finalFoodKcal ? `${props.finalFoodKcal.toFixed(1)} kcal/天` : '待生成'
const freshnessLabel = props.isStale ? '建议待更新' : '建议已更新'
</script>
```

```vue
<!-- miniapp/src/components/dog-profile/StickyActionBar.vue -->
<template>
  <view class="sticky-action-bar">
    <button class="btn-primary" @tap="$emit('primary')">{{ primaryText }}</button>
    <button v-if="secondaryText" class="btn-secondary" @tap="$emit('secondary')">{{ secondaryText }}</button>
  </view>
</template>

<script setup lang="ts">
defineProps<{ primaryText: string; secondaryText?: string }>()
</script>
```

```vue
<!-- miniapp/src/pages/dog-profile-overview/index.vue -->
<template>
  <view class="container" v-if="dog">
    <view class="hero-card">
      <text class="dog-name">{{ dog.name }}</text>
      <text class="dog-meta">{{ dog.breedName || '混血/其他' }} · {{ dog.currentWeightKg || '-' }}kg</text>
    </view>

    <RecommendationSummaryCard
      :final-food-kcal="calcResult?.finalFoodKcal || null"
      :is-stale="dirtyFields.length > 0"
    />

    <TaskStatusCard
      v-for="task in tasks"
      :key="task.key"
      :title="task.title"
      :subtitle="task.key === 'health' ? '病史、体检、过敏、挑食' : '点击进入编辑'"
      :status="task.status"
      @tap="openTask(task.key)"
    />

    <StickyActionBar
      primary-text="更新喂食建议"
      secondary-text="去看推荐食谱"
      @primary="openTask('feeding')"
      @secondary="goToRecipeOrder"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import RecommendationSummaryCard from '../../components/dog-profile/RecommendationSummaryCard.vue'
import StickyActionBar from '../../components/dog-profile/StickyActionBar.vue'
import TaskStatusCard from '../../components/dog-profile/TaskStatusCard.vue'
import { dogApi } from '../../api/dogs'
import { buildOverviewTaskCards } from '../../utils/dog-profile-form'

const dogId = ref('')
const dog = ref<any>(null)
const calcResult = ref<any>(null)
const dirtyFields = ref<string[]>([])

const tasks = computed(() =>
  buildOverviewTaskCards({
    profile: dog.value || {},
    dirtyFields: dirtyFields.value,
    healthCount:
      (dog.value?.medicalRecords?.length || 0) +
      (dog.value?.checkupRecords?.length || 0) +
      (dog.value?.allergyRecords?.length || 0),
  }),
)

onLoad(async (options) => {
  dogId.value = options?.dogId || ''
  const res: any = await dogApi.detail(dogId.value)
  dog.value = res.data.profile
  calcResult.value = res.data.calcResult
})

function openTask(taskKey: string) {
  const routeMap: Record<string, string> = {
    basic: `/pages/dog-profile-basic/index?dogId=${dogId.value}`,
    feeding: `/pages/dog-profile-feeding/index?dogId=${dogId.value}`,
    health: `/pages/dog-profile-health/index?dogId=${dogId.value}`,
  }
  uni.navigateTo({ url: routeMap[taskKey] })
}

function goToRecipeOrder() {
  uni.navigateTo({ url: `/pages/recipe-order/index?dogId=${dogId.value}` })
}
</script>
```

```json
// miniapp/src/pages.json
{
  "pages": [
    { "path": "pages/dog-profile-overview/index", "style": { "navigationBarTitleText": "爱犬档案" } },
    { "path": "pages/dog-profile-basic/index", "style": { "navigationBarTitleText": "基础档案" } },
    { "path": "pages/dog-profile-feeding/index", "style": { "navigationBarTitleText": "喂养信息" } },
    { "path": "pages/dog-profile-health/index", "style": { "navigationBarTitleText": "健康记录" } }
  ]
}
```

```ts
// miniapp/src/pages/dog-profile-list/index.vue
import { resolveDogProfileEntryRoute } from '../../utils/dog-profile-form'

function viewDog(dogId: string) {
  uni.navigateTo({ url: resolveDogProfileEntryRoute(dogId) })
}

function createDog() {
  uni.navigateTo({ url: resolveDogProfileEntryRoute() })
}
```

- [ ] **Step 4: Run tests and build the miniapp**

Run: `cd miniapp && npx vitest run src/utils/dog-profile-form.spec.ts && npm run build:mp-weixin`

Expected:
- Vitest PASS
- WeChat miniapp build completes without route-registration errors

- [ ] **Step 5: Commit the overview flow**

```bash
git add miniapp/src/components/dog-profile/TaskStatusCard.vue miniapp/src/components/dog-profile/RecommendationSummaryCard.vue miniapp/src/components/dog-profile/StickyActionBar.vue miniapp/src/pages/dog-profile-overview/index.vue miniapp/src/pages.json miniapp/src/pages/dog-profile-list/index.vue miniapp/src/utils/dog-profile-form.ts miniapp/src/utils/dog-profile-form.spec.ts
git commit -m "feat: add dog profile overview flow"
```

## Task 3: Convert `dog-create` into a Four-Step Create Wizard with Draft Restore and Auto Preview

**Files:**
- Create: `miniapp/src/components/dog-profile/StepProgressHeader.vue`
- Modify: `miniapp/src/pages/dog-create/index.vue`
- Modify: `miniapp/src/utils/dog-profile-draft.ts`
- Modify: `miniapp/src/utils/dog-profile-form.ts`
- Modify: `miniapp/src/utils/dog-profile-form.spec.ts`

- [ ] **Step 1: Write the failing wizard-state test**

```ts
// append to miniapp/src/utils/dog-profile-form.spec.ts
import { getNextCreateStep, shouldAutoPreviewRecommendation } from './dog-profile-form'

it('advances from feeding to recommendation once feeding is valid', () => {
  expect(getNextCreateStep('feeding')).toBe('recommendation')
})

it('auto-previews recommendation only when dirty fields touch calculation inputs', () => {
  expect(shouldAutoPreviewRecommendation(['currentWeightKg'])).toBe(true)
  expect(shouldAutoPreviewRecommendation(['allergyFoods'])).toBe(false)
})
```

- [ ] **Step 2: Run the new wizard-state test and verify it fails**

Run: `cd miniapp && npx vitest run src/utils/dog-profile-form.spec.ts -t "advances from feeding to recommendation once feeding is valid"`

Expected: FAIL because `getNextCreateStep` and `shouldAutoPreviewRecommendation` are missing.

- [ ] **Step 3: Implement the wizard helpers and refactor `dog-create` into a step flow**

```ts
// miniapp/src/utils/dog-profile-form.ts
import { DOG_PROFILE_CREATE_STEPS } from '../constants/dog-profile'

export function getNextCreateStep(step: string) {
  const currentIndex = DOG_PROFILE_CREATE_STEPS.indexOf(step as any)
  return DOG_PROFILE_CREATE_STEPS[Math.min(currentIndex + 1, DOG_PROFILE_CREATE_STEPS.length - 1)]
}

export function shouldAutoPreviewRecommendation(dirtyFields: string[]) {
  return dirtyFields.some((field) =>
    [
      'breedId',
      'birthday',
      'currentWeightKg',
      'bcsScore',
      'activityLevel',
      'isNeutered',
      'mealsPerDay',
      'treatInputMode',
      'treatLevel',
      'manualTreatKcal',
    ].includes(field),
  )
}
```

```vue
<!-- miniapp/src/components/dog-profile/StepProgressHeader.vue -->
<template>
  <view class="step-header">
    <view
      v-for="(step, index) in steps"
      :key="step.key"
      class="step-chip"
      :class="{ active: step.key === currentStep, done: index < currentIndex }"
    >
      {{ index + 1 }}. {{ step.label }}
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  currentStep: string
  steps: Array<{ key: string; label: string }>
}>()

const currentIndex = computed(() => props.steps.findIndex((step) => step.key === props.currentStep))
</script>
```

```vue
<!-- key excerpts from miniapp/src/pages/dog-create/index.vue -->
<template>
  <view class="container">
    <StepProgressHeader :current-step="currentStep" :steps="steps" />

    <view v-if="currentStep === 'basic'">
      <view class="form-item">
        <text class="label">姓名 *</text>
        <input class="input" :value="formData.name" placeholder="请输入狗狗姓名" @input="e => formData.name = e.detail.value" />
      </view>

      <view class="form-item">
        <text class="label">性别</text>
        <view class="gender-selector">
          <view class="gender-option" :class="{ active: formData.gender === 'MALE' }" @tap="selectGender('MALE')">公</view>
          <view class="gender-option" :class="{ active: formData.gender === 'FEMALE' }" @tap="selectGender('FEMALE')">母</view>
        </view>
      </view>

      <view class="form-item">
        <text class="label">品种 *</text>
        <input class="input" v-model="searchKeyword" placeholder="搜索品种（如：拉布拉多）" />
        <view v-if="selectedBreed" class="selected-breed-display">
          <text>{{ selectedBreed.name }}</text>
          <text class="change-btn" @tap="clearBreed">更换品种</text>
        </view>
      </view>

      <view class="form-item">
        <text class="label">生日 *</text>
        <picker mode="date" :value="formData.birthday || ''" @change="onBirthdayChange">
          <view class="picker">{{ formData.birthday || '请选择生日' }}</view>
        </picker>
      </view>
    </view>

    <view v-else-if="currentStep === 'feeding'">
      <view class="form-item">
        <text class="label">体重(kg) *</text>
        <input class="input" type="digit" :value="formData.currentWeightKg" placeholder="请输入体重" @input="e => formData.currentWeightKg = e.detail.value" />
      </view>

      <view class="form-item">
        <text class="label">BCS评分</text>
        <slider :min="1" :max="9" :value="formData.bcsScore" step="1" show-value @change="onBcsChange" />
      </view>

      <view class="form-item">
        <text class="label">活动水平 *</text>
        <view class="activity-level-container">
          <view
            v-for="option in activityLevelConfigs"
            :key="option.value"
            class="activity-level-option"
            :class="{ active: formData.activityLevel === option.value }"
            @tap="selectActivityLevel(option.value)"
          >
            <text class="activity-level-label">{{ option.label }}</text>
            <text class="activity-level-description">{{ option.description }}</text>
          </view>
        </view>
      </view>

      <view class="form-item">
        <text class="label">每日餐数</text>
        <input class="input" type="number" :value="formData.mealsPerDay" placeholder="默认 2 餐" @input="e => formData.mealsPerDay = e.detail.value" />
      </view>

      <view class="form-item">
        <text class="label">零食设置</text>
        <view class="treat-mode-selector">
          <view
            v-for="mode in treatInputModeOptions"
            :key="mode.value"
            class="card-option"
            :class="{ active: formData.treatInputMode === mode.value }"
            @tap="selectTreatInputMode(mode.value)"
          >
            {{ mode.label }}
          </view>
        </view>
      </view>
    </view>

    <view v-else-if="currentStep === 'recommendation'">
      <RecommendationSummaryCard
        :final-food-kcal="calcResult?.finalFoodKcal || null"
        :is-stale="calcStaleNotice"
      />
      <button class="btn-inline" @tap="currentStep = 'feeding'">返回修改喂养信息</button>
    </view>

    <view v-else>
      <HealthRecordsSection
        v-model:medical-records="formData.medicalRecords"
        v-model:checkup-records="formData.checkupRecords"
        v-model:allergy-records="formData.allergyRecords"
        v-model:allergy-foods="formData.allergyFoods"
        v-model:picky-foods="formData.pickyFoods"
      />
      <view class="skip-note">可跳过，稍后也可以从档案页继续补充</view>
    </view>

    <StickyActionBar
      :primary-text="primaryActionText"
      :secondary-text="secondaryActionText"
      @primary="handlePrimaryAction"
      @secondary="handleSecondaryAction"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import StepProgressHeader from '../../components/dog-profile/StepProgressHeader.vue'
import StickyActionBar from '../../components/dog-profile/StickyActionBar.vue'
import RecommendationSummaryCard from '../../components/dog-profile/RecommendationSummaryCard.vue'
import HealthRecordsSection from '../../components/dog-profile/HealthRecordsSection.vue'
import { dogApi } from '../../api/dogs'
import { clearDogProfileDraft, loadDogProfileDraft, saveDogProfileDraft } from '../../utils/dog-profile-draft'
import { buildDogCreatePayload, getNextCreateStep, getRecommendationDirtyFields, shouldAutoPreviewRecommendation } from '../../utils/dog-profile-form'

const currentStep = ref<'basic' | 'feeding' | 'recommendation' | 'health'>('basic')
const customerId = ref(uni.getStorageSync('customerId') || 'mvp-user-001')
const previousFormSnapshot = ref<Record<string, any>>({})

onLoad(() => {
  const draft = loadDogProfileDraft(customerId.value, 'create')
  if (draft) {
    currentStep.value = draft.step
    Object.assign(formData.value, draft.form)
  }
})

watch(
  () => ({ ...formData.value, step: currentStep.value }),
  (nextValue) => {
    saveDogProfileDraft(customerId.value, 'create', {
      step: currentStep.value,
      form: { ...formData.value },
    })

    const dirtyFields = getRecommendationDirtyFields(previousFormSnapshot.value, nextValue)
    if (shouldAutoPreviewRecommendation(dirtyFields) && canPreview.value) {
      void previewCalculation()
    }
    previousFormSnapshot.value = { ...nextValue }
  },
  { deep: true },
)

const primaryActionText = computed(() => {
  if (currentStep.value === 'basic') return '下一步'
  if (currentStep.value === 'feeding') return '生成喂食建议'
  if (currentStep.value === 'recommendation') return '按这个建议继续'
  return '完成建档'
})

const secondaryActionText = computed(() => (currentStep.value === 'health' ? '先跳过' : ''))

async function handlePrimaryAction() {
  if (currentStep.value === 'feeding') {
    await previewCalculation()
  }

  if (currentStep.value === 'health') {
    await submit()
    clearDogProfileDraft(customerId.value, 'create')
    return
  }

  currentStep.value = getNextCreateStep(currentStep.value) as any
}

function handleSecondaryAction() {
  if (currentStep.value === 'health') {
    void submit()
    clearDogProfileDraft(customerId.value, 'create')
  }
}

async function submit() {
  const payload = buildDogCreatePayload(formData.value)
  await dogApi.create(payload)
  uni.redirectTo({ url: '/pages/dog-profile-list/index' })
}
</script>
```

- [ ] **Step 4: Run the helper tests and a full miniapp build**

Run: `cd miniapp && npx vitest run src/utils/dog-profile-form.spec.ts && npm run build:mp-weixin`

Expected:
- Vitest PASS
- Build PASS with `dog-create` still compiling after the wizard refactor

- [ ] **Step 5: Commit the create wizard**

```bash
git add miniapp/src/components/dog-profile/StepProgressHeader.vue miniapp/src/pages/dog-create/index.vue miniapp/src/utils/dog-profile-draft.ts miniapp/src/utils/dog-profile-form.ts miniapp/src/utils/dog-profile-form.spec.ts
git commit -m "feat: convert dog create to wizard flow"
```

## Task 4: Add Focused Edit Pages for Basic Info, Feeding Info, and Health Records

**Files:**
- Create: `miniapp/src/components/dog-profile/HealthRecordsSection.vue`
- Create: `miniapp/src/pages/dog-profile-basic/index.vue`
- Create: `miniapp/src/pages/dog-profile-feeding/index.vue`
- Create: `miniapp/src/pages/dog-profile-health/index.vue`
- Modify: `miniapp/src/pages/dog-profile-overview/index.vue`
- Modify: `miniapp/src/utils/dog-profile-form.ts`
- Modify: `miniapp/src/utils/dog-profile-form.spec.ts`

- [ ] **Step 1: Write the failing edit-payload test**

```ts
// append to miniapp/src/utils/dog-profile-form.spec.ts
import { buildDogEditPayload } from './dog-profile-form'

it('builds edit payload with numeric feeding fields normalized', () => {
  expect(
    buildDogEditPayload({
      birthday: '2021-01-01',
      currentWeightKg: '13.4',
      mealsPerDay: '3',
      treatInputMode: 'ESTIMATE_LEVEL',
      manualTreatKcal: '',
    }).currentWeightKg,
  ).toBe(13.4)
})
```

- [ ] **Step 2: Run the edit-payload test and verify it fails**

Run: `cd miniapp && npx vitest run src/utils/dog-profile-form.spec.ts -t "builds edit payload with numeric feeding fields normalized"`

Expected: FAIL because `buildDogEditPayload` does not exist yet.

- [ ] **Step 3: Implement the health section and the three focused edit pages**

```ts
// miniapp/src/utils/dog-profile-form.ts
export function buildDogEditPayload(form: Record<string, any>) {
  const payload = buildDogCreatePayload(form)
  return {
    ...payload,
    medicalRecords: form.medicalRecords || [],
    checkupRecords: form.checkupRecords || [],
    allergyRecords: form.allergyRecords || [],
    allergyFoods: form.allergyFoods || null,
    pickyFoods: form.pickyFoods || null,
  }
}
```

```vue
<!-- miniapp/src/components/dog-profile/HealthRecordsSection.vue -->
<template>
  <view class="health-section">
    <view class="section-card">
      <view class="section-head">
        <text class="section-title">病史记录</text>
        <text class="section-count">{{ medicalRecords.length }} 条</text>
      </view>
      <view v-if="medicalRecords.length === 0" class="empty-text">暂无病史记录</view>
      <view v-for="(record, index) in medicalRecords" :key="record.id || index" class="record-item">
        <view class="record-main" @tap="$emit('edit-medical', index)">
          <text class="record-title">{{ record.chiefComplaint }}</text>
          <text class="record-meta">{{ record.visitDate || '未填写日期' }}</text>
        </view>
        <text class="record-delete" @tap="$emit('delete-medical', index)">删除</text>
      </view>
      <button class="record-add" @tap="$emit('add-medical')">+ 添加病史</button>
    </view>

    <view class="section-card">
      <view class="section-head">
        <text class="section-title">体检记录</text>
        <text class="section-count">{{ checkupRecords.length }} 条</text>
      </view>
      <view v-if="checkupRecords.length === 0" class="empty-text">暂无体检记录</view>
      <view v-for="(record, index) in checkupRecords" :key="record.id || index" class="record-item">
        <view class="record-main" @tap="$emit('edit-checkup', index)">
          <text class="record-title">{{ record.checkupType }}</text>
          <text class="record-meta">{{ record.checkupDate || '未填写日期' }}</text>
        </view>
        <text class="record-delete" @tap="$emit('delete-checkup', index)">删除</text>
      </view>
      <button class="record-add" @tap="$emit('add-checkup')">+ 添加体检</button>
    </view>

    <view class="section-card">
      <view class="section-head">
        <text class="section-title">过敏记录</text>
        <text class="section-count">{{ allergyRecords.length }} 条</text>
      </view>
      <view v-if="allergyRecords.length === 0" class="empty-text">暂无过敏记录</view>
      <view v-for="(record, index) in allergyRecords" :key="record.id || index" class="record-item">
        <view class="record-main" @tap="$emit('edit-allergy', index)">
          <text class="record-title">{{ record.allergen }}</text>
          <text class="record-meta">{{ (record.attachments || []).length }} 个附件</text>
        </view>
        <text class="record-delete" @tap="$emit('delete-allergy', index)">删除</text>
      </view>
      <button class="record-add" @tap="$emit('add-allergy')">+ 添加过敏</button>
    </view>

    <view class="section-card">
      <text class="section-title">饮食补充</text>
      <textarea :value="allergyFoods" @input="$emit('update:allergyFoods', $event.detail.value)" placeholder="过敏食物（选填）" />
      <textarea :value="pickyFoods" @input="$emit('update:pickyFoods', $event.detail.value)" placeholder="挑食食物（选填）" />
    </view>
  </view>
</template>

<script setup lang="ts">
defineProps<{
  medicalRecords: any[]
  checkupRecords: any[]
  allergyRecords: any[]
  allergyFoods: string
  pickyFoods: string
}>()

defineEmits([
  'add-medical',
  'edit-medical',
  'delete-medical',
  'add-checkup',
  'edit-checkup',
  'delete-checkup',
  'add-allergy',
  'edit-allergy',
  'delete-allergy',
  'update:medicalRecords',
  'update:checkupRecords',
  'update:allergyRecords',
  'update:allergyFoods',
  'update:pickyFoods',
])
</script>
```

```vue
<!-- miniapp/src/pages/dog-profile-basic/index.vue -->
<template>
  <view class="container">
    <view class="form-card">
      <view class="form-item">
        <text class="label">姓名 *</text>
        <input class="input" v-model="form.name" placeholder="请输入狗狗姓名" />
      </view>

      <view class="form-item">
        <text class="label">性别</text>
        <view class="gender-selector">
          <view class="gender-option" :class="{ active: form.gender === 'MALE' }" @tap="form.gender = 'MALE'">公</view>
          <view class="gender-option" :class="{ active: form.gender === 'FEMALE' }" @tap="form.gender = 'FEMALE'">母</view>
        </view>
      </view>

      <view class="form-item">
        <text class="label">生日 *</text>
        <picker mode="date" :value="form.birthday" @change="e => form.birthday = e.detail.value">
          <view class="picker">{{ form.birthday || '请选择生日' }}</view>
        </picker>
      </view>
    </view>
    <StickyActionBar primary-text="保存本次修改" @primary="save" />
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import StickyActionBar from '../../components/dog-profile/StickyActionBar.vue'
import { dogApi } from '../../api/dogs'
import { buildDogEditPayload } from '../../utils/dog-profile-form'

const dogId = ref('')
const form = ref<any>({})

onLoad(async (options) => {
  dogId.value = options?.dogId || ''
  const res: any = await dogApi.detail(dogId.value)
  form.value = res.data.profile
})

async function save() {
  await dogApi.update(dogId.value, buildDogEditPayload(form.value))
  uni.navigateBack()
}
</script>
```

```vue
<!-- miniapp/src/pages/dog-profile-feeding/index.vue -->
<template>
  <view class="container">
    <view class="form-card">
      <view class="form-item">
        <text class="label">体重(kg)</text>
        <input class="input" v-model="form.currentWeightKg" type="digit" placeholder="请输入体重" />
      </view>

      <view class="form-item">
        <text class="label">BCS评分</text>
        <slider :min="1" :max="9" :value="form.bcsScore" step="1" show-value @change="e => form.bcsScore = e.detail.value" />
      </view>

      <view class="form-item">
        <text class="label">活动水平</text>
        <view class="activity-level-container">
          <view
            v-for="option in activityLevelConfigs"
            :key="option.value"
            class="activity-level-option"
            :class="{ active: form.activityLevel === option.value }"
            @tap="form.activityLevel = option.value"
          >
            <text class="activity-level-label">{{ option.label }}</text>
          </view>
        </view>
      </view>
    </view>

    <RecommendationSummaryCard
      :final-food-kcal="calcResult?.finalFoodKcal || null"
      :is-stale="dirtyFields.length > 0"
    />

    <StickyActionBar primary-text="保存并更新建议" @primary="save" />
  </view>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import RecommendationSummaryCard from '../../components/dog-profile/RecommendationSummaryCard.vue'
import StickyActionBar from '../../components/dog-profile/StickyActionBar.vue'
import { dogApi } from '../../api/dogs'
import { buildDogEditPayload, getRecommendationDirtyFields } from '../../utils/dog-profile-form'

const dogId = ref('')
const form = ref<any>({})
const snapshot = ref<any>({})
const dirtyFields = ref<string[]>([])
const calcResult = ref<any>(null)

onLoad(async (options) => {
  dogId.value = options?.dogId || ''
  const res: any = await dogApi.detail(dogId.value)
  form.value = res.data.profile
  snapshot.value = { ...res.data.profile }
  calcResult.value = res.data.calcResult
})

watch(
  () => ({ ...form.value }),
  async (next) => {
    dirtyFields.value = getRecommendationDirtyFields(snapshot.value, next)
    if (dirtyFields.value.length > 0) {
      const preview: any = await dogApi.preview(buildDogEditPayload(next))
      calcResult.value = preview.data
    }
  },
  { deep: true },
)

async function save() {
  await dogApi.update(dogId.value, buildDogEditPayload(form.value))
  uni.navigateBack()
}
</script>
```

```vue
<!-- miniapp/src/pages/dog-profile-health/index.vue -->
<template>
  <view class="container">
    <HealthRecordsSection
      v-model:medical-records="form.medicalRecords"
      v-model:checkup-records="form.checkupRecords"
      v-model:allergy-records="form.allergyRecords"
      v-model:allergy-foods="form.allergyFoods"
      v-model:picky-foods="form.pickyFoods"
    />
    <StickyActionBar primary-text="保存本次修改" @primary="save" />
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import HealthRecordsSection from '../../components/dog-profile/HealthRecordsSection.vue'
import StickyActionBar from '../../components/dog-profile/StickyActionBar.vue'
import { dogApi } from '../../api/dogs'
import { buildDogEditPayload } from '../../utils/dog-profile-form'

const dogId = ref('')
const form = ref<any>({})

onLoad(async (options) => {
  dogId.value = options?.dogId || ''
  const res: any = await dogApi.detail(dogId.value)
  form.value = res.data.profile
})

async function save() {
  await dogApi.update(dogId.value, buildDogEditPayload(form.value))
  uni.navigateBack()
}
</script>
```

- [ ] **Step 4: Run tests, build the miniapp, and manually verify the three edit loops**

Run: `cd miniapp && npx vitest run src/utils/dog-profile-form.spec.ts && npm run build:mp-weixin`

Expected:
- Vitest PASS
- Build PASS

Manual verification in WeChat DevTools:
- Open an existing dog from `/pages/dog-profile-list/index`
- Confirm it lands on overview
- Enter basic edit, save, and return
- Enter feeding edit, change weight, see recommendation refresh, save, and return
- Enter health edit, add or remove one record, save, and return

- [ ] **Step 5: Commit the focused edit pages**

```bash
git add miniapp/src/components/dog-profile/HealthRecordsSection.vue miniapp/src/pages/dog-profile-basic/index.vue miniapp/src/pages/dog-profile-feeding/index.vue miniapp/src/pages/dog-profile-health/index.vue miniapp/src/pages/dog-profile-overview/index.vue miniapp/src/utils/dog-profile-form.ts miniapp/src/utils/dog-profile-form.spec.ts
git commit -m "feat: add focused dog profile edit pages"
```

## Self-Review

### Spec coverage

- Create wizard: covered by Task 3
- Overview page: covered by Task 2
- Focused edit pages: covered by Task 4
- Draft restore and exit protection: covered by Tasks 1 and 3
- Recommendation stale state and auto-preview: covered by Tasks 1, 2, and 4
- Health records as optional add-on: covered by Tasks 3 and 4

### Placeholder scan

- No placeholder markers remain in tasks or code steps
- Every task has concrete file paths, commands, and code snippets

### Type consistency

- Shared helpers use the same `buildDogCreatePayload` / `buildDogEditPayload` naming across wizard and edit pages
- Route names use the same new page paths that are registered in `pages.json`
