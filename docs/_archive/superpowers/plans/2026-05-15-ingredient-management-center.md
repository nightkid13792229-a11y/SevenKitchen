# Ingredient Management Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge ingredient nutrition governance and ingredient tag management into the existing ingredient management page so the sidebar exposes a single ingredient-management entry.

**Architecture:** Keep the existing backend APIs and domain models unchanged. Convert `/ingredients` into a tabbed management center, extract the old nutrition governance and tag pages into reusable panels, then redirect the old routes into the relevant tabs. This first implementation focuses on navigation and page consolidation; deeper nutrition workbench redesign remains in the existing nutrition-governance workflow files.

**Tech Stack:** Vue 3, Vue Router, Element Plus, Vite, Node built-in test runner for source-level regression checks.

---

### Task 1: Add Source-Level Regression Test

**Files:**
- Create: `admin-web/tests/ingredientManagementCenter.test.js`
- Read: `admin-web/src/views/Ingredients/index.vue`
- Read: `admin-web/src/router/index.ts`
- Read: `admin-web/src/layouts/MainLayout.vue`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '../..')
const read = (relativePath) => readFileSync(resolve(root, relativePath), 'utf8')

test('ingredient management center owns nutrition governance and tag management tabs', () => {
  const ingredientsPage = read('admin-web/src/views/Ingredients/index.vue')

  assert.match(ingredientsPage, /IngredientNutritionGovernancePanel/)
  assert.match(ingredientsPage, /IngredientTagsPanel/)
  assert.match(ingredientsPage, /activeCenterTab/)
  assert.match(ingredientsPage, /name="standard"/)
  assert.match(ingredientsPage, /name="nutrition"/)
  assert.match(ingredientsPage, /name="tags"/)
  assert.doesNotMatch(ingredientsPage, /name="agent"/)
  assert.doesNotMatch(ingredientsPage, /agent-tab-note/)
})

test('nutrition tab owns source import and Agent operations', () => {
  const nutritionPanel = read('admin-web/src/views/Ingredients/components/IngredientNutritionGovernancePanel.vue')

  assert.match(nutritionPanel, /Agent 设置/)
  assert.match(nutritionPanel, /AgentBatchReviewPanel/)
  assert.match(nutritionPanel, /生成候选/)
  assert.match(nutritionPanel, /导入 USDA/)
  assert.match(nutritionPanel, /批量确认/)
})

test('legacy nutrition and tag routes redirect into ingredient management center', () => {
  const router = read('admin-web/src/router/index.ts')

  assert.match(router, /path:\s*'nutrition-governance'[\s\S]*redirect:\s*\\{ path:\s*'\\/ingredients', query:\s*\\{ tab:\s*'nutrition' \\} \\}/)
  assert.match(router, /path:\s*'ingredient-tags'[\s\S]*redirect:\s*\\{ path:\s*'\\/ingredients', query:\s*\\{ tab:\s*'tags' \\} \\}/)
})

test('sidebar exposes one ingredient management entry', () => {
  const layout = read('admin-web/src/layouts/MainLayout.vue')

  assert.match(layout, /index="\\/ingredients"/)
  assert.match(layout, />原料管理</)
  assert.doesNotMatch(layout, /index="\\/nutrition-governance"/)
  assert.doesNotMatch(layout, /index="\\/ingredient-tags"/)
  assert.doesNotMatch(layout, />原料营养治理</)
  assert.doesNotMatch(layout, />原料标签管理</)
})

