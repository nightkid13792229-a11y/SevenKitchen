# Dog Profile Create Flow Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the 4-step dog creation flow so it matches the new overview-page design language and interaction model without changing the core creation funnel.

**Architecture:** Keep `/pages/dog-create/index` as the creation route, but stop treating it as an old form pager. Extract step-specific view helpers so Step 1, Step 2, Step 3, and Step 4 can reuse the same interaction vocabulary already proven on the overview page: compact card layout, direct-select controls, energy summary cards, and health-record accordion editing. Implement step-by-step with TDD around the new helper logic first, then refit the page template and actions.

**Tech Stack:** Vue 3 + uni-app, TypeScript, Vitest, existing miniapp dog-profile utilities and shared components.

---

## File Structure Map

### Existing files to modify

- `miniapp/src/pages/dog-create/index.vue`
  Purpose: Keep as the 4-step creation route, but replace the old step layouts with the new overview-aligned card structure.
- `miniapp/src/utils/dog-profile-form.ts`
  Purpose: Keep creation payload builders and step availability logic aligned with the new field boundaries, especially weight + neuter in Step 1 and feeding-only inputs in Step 2.
- `miniapp/src/utils/dog-profile-create-actions.ts`
  Purpose: Keep bottom CTA text and enable/disable rules aligned with the redesigned Step 3 and Step 4 semantics.
- `miniapp/src/components/dog-profile/RecommendationSummaryCard.vue`
  Purpose: Either reuse directly or extend slightly so the Step 3 result page can share the same energy-card language as the overview page.
- `miniapp/src/components/dog-profile/HealthRecordsSection.vue`
  Purpose: Reuse inside Step 4 so creation and overview health modules stop diverging.
- `miniapp/src/utils/dog-profile-overview.ts`
  Purpose: Reuse BCS options, feeding impact explanations, basic-fact formatting, and energy summary builders where possible instead of re-encoding them in `dog-create`.

### New files to create

- `miniapp/src/utils/dog-profile-create-view.ts`
  Purpose: Centralize creation-step-specific view-model logic so `dog-create/index.vue` stops holding all presentation rules inline.
- `miniapp/src/utils/dog-profile-create-view.spec.ts`
  Purpose: Lock the new create-step boundaries and labels with focused tests.

### Existing tests to modify

- `miniapp/src/utils/dog-profile-form.spec.ts`
  Purpose: Update expectations for Step 1/Step 2 field boundaries and creation payload behavior.
- `miniapp/src/utils/dog-profile-create-actions.spec.ts`
  Purpose: Lock new Step 3/Step 4 CTA wording and button ordering.
- `miniapp/src/utils/dog-profile-overview.spec.ts`
  Purpose: Reuse any helper expectations that become shared between overview and create flow.

---

### Task 1: Extract create-step view helpers and lock the new step boundaries

**Files:**
- Create: `miniapp/src/utils/dog-profile-create-view.ts`
- Create: `miniapp/src/utils/dog-profile-create-view.spec.ts`
- Modify: `miniapp/src/utils/dog-profile-form.ts`
- Modify: `miniapp/src/utils/dog-profile-form.spec.ts`

- [ ] **Step 1: Write the failing tests for the new step boundaries**

```ts
import { describe, expect, it } from 'vitest'
import {
  getCreateBasicFieldKeys,
  getCreateFeedingFieldKeys,
  shouldShowCreateWeightManagementEntry,
} from './dog-profile-create-view'

describe('create step boundaries', () => {
  it('keeps weight and neuter in basic info instead of feeding', () => {
    expect(getCreateBasicFieldKeys()).toContain('currentWeightKg')
    expect(getCreateBasicFieldKeys()).toContain('isNeutered')
    expect(getCreateFeedingFieldKeys()).not.toContain('currentWeightKg')
    expect(getCreateFeedingFieldKeys()).not.toContain('isNeutered')
  })

  it('never shows weight-management entry during initial creation', () => {
    expect(shouldShowCreateWeightManagementEntry()).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
npx --yes vitest@3.2.4 run miniapp/src/utils/dog-profile-create-view.spec.ts miniapp/src/utils/dog-profile-form.spec.ts
```

