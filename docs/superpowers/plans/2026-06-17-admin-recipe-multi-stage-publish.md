# Admin Recipe Multi-Stage Publish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Web admin recipe list keep one publish button per recipe series while publishing selected or all pending life-stage versions from a button-anchored popover.

**Architecture:** Keep the existing single-version publish endpoint. Enrich series stage summaries with explicit per-stage pending draft metadata, then add a small frontend helper that converts a recipe row into publishable stage options. The recipe list view renders one Element Plus popover beside the existing publish button and calls the existing publish API once per selected stage.

**Tech Stack:** NestJS, Prisma Client, Jest, Vue 3 `<script setup>`, Element Plus, TypeScript, Node `node:test` source-level frontend tests.

---

## File Structure

- `backend/tests/recipe.service.multi-stage-publish.spec.ts`
  - New focused Jest tests for recipe series stage summary data.
- `backend/src/interfaces/dto/recipes/admin-recipe.dto.ts`
  - Add `pendingDraftVersion?: RecipeVersionSummaryDto` to each stage summary.
- `backend/src/application/recipe/recipe.service.ts`
  - Populate `pendingDraftVersion` when a stage has a DRAFT version.
- `admin-web/src/types/recipe.ts`
  - Mirror the backend stage-summary type change.
- `admin-web/src/utils/recipeMultiStagePublish.ts`
  - New pure frontend helper for deriving pending publish options from a recipe row.
- `admin-web/tests/recipeMultiStagePublish.test.ts`
  - New `node:test` tests for the helper.
- `admin-web/tests/recipeNutritionState.test.js`
  - Update existing source-level assertions away from the old single `pendingDraftVersion` click path.
- `admin-web/src/views/Recipes/index.vue`
  - Replace the direct publish click with a button-anchored `el-popover` and multi-stage publishing flow.

---

### Task 1: Backend Stage Summary Includes Pending Draft Version

**Files:**
- Create: `backend/tests/recipe.service.multi-stage-publish.spec.ts`
- Modify: `backend/src/interfaces/dto/recipes/admin-recipe.dto.ts`
- Modify: `backend/src/application/recipe/recipe.service.ts`

- [ ] **Step 1: Write the failing backend test**

Create `backend/tests/recipe.service.multi-stage-publish.spec.ts`:

```ts
import { RecipeService } from '../src/application/recipe/recipe.service';
import { RecipeStatus } from '../src/domain/recipe/enums';
import { AdminRecipeManagementCategory } from '../src/interfaces/dto/recipes/admin-recipe.dto';

describe('RecipeService multi-stage publish summaries', () => {
  const service = new RecipeService({} as any);

  const baseRecipe = {
    recipeId: 'recipe-base',
    name: '牛肉南瓜',
    applicableLifeStages: [],
    managementCategory: AdminRecipeManagementCategory.STANDARD,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
  };

  it('returns a pending draft version for every submitted series life stage', () => {
    const summaries = (service as any).buildRecipeSeriesStageSummaries([
      {
        ...baseRecipe,
        id: 'adult-public-v1',
        recipeId: 'adult-recipe',
        version: 1,
        status: RecipeStatus.PUBLIC,
        seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
      },
      {
        ...baseRecipe,
        id: 'adult-draft-v2',
        recipeId: 'adult-recipe',
        version: 2,
        status: RecipeStatus.DRAFT,
        seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
        updatedAt: new Date('2026-06-02T00:00:00.000Z'),
      },
      {
        ...baseRecipe,
        id: 'senior-draft-v1',
        recipeId: 'senior-recipe',
        version: 1,
        status: RecipeStatus.DRAFT,
        seriesLifeStage: 'LOW_ACTIVITY_ADULT_OR_SENIOR',
      },
      {
        ...baseRecipe,
        id: 'reproduction-public-v1',
        recipeId: 'reproduction-recipe',
        version: 1,
        status: RecipeStatus.PUBLIC,
        seriesLifeStage: 'REPRODUCTION',
      },
    ]);

    const adult = summaries.find(
      (stage: any) => stage.lifeStage === 'HIGH_ACTIVITY_ADULT',
    );
    const senior = summaries.find(
      (stage: any) => stage.lifeStage === 'LOW_ACTIVITY_ADULT_OR_SENIOR',
    );
    const reproduction = summaries.find(
      (stage: any) => stage.lifeStage === 'REPRODUCTION',
    );

    expect(adult).toMatchObject({
      status: 'SUBMITTED',
      recipeVersionId: 'adult-draft-v2',
      pendingDraftVersion: {
        id: 'adult-draft-v2',
        recipeId: 'adult-recipe',
        version: 2,
        status: RecipeStatus.DRAFT,
      },
    });
    expect(senior).toMatchObject({
      status: 'SUBMITTED',
      recipeVersionId: 'senior-draft-v1',
      pendingDraftVersion: {
        id: 'senior-draft-v1',
        recipeId: 'senior-recipe',
        version: 1,
        status: RecipeStatus.DRAFT,
      },
    });
    expect(reproduction?.status).toBe('PUBLISHED');
    expect(reproduction?.pendingDraftVersion).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the backend test to verify RED**

Run:

```bash
cd backend && npm test -- --runInBand tests/recipe.service.multi-stage-publish.spec.ts
```

Expected: FAIL because `pendingDraftVersion` is not present on stage summaries.

- [ ] **Step 3: Add the backend DTO field**

In `backend/src/interfaces/dto/recipes/admin-recipe.dto.ts`, update `RecipeVersionSummaryDto` and `RecipeSeriesStageSummaryDto` to include `recipeId` on version summaries and a per-stage pending draft:

```ts
export interface RecipeVersionSummaryDto {
  id: string;
  recipeId?: string;
  name: string;
  version: number;
  status: RecipeStatus;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeSeriesStageSummaryDto {
  lifeStage: string;
  label: string;
  status:
    | 'NOT_DESIGNED'
    | 'MODIFIED'
    | 'SUBMITTED'
    | 'PUBLISHED'
    | 'USER_RECIPE'
    | 'PRIVATE_CUSTOM';
  recipeVersionId?: string;
  recipeId?: string;
  version?: number;
  updatedAt?: string;
  pendingDraftVersion?: RecipeVersionSummaryDto;
}
```

- [ ] **Step 4: Populate the pending draft summary**

In `backend/src/application/recipe/recipe.service.ts`, update `buildRecipeSeriesStageSummaries()` return data for configured stages:

```ts
      return {
        lifeStage,
        label: SERIES_LIFE_STAGE_LABELS[lifeStage],
        status: stageStatus as RecipeSeriesStageSummaryDto['status'],
        recipeVersionId: stageRecipe.id,
        recipeId: stageRecipe.recipeId,
        version: stageRecipe.version,
        updatedAt: stageRecipe.updatedAt.toISOString(),
        pendingDraftVersion: submittedRecipe
          ? this.mapToVersionSummaryDto(submittedRecipe)
          : undefined,
      };
```

Also update `mapToVersionSummaryDto()`:

```ts
  private mapToVersionSummaryDto(recipe: any): RecipeVersionSummaryDto {
    return {
      id: recipe.id,
      recipeId: recipe.recipeId,
      name: recipe.name,
      version: recipe.version,
      status: recipe.status as RecipeStatus,
      createdAt: recipe.createdAt.toISOString(),
      updatedAt: recipe.updatedAt.toISOString(),
    };
  }
```

- [ ] **Step 5: Run the backend test to verify GREEN**

Run:

```bash
cd backend && npm test -- --runInBand tests/recipe.service.multi-stage-publish.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit backend stage metadata**

Run:

```bash
git add backend/tests/recipe.service.multi-stage-publish.spec.ts backend/src/interfaces/dto/recipes/admin-recipe.dto.ts backend/src/application/recipe/recipe.service.ts
git commit -m "feat: expose pending recipe stage versions"
```

---

### Task 2: Frontend Helper Derives Pending Publish Stages

**Files:**
- Create: `admin-web/tests/recipeMultiStagePublish.test.ts`
- Create: `admin-web/src/utils/recipeMultiStagePublish.ts`
- Modify: `admin-web/src/types/recipe.ts`

- [ ] **Step 1: Write the failing frontend helper test**

Create `admin-web/tests/recipeMultiStagePublish.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { RecipeStatus } from '../src/types/recipe.ts';
import {
  getPendingPublishStages,
  getRecipePublishRowKey,
} from '../src/utils/recipeMultiStagePublish.ts';

test('getPendingPublishStages returns every pending draft stage from a recipe series row', () => {
  const stages = getPendingPublishStages({
    id: 'series-row',
    seriesId: 'series-1',
    name: '牛肉南瓜',
    version: 2,
    status: RecipeStatus.PUBLIC,
    applicableLifeStages: [],
    targetHealthTags: [],
    energyDensityKcalPerKg: 1200,
    salesCount: 0,
    diyGenCount: 0,
    likeCount: 0,
    favoriteCount: 0,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-02T00:00:00.000Z',
    seriesStages: [
      {
        lifeStage: 'HIGH_ACTIVITY_ADULT',
        label: '普通成年犬',
        status: 'SUBMITTED',
        recipeVersionId: 'adult-draft-v2',
        recipeId: 'adult-recipe',
        version: 2,
        pendingDraftVersion: {
          id: 'adult-draft-v2',
          recipeId: 'adult-recipe',
          name: '牛肉南瓜',
          version: 2,
          status: RecipeStatus.DRAFT,
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-02T00:00:00.000Z',
        },
      },
      {
        lifeStage: 'LOW_ACTIVITY_ADULT_OR_SENIOR',
        label: '低能量成年犬 / 老年犬',
        status: 'SUBMITTED',
        recipeVersionId: 'senior-draft-v1',
        recipeId: 'senior-recipe',
        version: 1,
        pendingDraftVersion: {
          id: 'senior-draft-v1',
          recipeId: 'senior-recipe',
          name: '牛肉南瓜',
          version: 1,
          status: RecipeStatus.DRAFT,
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        },
      },
      {
        lifeStage: 'REPRODUCTION',
        label: '繁殖期',
        status: 'PUBLISHED',
        recipeVersionId: 'reproduction-public-v1',
        recipeId: 'reproduction-recipe',
        version: 1,
      },
    ],
  });

  assert.deepEqual(
    stages.map((stage) => ({
      publishRecipeId: stage.publishRecipeId,
      label: stage.label,
      version: stage.version,
    })),
    [
      {
        publishRecipeId: 'adult-draft-v2',
        label: '普通成年犬',
        version: 2,
      },
      {
        publishRecipeId: 'senior-draft-v1',
        label: '低能量成年犬 / 老年犬',
        version: 1,
      },
    ],
  );
});

test('getPendingPublishStages falls back to the row pending draft for legacy non-series rows', () => {
  const stages = getPendingPublishStages({
    id: 'public-row',
    name: '鸡肉饭',
    version: 2,
    status: RecipeStatus.PUBLIC,
    applicableLifeStages: ['HIGH_ACTIVITY_ADULT'] as any,
    targetHealthTags: [],
    energyDensityKcalPerKg: 1100,
    salesCount: 0,
    diyGenCount: 0,
    likeCount: 0,
    favoriteCount: 0,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-02T00:00:00.000Z',
    pendingDraftVersion: {
      id: 'legacy-draft-v3',
      recipeId: 'legacy-recipe',
      name: '鸡肉饭',
      version: 3,
      status: RecipeStatus.DRAFT,
      createdAt: '2026-06-02T00:00:00.000Z',
      updatedAt: '2026-06-03T00:00:00.000Z',
    },
  });

  assert.deepEqual(stages, [
    {
      lifeStage: 'LEGACY_RECIPE',
      label: '当前食谱',
      publishRecipeId: 'legacy-draft-v3',
      version: 3,
    },
  ]);
});

test('getRecipePublishRowKey uses the stable series id before the display row id', () => {
  assert.equal(
    getRecipePublishRowKey({
      id: 'display-row',
      seriesId: 'series-1',
      name: '牛肉南瓜',
      version: 1,
      status: RecipeStatus.PUBLIC,
      applicableLifeStages: [],
      targetHealthTags: [],
      energyDensityKcalPerKg: 1200,
      salesCount: 0,
      diyGenCount: 0,
      likeCount: 0,
      favoriteCount: 0,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    }),
    'series-1',
  );
});
```

- [ ] **Step 2: Run the frontend helper test to verify RED**

Run:

```bash
cd admin-web && node --test tests/recipeMultiStagePublish.test.ts
```

Expected: FAIL because `src/utils/recipeMultiStagePublish.ts` does not exist.

- [ ] **Step 3: Update frontend recipe types**

In `admin-web/src/types/recipe.ts`, update the version and stage summary interfaces:

```ts
export interface RecipeVersionSummary {
  id: string;
  recipeId?: string;
  name: string;
  version: number;
  status: RecipeStatus;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeSeriesStageSummary {
  lifeStage: string;
  label: string;
  status: RecipeSeriesStageStatus;
  recipeVersionId?: string;
  recipeId?: string;
  version?: number;
  updatedAt?: string;
  pendingDraftVersion?: RecipeVersionSummary;
}
```

- [ ] **Step 4: Create the frontend helper**

Create `admin-web/src/utils/recipeMultiStagePublish.ts`:

```ts
import {
  RecipeStatus,
  type RecipeSeriesStageSummary,
  type RecipeSummary,
} from '../types/recipe';

export interface PendingPublishStage {
  lifeStage: string;
  label: string;
  publishRecipeId: string;
  version?: number;
}

export function getRecipePublishRowKey(row: Pick<RecipeSummary, 'id' | 'seriesId'>) {
  return row.seriesId || row.id;
}

export function getPendingPublishStages(row: RecipeSummary): PendingPublishStage[] {
  const seriesStages = (row.seriesStages || [])
    .map(toPendingPublishStage)
    .filter((stage): stage is PendingPublishStage => Boolean(stage));

  if (seriesStages.length > 0) {
    return seriesStages;
  }

  const fallbackTarget =
    row.pendingDraftVersion ||
    (row.status === RecipeStatus.DRAFT
      ? {
          id: row.id,
          version: row.version,
        }
      : undefined);

  if (!fallbackTarget?.id || fallbackTarget.id === row.seriesId) {
    return [];
  }

  return [
    {
      lifeStage: row.seriesLifeStage || 'LEGACY_RECIPE',
      label: row.seriesLifeStageLabel || '当前食谱',
      publishRecipeId: fallbackTarget.id,
      version: fallbackTarget.version,
    },
  ];
}

function toPendingPublishStage(
  stage: RecipeSeriesStageSummary,
): PendingPublishStage | undefined {
  const publishRecipeId =
    stage.pendingDraftVersion?.id ||
    (stage.status === 'SUBMITTED' ? stage.recipeVersionId : undefined);

  if (!publishRecipeId) {
    return undefined;
  }

  return {
    lifeStage: stage.lifeStage,
    label: stage.label,
    publishRecipeId,
    version: stage.pendingDraftVersion?.version ?? stage.version,
  };
}
```

- [ ] **Step 5: Run the frontend helper test to verify GREEN**

Run:

```bash
cd admin-web && node --test tests/recipeMultiStagePublish.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit frontend helper**

Run:

```bash
git add admin-web/tests/recipeMultiStagePublish.test.ts admin-web/src/utils/recipeMultiStagePublish.ts admin-web/src/types/recipe.ts
git commit -m "feat: derive pending recipe stage publish options"
```

---

### Task 3: Recipe List Renders Button-Anchored Multi-Stage Publish Popover

**Files:**
- Modify: `admin-web/tests/recipeNutritionState.test.js`
- Modify: `admin-web/src/views/Recipes/index.vue`

- [ ] **Step 1: Update the source-level frontend test first**

In `admin-web/tests/recipeNutritionState.test.js`, replace the old single-publish assertions inside `admin recipe list groups recipe versions and surfaces pending revision state` with these assertions:

```js
  assert.match(listVue, /row\.pendingDraftVersion/)
  assert.match(listVue, /getPendingPublishStages\(row\)/)
  assert.match(listVue, /<el-popover/)
  assert.match(listVue, /选择要发布的生命阶段/)
  assert.match(listVue, /publishSelectedStages\(row\)/)
  assert.match(listVue, /publishAllPendingStages\(row\)/)
  assert.doesNotMatch(listVue, /handlePublish\(row\.pendingDraftVersion \|\| row\)/)
```

- [ ] **Step 2: Run the source-level frontend test to verify RED**

Run:

```bash
cd admin-web && node --test tests/recipeNutritionState.test.js
```

Expected: FAIL because the recipe list does not yet contain the popover or multi-stage handlers.

- [ ] **Step 3: Import the helper and add popover state**

In `admin-web/src/views/Recipes/index.vue`, update imports:

```ts
import {
  getPendingPublishStages as resolvePendingPublishStages,
  getRecipePublishRowKey,
  type PendingPublishStage,
} from '@/utils/recipeMultiStagePublish';
```

Add state near the existing `loading` and `recipes` refs:

```ts
const activePublishPopoverKey = ref<string>();
const selectedPublishStageIds = ref<string[]>([]);
const publishingRowKey = ref<string>();
```

- [ ] **Step 4: Replace the direct publish button with an Element Plus popover**

In the operation column template, replace the existing publish button block:

```vue
            <el-button
              v-if="row.pendingDraftVersion || row.status === RecipeStatus.DRAFT"
              link
              type="success"
              size="small"
              :disabled="!getPublishTarget(row)"
              @click="handlePublish(row.pendingDraftVersion || row)"
            >
              发布
            </el-button>
```

with:

```vue
            <el-popover
              v-if="getPendingPublishStages(row).length"
              :visible="activePublishPopoverKey === getRecipePublishRowKey(row)"
              trigger="manual"
              placement="bottom-end"
              :width="300"
              popper-class="recipe-publish-popover"
            >
              <template #reference>
                <el-button
                  link
                  type="success"
                  size="small"
                  :loading="publishingRowKey === getRecipePublishRowKey(row)"
                  @click.stop="openPublishPopover(row)"
                >
                  发布
                </el-button>
              </template>
              <div class="publish-popover-content">
                <div class="publish-popover-title">选择要发布的生命阶段</div>
                <el-checkbox-group v-model="selectedPublishStageIds" class="publish-stage-list">
                  <el-checkbox
                    v-for="stage in getPendingPublishStages(row)"
                    :key="stage.publishRecipeId"
                    :label="stage.publishRecipeId"
                    :value="stage.publishRecipeId"
                    class="publish-stage-option"
                  >
                    <span class="publish-stage-label">{{ stage.label }}</span>
                    <el-tag v-if="stage.version" size="small" type="warning">v{{ stage.version }}</el-tag>
                  </el-checkbox>
                </el-checkbox-group>
                <div class="publish-popover-actions">
                  <el-button size="small" @click="closePublishPopover">取消</el-button>
                  <el-button
                    size="small"
                    type="primary"
                    :disabled="!selectedPublishStageIds.length || publishingRowKey === getRecipePublishRowKey(row)"
                    @click="publishSelectedStages(row)"
                  >
                    发布所选
                  </el-button>
                  <el-button
                    size="small"
                    type="success"
                    :disabled="publishingRowKey === getRecipePublishRowKey(row)"
                    @click="publishAllPendingStages(row)"
                  >
                    一键发布全部
                  </el-button>
                </div>
              </div>
            </el-popover>
```

- [ ] **Step 5: Add publish helper methods to the recipe list script**

In `admin-web/src/views/Recipes/index.vue`, replace `getPublishTarget()` and `handlePublish()` with these functions:

```ts
const getPendingPublishStages = (row: RecipeSummary) => {
  return resolvePendingPublishStages(row);
};

const openPublishPopover = (row: RecipeSummary) => {
  const stages = getPendingPublishStages(row);
  if (!stages.length) {
    ElMessage.info('没有待发布的生命阶段');
    return;
  }

  activePublishPopoverKey.value = getRecipePublishRowKey(row);
  selectedPublishStageIds.value = stages.map((stage) => stage.publishRecipeId);
};

const closePublishPopover = () => {
  activePublishPopoverKey.value = undefined;
  selectedPublishStageIds.value = [];
};

const publishSelectedStages = async (row: RecipeSummary) => {
  const selectedIds = new Set(selectedPublishStageIds.value);
  const selectedStages = getPendingPublishStages(row).filter((stage) =>
    selectedIds.has(stage.publishRecipeId),
  );
  await publishPendingStages(row, selectedStages);
};

const publishAllPendingStages = async (row: RecipeSummary) => {
  await publishPendingStages(row, getPendingPublishStages(row));
};

const publishPendingStages = async (
  row: RecipeSummary,
  stages: PendingPublishStage[],
) => {
  if (!stages.length) {
    ElMessage.warning('请选择要发布的生命阶段');
    return;
  }

  const rowKey = getRecipePublishRowKey(row);
  publishingRowKey.value = rowKey;
  const failures: Array<{ stage: PendingPublishStage; message: string }> = [];

  try {
    for (const stage of stages) {
      try {
        await recipeApi.publish(stage.publishRecipeId);
      } catch (error: any) {
        failures.push({
          stage,
          message: error?.message || '发布失败',
        });
      }
    }

    closePublishPopover();
    await loadRecipes();

    if (!failures.length) {
      ElMessage.success(stages.length > 1 ? '全部生命阶段发布成功' : '发布成功');
      return;
    }

    const failureText = failures
      .map(({ stage, message }) => `${stage.label}：${message}`)
      .join('；');
    const message =
      failures.length === stages.length
        ? `发布失败：${failureText}`
        : `部分发布失败：${failureText}`;

    ElMessage({
      type: failures.length === stages.length ? 'error' : 'warning',
      message,
      duration: 6000,
    });
  } finally {
    if (publishingRowKey.value === rowKey) {
      publishingRowKey.value = undefined;
    }
  }
};
```

- [ ] **Step 6: Add popover styling**

In the `<style scoped>` block of `admin-web/src/views/Recipes/index.vue`, add:

```css
.publish-popover-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.publish-popover-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.publish-stage-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.publish-stage-option {
  width: 100%;
  margin-right: 0;
}

.publish-stage-option :deep(.el-checkbox__label) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.publish-stage-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.publish-popover-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}
```

- [ ] **Step 7: Run frontend source and helper tests to verify GREEN**

Run:

```bash
cd admin-web && node --test tests/recipeNutritionState.test.js tests/recipeMultiStagePublish.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit recipe list popover**