test('ingredient management panels are extracted for reuse', () => {
  assert.equal(
    existsSync(resolve(root, 'admin-web/src/views/Ingredients/components/IngredientNutritionGovernancePanel.vue')),
    true,
  )
  assert.equal(
    existsSync(resolve(root, 'admin-web/src/views/Ingredients/components/IngredientTagsPanel.vue')),
    true,
  )
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test admin-web/tests/ingredientManagementCenter.test.js`

Expected: fail because the new test file exists but the two extracted panel files and route redirects are not implemented yet.

### Task 2: Extract Ingredient Tags Panel

**Files:**
- Create: `admin-web/src/views/Ingredients/components/IngredientTagsPanel.vue`
- Read from: `admin-web/src/views/IngredientTags/index.vue`

- [ ] **Step 1: Copy the existing tag-management page into a panel**

Run:

```bash
cp admin-web/src/views/IngredientTags/index.vue admin-web/src/views/Ingredients/components/IngredientTagsPanel.vue
```

- [ ] **Step 2: Patch the copied panel wrapper and import path**

Change the panel root class from `ingredient-tags-page` to `ingredient-tags-panel`, change the header title from `原料标签管理` to `标签体系`, and replace:

```ts
import TagFormComponent from './TagForm.vue'
```

with:

```ts
import TagFormComponent from '@/views/IngredientTags/TagForm.vue'
```

- [ ] **Step 3: Run the new test**

Run: `node --test admin-web/tests/ingredientManagementCenter.test.js`

Expected: still fail because the nutrition panel and route/sidebar changes are not done.

### Task 3: Extract Nutrition Governance Panel

**Files:**
- Create: `admin-web/src/views/Ingredients/components/IngredientNutritionGovernancePanel.vue`
- Read from: `admin-web/src/views/NutritionGovernance/index.vue`

- [ ] **Step 1: Copy the existing nutrition governance page into a panel**

Run:

```bash
cp admin-web/src/views/NutritionGovernance/index.vue admin-web/src/views/Ingredients/components/IngredientNutritionGovernancePanel.vue
```

- [ ] **Step 2: Patch copied component imports**

Replace relative nutrition-governance component imports such as:

```ts
import OverviewCards from './components/OverviewCards.vue'
```

with absolute imports:

```ts
import OverviewCards from '@/views/NutritionGovernance/components/OverviewCards.vue'
```

Apply the same pattern for:

- `FoodCandidatesTable`
- `IngredientNutritionWorkbenchDrawer`
- `SupplementDraftsTable`
- `AgentBatchReviewPanel`
- `AgentSettingsDrawer`

- [ ] **Step 3: Rename the copied panel header**

In the copied template, replace the main heading and subtitle:

```vue
<h2>原料营养治理</h2>
<div class="page-subtitle">候选匹配、补剂标签识别与营养档案确认</div>
```

with:

```vue
<h2>营养档案</h2>
<div class="page-subtitle">来源词条、待审核候选、Agent 建议与营养档案入库</div>
```

- [ ] **Step 4: Keep Agent/data-source operations in the nutrition panel**

The merged version keeps Agent settings and source-import operations inside the nutrition panel. Ensure the panel still renders `Agent 设置`, `AgentBatchReviewPanel`, candidate generation, USDA import, and batch confirmation controls.

- [ ] **Step 5: Run the new test**

Run: `node --test admin-web/tests/ingredientManagementCenter.test.js`

Expected: still fail because the parent page and routes are not wired.

### Task 4: Convert Ingredients Page Into Tabbed Center

**Files:**
- Modify: `admin-web/src/views/Ingredients/index.vue`

- [ ] **Step 1: Import router helpers and extracted panels**

Add imports:

```ts
import { useRoute, useRouter } from 'vue-router'
import IngredientNutritionGovernancePanel from './components/IngredientNutritionGovernancePanel.vue'
import IngredientTagsPanel from './components/IngredientTagsPanel.vue'
```

Update the Vue import to include `watch`:

```ts
import { ref, computed, onMounted, nextTick, watch } from 'vue'
```

- [ ] **Step 2: Add center tab state**

Add after dialog state refs:

```ts
type IngredientCenterTab = 'standard' | 'nutrition' | 'tags'

const route = useRoute()
const router = useRouter()
const centerTabs: IngredientCenterTab[] = ['standard', 'nutrition', 'tags']
const activeCenterTab = ref<IngredientCenterTab>('standard')

const normalizeCenterTab = (value: unknown): IngredientCenterTab => {
  return typeof value === 'string' && centerTabs.includes(value as IngredientCenterTab)
    ? value as IngredientCenterTab
    : 'standard'
}

watch(
  () => route.query.tab,
  (tab) => {
    activeCenterTab.value = normalizeCenterTab(tab)
  },
  { immediate: true }
)

const handleCenterTabChange = async (tab: string | number) => {
  const nextTab = normalizeCenterTab(String(tab))
  if (route.query.tab === nextTab || (nextTab === 'standard' && !route.query.tab)) {
    return
  }

  await router.replace({
    path: '/ingredients',
    query: nextTab === 'standard' ? {} : { ...route.query, tab: nextTab }
  })
}
```

- [ ] **Step 3: Wrap existing page content in the standard tab**

Inside the root `<div class="ingredients-page">`, insert:

```vue
<el-tabs
  v-model="activeCenterTab"
  class="ingredient-center-tabs"
  @tab-change="handleCenterTabChange"
>
  <el-tab-pane label="标准原料" name="standard">
```

before the current `<!-- Header -->`.

Then close the standard tab before the final root `</div>` and add:

```vue
  </el-tab-pane>

  <el-tab-pane label="营养档案" name="nutrition" lazy>
    <IngredientNutritionGovernancePanel />
  </el-tab-pane>

  <el-tab-pane label="标签体系" name="tags" lazy>
    <IngredientTagsPanel />
  </el-tab-pane>
</el-tabs>
```

- [ ] **Step 4: Add center tab styles**

Add:

```css
.ingredient-center-tabs {
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  padding: 0 16px 16px;
}

.ingredient-center-tabs :deep(.el-tabs__header) {
  margin-bottom: 16px;
}

```

- [ ] **Step 5: Run the new test**

Run: `node --test admin-web/tests/ingredientManagementCenter.test.js`

Expected: still fail until routes and sidebar are changed.

### Task 5: Redirect Legacy Routes and Remove Sidebar Entries

**Files:**
- Modify: `admin-web/src/router/index.ts`
- Modify: `admin-web/src/layouts/MainLayout.vue`

- [ ] **Step 1: Replace old route components with redirects**

Replace the `nutrition-governance` route with:

```ts
{
  path: 'nutrition-governance',
  name: 'NutritionGovernance',
  redirect: { path: '/ingredients', query: { tab: 'nutrition' } },
  meta: { title: '原料营养治理' }
},
```

Replace the `ingredient-tags` route with:

```ts
{
  path: 'ingredient-tags',
  name: 'IngredientTags',
  redirect: { path: '/ingredients', query: { tab: 'tags' } },
  meta: { title: '原料标签管理' }
},
```

- [ ] **Step 2: Remove sidebar menu items**

Delete the two menu items:

```vue
<el-menu-item index="/nutrition-governance">
  <el-icon><DataAnalysis /></el-icon>
  <span>原料营养治理</span>
</el-menu-item>
<el-menu-item index="/ingredient-tags">
  <el-icon><PriceTag /></el-icon>
  <span>原料标签管理</span>
</el-menu-item>
```

- [ ] **Step 3: Run the new test**

Run: `node --test admin-web/tests/ingredientManagementCenter.test.js`

Expected: PASS.

### Task 6: Verification

**Files:**
- Verify: `admin-web/src/views/Ingredients/index.vue`
- Verify: `admin-web/src/views/Ingredients/components/IngredientNutritionGovernancePanel.vue`
- Verify: `admin-web/src/views/Ingredients/components/IngredientTagsPanel.vue`
- Verify: `admin-web/src/router/index.ts`
- Verify: `admin-web/src/layouts/MainLayout.vue`

- [ ] **Step 1: Run focused source tests**

Run:

```bash
node --test admin-web/tests/ingredientManagementCenter.test.js admin-web/tests/nutritionGovernanceWorkbench.test.js admin-web/tests/nutritionGovernanceDeepSeekAgent.test.js
```

Expected: all tests pass.

- [ ] **Step 2: Run frontend build**

Run:

```bash
npm --prefix admin-web run build
```

Expected: TypeScript and Vite build pass.

- [ ] **Step 3: Review diff**

Run:

```bash
git diff -- admin-web/src/views/Ingredients/index.vue admin-web/src/views/Ingredients/components/IngredientNutritionGovernancePanel.vue admin-web/src/views/Ingredients/components/IngredientTagsPanel.vue admin-web/src/router/index.ts admin-web/src/layouts/MainLayout.vue admin-web/tests/ingredientManagementCenter.test.js
```

Expected: diff shows only the page merge, extracted panels, sidebar cleanup, route redirects, and source-level regression test.