Expected:

- FAIL because `dog-profile-create-view.ts` does not exist yet
- Existing payload/spec tests may still expect weight in the feeding section

- [ ] **Step 3: Implement the create-step helper module**

```ts
// miniapp/src/utils/dog-profile-create-view.ts
import {
  getBcsChoiceOptions,
  getFeedingImpactExplanation,
  resolveDogOverviewTreatLevel,
} from './dog-profile-overview'

export function getCreateBasicFieldKeys() {
  return ['name', 'gender', 'birthday', 'currentWeightKg', 'breedId', 'customBreedName', 'sizeClassOverride', 'isNeutered']
}

export function getCreateFeedingFieldKeys() {
  return ['bcsScore', 'activityLevel', 'mealsPerDay', 'treatLevel']
}

export function shouldShowCreateWeightManagementEntry() {
  return false
}

export function getCreateBcsOptions() {
  return getBcsChoiceOptions()
}

export function getCreateFeedingImpact(type: 'bcs' | 'activity' | 'treat') {
  return getFeedingImpactExplanation(type)
}

export function getCreateTreatChoices() {
  return ['NONE', 'LOW', 'MEDIUM', 'HIGH'].map(level => ({
    level,
    label: resolveDogOverviewTreatLevel(level).label,
  }))
}
```

- [ ] **Step 4: Update the form utility so creation payloads match the new field ownership**

```ts
// miniapp/src/utils/dog-profile-form.ts
export function getCreateStepAvailability(form: Record<string, any>): DogProfileCreateStepAvailability {
  const feeding = Boolean(
    form.currentWeightKg &&
    form.bcsScore &&
    form.activityLevel &&
    form.mealsPerDay &&
    form.treatLevel
  )

  const recommendation = feeding
  return { basic: true, feeding, recommendation, health: recommendation }
}

export function buildDogCreatePayload(form: Record<string, any>) {
  return {
    name: form.name,
    gender: form.gender,
    birthday: form.birthday,
    currentWeightKg: form.currentWeightKg,
    breedId: form.breedId || null,
    customBreedName: form.customBreedName || null,
    sizeClassOverride: form.sizeClassOverride || null,
    isNeutered: Boolean(form.isNeutered),
    bcsScore: form.bcsScore,
    activityLevel: form.activityLevel,
    mealsPerDay: form.mealsPerDay,
    treatLevel: form.treatLevel,
    medicalRecords: form.medicalRecords || [],
    checkupRecords: form.checkupRecords || [],
    allergyRecords: form.allergyRecords || [],
    pickyFoods: form.pickyFoods || '',
  }
}
```

- [ ] **Step 5: Run the targeted tests until they pass**

Run:

```bash
npx --yes vitest@3.2.4 run miniapp/src/utils/dog-profile-create-view.spec.ts miniapp/src/utils/dog-profile-form.spec.ts
```

Expected:

- PASS for the new helper spec
- PASS for updated create-form boundary tests

- [ ] **Step 6: Commit the helper layer**

```bash
git -C /Users/zhaochen/Documents/SevenKitchen/.worktrees/codex-dog-profile-flow add \
  miniapp/src/utils/dog-profile-create-view.ts \
  miniapp/src/utils/dog-profile-create-view.spec.ts \
  miniapp/src/utils/dog-profile-form.ts \
  miniapp/src/utils/dog-profile-form.spec.ts
git -C /Users/zhaochen/Documents/SevenKitchen/.worktrees/codex-dog-profile-flow commit -m "refactor: define create flow view boundaries"
```

---

### Task 2: Rebuild Step 1 as a compact “basic profile card” page

**Files:**
- Modify: `miniapp/src/pages/dog-create/index.vue`
- Modify: `miniapp/src/utils/dog-profile-create-actions.ts`
- Test: `miniapp/src/utils/dog-profile-create-view.spec.ts`
- Test: `miniapp/src/utils/dog-profile-create-actions.spec.ts`