Run:

```bash
git add admin-web/tests/recipeNutritionState.test.js admin-web/src/views/Recipes/index.vue
git commit -m "feat: add recipe stage publish popover"
```

---

### Task 4: Full Verification

**Files:**
- No new files.

- [ ] **Step 1: Run targeted backend verification**

Run:

```bash
cd backend && npm test -- --runInBand tests/recipe.service.multi-stage-publish.spec.ts tests/recipe.service.preparation-method-history.spec.ts
```

Expected: PASS.

- [ ] **Step 2: Run targeted frontend verification**

Run:

```bash
cd admin-web && node --test tests/recipeMultiStagePublish.test.ts tests/recipeNutritionState.test.js
```

Expected: PASS.

- [ ] **Step 3: Run admin-web type/build verification**

Run:

```bash
cd admin-web && npm run build
```

Expected: PASS. If the Vite build fails because of unrelated pre-existing environment or dependency issues, capture the exact error and still report the targeted test results.

- [ ] **Step 4: Run backend build verification**

Run:

```bash
cd backend && npm run build
```

Expected: PASS. If Prisma generation requires a database URL and local PostgreSQL is unavailable, use the package default already embedded in `prisma:generate:build`; if it still fails, report the exact failure.

- [ ] **Step 5: Inspect final diff**

Run:

```bash
git status --short
git diff --stat HEAD
```

Expected: only intentional files changed since the last implementation commit, or a clean tree if each task was committed.

---

## Self-Review Checklist

- Spec coverage:
  - One publish button per recipe series: Task 3.
  - Button-position popover: Task 3 uses `el-popover` reference button with `placement="bottom-end"`.
  - All pending life stages selectable: Task 1 and Task 2.
  - Publish selected and publish all: Task 3.
  - Partial failure reporting and refresh: Task 3.
- No database migration: no Prisma schema or migration file is modified.
- Existing single publish endpoint reused: Task 3 calls `recipeApi.publish()` per selected stage.
- TDD order: each implementation task starts with a failing test and verifies it before code changes.