- [ ] **Step 1: Write the failing tests for Step 1 CTA and field placement**

```ts
import { describe, expect, it } from 'vitest'
import { getCreateWizardActionConfig } from './dog-profile-create-actions'

describe('create wizard actions', () => {
  it('keeps step 1 as a simple next-step action', () => {
    expect(
      getCreateWizardActionConfig({
        step: 'basic',
        canAdvanceFromBasic: true,
        canAdvanceFromFeeding: false,
        canAdvanceFromRecommendation: false,
        canSubmit: false,
        recommendationReady: false,
        calculating: false,
      })
    ).toMatchObject({
      primaryText: '下一步',
      secondaryText: undefined,
    })
  })
})
```

- [ ] **Step 2: Run the tests to capture the current baseline**

Run:

```bash
npx --yes vitest@3.2.4 run miniapp/src/utils/dog-profile-create-actions.spec.ts miniapp/src/utils/dog-profile-create-view.spec.ts
```

Expected:

- Either FAIL or PASS unchanged, giving a stable baseline before the template rewrite

- [ ] **Step 3: Replace the old Step 1 template block in `dog-create/index.vue`**

```vue
<view v-if="showBasicSection" class="wizard-step wizard-step--basic">
  <view class="profile-card">
    <view class="profile-card__identity">
      <view class="profile-card__avatar-placeholder">头像位</view>
      <view class="profile-card__identity-fields">
        <input class="input" placeholder="狗狗名字" :value="String(formData.name || '')" @input="e => formData.name = e.detail.value" />
        <view class="gender-selector">
          <view :class="['gender-option', 'gender-option--male', { active: formData.gender === 'MALE' }]" @tap="selectGender('MALE')">弟弟</view>
          <view :class="['gender-option', 'gender-option--female', { active: formData.gender === 'FEMALE' }]" @tap="selectGender('FEMALE')">妹妹</view>
        </view>
      </view>
    </view>
  </view>

  <view class="profile-card">
    <picker mode="date" :value="formData.birthday || ''" @change="onBirthdayChange">
      <view class="picker">{{ formData.birthday || '请选择生日' }}</view>
    </picker>
    <input class="input" type="digit" placeholder="当前体重（kg）" :value="String(formData.currentWeightKg || '')" @input="onWeightInput" />
  </view>

  <view class="profile-card">
    <!-- reuse breed search / manual entry flow, but without weight-management entry -->
  </view>

  <view class="profile-card">
    <view class="neuter-selector">
      <view :class="{ active: formData.isNeutered === true }" @tap="setNeutered(true)">已绝育</view>
      <view :class="{ active: formData.isNeutered === false }" @tap="setNeutered(false)">未绝育</view>
    </view>
  </view>
</view>
```

- [ ] **Step 4: Update styles so Step 1 visually matches the overview page**

```css
.wizard-step--basic .profile-card {
  background: linear-gradient(180deg, #ffffff 0%, #fbfffc 100%);
  border: 2rpx solid #e3f1e8;
  border-radius: 32rpx;
  padding: 28rpx;
  box-shadow: 0 14rpx 40rpx rgba(15, 123, 73, 0.06);
}

.profile-card__identity {
  display: flex;
  align-items: center;
  gap: 24rpx;
}

.gender-option--male.active {
  background: #edf5ff;
  color: #236ce5;
}

.gender-option--female.active {
  background: #fff1f6;
  color: #d84f8b;
}
```

- [ ] **Step 5: Run the creation-page and action tests**

Run:

```bash
npx --yes vitest@3.2.4 run miniapp/src/utils/dog-profile-create-actions.spec.ts miniapp/src/utils/dog-profile-create-view.spec.ts miniapp/src/utils/dog-profile-form.spec.ts
```

Expected:

- PASS with Step 1 still advancing through the existing create flow

- [ ] **Step 6: Commit the Step 1 rewrite**

```bash
git -C /Users/zhaochen/Documents/SevenKitchen/.worktrees/codex-dog-profile-flow add \
  miniapp/src/pages/dog-create/index.vue \
  miniapp/src/utils/dog-profile-create-actions.ts \
  miniapp/src/utils/dog-profile-create-actions.spec.ts
git -C /Users/zhaochen/Documents/SevenKitchen/.worktrees/codex-dog-profile-flow commit -m "feat: redesign create flow basic step"
```

---

### Task 3: Rebuild Step 2 as a feeding-parameters page that matches overview editing

**Files:**
- Modify: `miniapp/src/pages/dog-create/index.vue`
- Modify: `miniapp/src/utils/dog-profile-create-view.ts`
- Modify: `miniapp/src/utils/dog-profile-create-view.spec.ts`

- [ ] **Step 1: Write failing tests for the simplified feeding controls**

```ts
import { describe, expect, it } from 'vitest'
import { getCreateTreatChoices } from './dog-profile-create-view'

describe('create feeding choices', () => {
  it('exposes only four treat levels for creation', () => {
    expect(getCreateTreatChoices().map(item => item.level)).toEqual(['NONE', 'LOW', 'MEDIUM', 'HIGH'])
  })
})
```

- [ ] **Step 2: Run the feeding helper tests**

Run:

```bash
npx --yes vitest@3.2.4 run miniapp/src/utils/dog-profile-create-view.spec.ts
```

Expected:

- FAIL until the helper reflects the exact four-level treat model

- [ ] **Step 3: Replace the old feeding section template with overview-style controls**

```vue
<view v-if="showFeedingSection" class="wizard-step wizard-step--feeding">
  <view class="profile-card">
    <view class="field-header">
      <text class="label">BCS体态评分</text>
      <text class="field-text-link" @tap="toggleCreateFeedingImpactInfo('bcs')">热量影响</text>
    </view>
    <view class="bcs-choice-grid">
      <view
        v-for="option in createBcsOptions"
        :key="option.score"
        :class="['bcs-choice', { active: formData.bcsScore === option.score }]"
        @tap="formData.bcsScore = option.score"
      >
        <text>{{ option.score }}分</text>
        <text>{{ option.status }}</text>
      </view>
    </view>
    <image class="bcs-guide" :src="BCS_GUIDE_IMAGE_URL" mode="widthFix" />
  </view>

  <view class="profile-card">
    <!-- activity cards with descriptive copy -->
  </view>

  <view class="profile-card">
    <!-- meals selector -->
  </view>

  <view class="profile-card">
    <!-- four treat-level cards only -->
  </view>
</view>
```

- [ ] **Step 4: Reuse overview explanations instead of duplicating copy**

```ts
// miniapp/src/pages/dog-create/index.vue
const createBcsOptions = computed(() => getCreateBcsOptions())
const createTreatChoices = computed(() => getCreateTreatChoices())

function getCreateFeedingImpactInfo(type: 'bcs' | 'activity' | 'treat') {
  return getCreateFeedingImpact(type)
}
```

- [ ] **Step 5: Run targeted tests and the miniapp build**

Run:

```bash
npx --yes vitest@3.2.4 run miniapp/src/utils/dog-profile-create-view.spec.ts miniapp/src/utils/dog-profile-form.spec.ts
npm run build:mp-weixin
```

Expected:

- PASS for helper tests
- PASS for build with Step 2 now free of weight-management and exact-kcal controls

- [ ] **Step 6: Commit the Step 2 rewrite**

```bash
git -C /Users/zhaochen/Documents/SevenKitchen/.worktrees/codex-dog-profile-flow add \
  miniapp/src/pages/dog-create/index.vue \
  miniapp/src/utils/dog-profile-create-view.ts \
  miniapp/src/utils/dog-profile-create-view.spec.ts
git -C /Users/zhaochen/Documents/SevenKitchen/.worktrees/codex-dog-profile-flow commit -m "feat: redesign create flow feeding step"
```

---

### Task 4: Turn Step 3 into a recommendation confirmation page

**Files:**
- Modify: `miniapp/src/pages/dog-create/index.vue`
- Modify: `miniapp/src/components/dog-profile/RecommendationSummaryCard.vue`
- Modify: `miniapp/src/utils/dog-profile-create-actions.ts`
- Modify: `miniapp/src/utils/dog-profile-create-actions.spec.ts`

- [ ] **Step 1: Write failing tests for the Step 3 CTA semantics**

```ts
import { describe, expect, it } from 'vitest'
import { getCreateWizardActionConfig } from './dog-profile-create-actions'

describe('recommendation step actions', () => {
  it('uses back / save / continue-health on recommendation step', () => {
    expect(
      getCreateWizardActionConfig({
        step: 'recommendation',
        canAdvanceFromBasic: true,
        canAdvanceFromFeeding: true,
        canAdvanceFromRecommendation: true,
        canSubmit: true,
        recommendationReady: true,
        calculating: false,
      })
    ).toMatchObject({
      secondaryText: '返回上一步',
      tertiaryText: '保存档案',
      primaryText: '继续填写健康记录',
    })
  })
})
```

- [ ] **Step 2: Run the CTA tests**

Run:

```bash
npx --yes vitest@3.2.4 run miniapp/src/utils/dog-profile-create-actions.spec.ts
```

Expected:

- PASS if current wording already matches, otherwise update the test baseline before template work

- [ ] **Step 3: Replace the old recommendation block with a result-confirmation layout**

```vue
<view v-if="showRecommendationSection" class="wizard-step wizard-step--recommendation">
  <view class="profile-card">
    <text class="summary-title">{{ formData.name || '狗狗档案' }}</text>
    <text class="summary-subtitle">{{ recommendationAgeText }} · {{ recommendationLifeStageText }} · {{ formData.currentWeightKg }}kg</text>
  </view>

  <RecommendationSummaryCard
    :summary="recommendationSummary"
    emphasis-key="daily-main-food-kcal"
    hide-update-action
  />

  <view class="profile-card profile-card--note">
    <text class="note-title">喂食建议说明</text>
    <text class="note-body">以上热量为首次喂养参考值，请结合体重和体态变化动态调整。</text>
  </view>
</view>
```

- [ ] **Step 4: Remove manual “update recommendation” UI from Step 3**

```ts
// miniapp/src/pages/dog-create/index.vue
watch(recommendationDirtyFields, dirtyFields => {
  if (shouldAutoPreviewRecommendation(dirtyFields)) {
    previewCalculation({ silent: true })
  }
})
```

- [ ] **Step 5: Run tests and build**

Run:

```bash
npx --yes vitest@3.2.4 run miniapp/src/utils/dog-profile-create-actions.spec.ts miniapp/src/utils/dog-profile-form.spec.ts miniapp/src/utils/dog-recommendation-summary.spec.ts
npm run build:mp-weixin
```

Expected:

- PASS with no Step 3 regression in button copy or summary generation

- [ ] **Step 6: Commit the Step 3 rewrite**

```bash
git -C /Users/zhaochen/Documents/SevenKitchen/.worktrees/codex-dog-profile-flow add \
  miniapp/src/pages/dog-create/index.vue \
  miniapp/src/components/dog-profile/RecommendationSummaryCard.vue \
  miniapp/src/utils/dog-profile-create-actions.ts \
  miniapp/src/utils/dog-profile-create-actions.spec.ts
git -C /Users/zhaochen/Documents/SevenKitchen/.worktrees/codex-dog-profile-flow commit -m "feat: redesign create flow recommendation step"
```

---

### Task 5: Refactor Step 4 into a low-blocking health supplement page

**Files:**
- Modify: `miniapp/src/pages/dog-create/index.vue`
- Modify: `miniapp/src/components/dog-profile/HealthRecordsSection.vue`
- Modify: `miniapp/src/utils/health-records.ts`
- Test: `miniapp/src/utils/health-records.spec.ts`

- [ ] **Step 1: Write the failing health-step tests**

```ts
import { describe, expect, it } from 'vitest'
import { createHealthRecordDraft, resolveHealthRecordSecondaryActionText } from './health-records'

describe('health records helpers', () => {
  it('creates a blank draft for each health record type', () => {
    expect(createHealthRecordDraft('medical').type).toBe('medical')
    expect(createHealthRecordDraft('checkup').type).toBe('checkup')
    expect(createHealthRecordDraft('allergy').type).toBe('allergy')
  })

  it('keeps secondary actions contextual', () => {
    expect(resolveHealthRecordSecondaryActionText({ isPersisted: true, isDirty: true })).toBe('撤销修改')
  })
})
```

- [ ] **Step 2: Run the health helper tests**

Run:

```bash
npx --yes vitest@3.2.4 run miniapp/src/utils/health-records.spec.ts
```

Expected:

- PASS or FAIL with a clear helper gap before Step 4 template changes

- [ ] **Step 3: Rebuild Step 4 with the same accordion + per-record save model used in overview**

```vue
<view v-if="showHealthSection" class="wizard-step wizard-step--health">
  <view class="profile-card profile-card--tip">
    <text class="note-title">健康记录可稍后再补充</text>
    <text class="note-body">先完成建档也不会影响后续继续补充病史、体检、过敏与饮食提醒。</text>
  </view>

  <HealthRecordsSection
    title="病史记录"
    type="medical"
    :records="formData.medicalRecords"
    creation-mode
    @save="handleMedicalRecordSave"
  />

  <HealthRecordsSection
    title="体检记录"
    type="checkup"
    :records="formData.checkupRecords"
    creation-mode
    @save="handleCheckupRecordSave"
  />

  <HealthRecordsSection
    title="过敏记录"
    type="allergy"
    :records="formData.allergyRecords"
    creation-mode
    @save="handleAllergyRecordSave"
  />

  <view class="profile-card">
    <textarea v-model="formData.pickyFoods" placeholder="挑食 / 不爱吃的食物（选填）" />
  </view>
</view>
```

- [ ] **Step 4: Align the Step 4 CTA semantics with “skip or finish”**

```ts
// miniapp/src/utils/dog-profile-create-actions.ts
if (input.step === 'health') {
  return {
    primaryText: '完成建档',
    primaryDisabled: !input.canSubmit || !input.recommendationReady || input.calculating,
    secondaryText: '返回上一步',
    tertiaryText: '跳过并创建',
  }
}
```

- [ ] **Step 5: Run health tests and build**

Run:

```bash
npx --yes vitest@3.2.4 run miniapp/src/utils/health-records.spec.ts miniapp/src/utils/dog-profile-create-actions.spec.ts miniapp/src/utils/dog-profile-form.spec.ts
npm run build:mp-weixin
```

Expected:

- PASS with Step 4 now matching the overview health model but preserving create-flow semantics

- [ ] **Step 6: Commit the Step 4 rewrite**

```bash
git -C /Users/zhaochen/Documents/SevenKitchen/.worktrees/codex-dog-profile-flow add \
  miniapp/src/pages/dog-create/index.vue \
  miniapp/src/components/dog-profile/HealthRecordsSection.vue \
  miniapp/src/utils/health-records.ts \
  miniapp/src/utils/dog-profile-create-actions.ts
git -C /Users/zhaochen/Documents/SevenKitchen/.worktrees/codex-dog-profile-flow commit -m "feat: redesign create flow health step"
```

---

### Task 6: Run full regression for create, overview, and shared dog-profile UI

**Files:**
- Modify: `miniapp/src/pages/dog-create/index.vue`
- Modify: `miniapp/src/utils/dog-profile-create-view.spec.ts`
- Modify: `miniapp/src/utils/dog-profile-form.spec.ts`
- Modify: `miniapp/src/utils/dog-profile-overview.spec.ts`
- Modify: `miniapp/src/utils/health-records.spec.ts`

- [ ] **Step 1: Add regression assertions for the create-page redesign**

```ts
import { describe, expect, it } from 'vitest'
import { getCreateBasicFieldKeys, getCreateFeedingFieldKeys } from './dog-profile-create-view'

describe('create-flow redesign regressions', () => {
  it('keeps creation-step ownership stable', () => {
    expect(getCreateBasicFieldKeys()).toContain('currentWeightKg')
    expect(getCreateFeedingFieldKeys()).not.toContain('currentWeightKg')
  })
})
```

- [ ] **Step 2: Run the shared dog-profile test suite**

Run:

```bash
npx --yes vitest@3.2.4 run \
  miniapp/src/utils/dog-profile-create-view.spec.ts \
  miniapp/src/utils/dog-profile-form.spec.ts \
  miniapp/src/utils/dog-profile-create-actions.spec.ts \
  miniapp/src/utils/dog-profile-overview.spec.ts \
  miniapp/src/utils/dog-recommendation-summary.spec.ts \
  miniapp/src/utils/health-records.spec.ts
```

Expected:

- PASS across create, overview, recommendation, and health helper suites

- [ ] **Step 3: Run the full miniapp build**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/codex-dog-profile-flow/miniapp
npm run build:mp-weixin
```

Expected:

- Build succeeds
- No new template/runtime compile errors

- [ ] **Step 4: Perform manual QA in WeChat DevTools**

Run these flows manually:

```text
1. Add dog -> Step 1 basic info -> Step 2 feeding -> Step 3 recommendation -> Step 4 skip/create
2. Add dog -> Step 1 manual breed entry -> Step 2 choose BCS/activity/treats -> Step 3 back -> Step 2 retains state
3. Add dog -> Step 4 add one health record with attachment -> save record -> finish create
```

Expected:

- Step 1 has no weight-management entry
- Step 2 has no weight field or exact treat kcal field
- Step 3 has no manual update button
- Step 4 supports skip and per-record save

- [ ] **Step 5: Commit the final verified create-flow redesign**

```bash
git -C /Users/zhaochen/Documents/SevenKitchen/.worktrees/codex-dog-profile-flow add \
  miniapp/src/pages/dog-create/index.vue \
  miniapp/src/utils/dog-profile-create-view.ts \
  miniapp/src/utils/dog-profile-create-view.spec.ts \
  miniapp/src/utils/dog-profile-form.ts \
  miniapp/src/utils/dog-profile-form.spec.ts \
  miniapp/src/utils/dog-profile-create-actions.ts \
  miniapp/src/utils/dog-profile-create-actions.spec.ts \
  miniapp/src/utils/health-records.ts \
  miniapp/src/utils/health-records.spec.ts \
  miniapp/src/components/dog-profile/RecommendationSummaryCard.vue \
  miniapp/src/components/dog-profile/HealthRecordsSection.vue
git -C /Users/zhaochen/Documents/SevenKitchen/.worktrees/codex-dog-profile-flow commit -m "feat: redesign dog profile create flow"
```

---

## Self-Review

### Spec coverage

- Step 1 basic-info redesign: covered in Task 2
- Step 2 feeding-only redesign: covered in Task 3
- Step 3 recommendation confirmation page: covered in Task 4
- Step 4 low-blocking health page: covered in Task 5
- Shared helper reuse and creation payload boundaries: covered in Task 1
- Regression/build/manual QA: covered in Task 6

### Placeholder scan

- No `TODO`/`TBD` placeholders left in tasks
- Every task includes explicit file targets, commands, and example code

### Type consistency

- `currentWeightKg` and `isNeutered` are consistently owned by Step 1
- `bcsScore`, `activityLevel`, `mealsPerDay`, `treatLevel` are consistently owned by Step 2
- Step 3 action text matches the approved design
- Step 4 keeps per-record save plus separate picky-food reminders
