# 生命阶段自动匹配 · 实施计划（P0 + P1）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让小程序在详情 / 订购 / DIY 三页按狗狗档案自动选对食谱版本，只在幼犬/繁殖期选错时确认一次，并让订单、制作单、复购都能看到版本。

**Architecture:** 后端把"选版 + 风险分级"收成一次 `GET /recipes/:id` 的结论（`matchType` + `riskLevel` + `NO_DOG`），前端不再单独请求、不再自己判断；三页共用 `LifeStageVersionBar` + `LifeStageVersionSheet` 两个组件和一份纯函数文案表（`life-stage-ui.ts`），换狗/换版都走"重新加载菜谱"这一条路。

**Tech Stack:** NestJS + Prisma（backend）；uni-app + Vue 3 + TypeScript + vitest（miniapp）。

**Spec:** `docs/superpowers/specs/2026-11-02-life-stage-auto-match-design.md`

## Global Constraints

- 顾客可见文案**禁用**："不匹配"、"没有完全匹配版本"、"手动展示"、"档案对应 XX 阶段"。
- 版本中文名固定 5 个：`幼犬版（14 周内）`、`幼犬版（14 周以上）`、`成犬版`、`低活动 / 老年版`、`繁殖期版`；后端 `SERIES_LIFE_STAGE_LABELS` 与前端 `getLifeStageLabel` 必须逐字一致。
- 微信 `showModal` 按钮**最多 4 个汉字**（确认 `仍要继续`，取消 `看合适版`）。
- 前端**不得**自己算生命阶段，也**不得**自己拼风险等级；只读后端 `matchType` / `riskLevel`。
- 没选狗（`NO_DOG`）时，任何页面都不得出现"不匹配 / 没有完全匹配 / 请确认是否适合"。
- 旧版兼容：`manual` 参数缺省时，**有 `lifeStage` 就视为手动**（与今天行为一致）。
- 不新增 DIY 制作单表字段；制作单版本从"它指向的那一版菜谱"读取。
- 不改生命阶段判定算法、不改营养/价格/分装逻辑。

## Review Focus

- **没选狗 / 狗不属于当前用户**：打开任何食谱都不得出现警示；`dogId` 解析失败一律 `NO_DOG`。
- **快速换狗 / 连点换版**：版本、饭量、价格必须属于同一只狗、同一版（请求序号守卫）。
- **旧版小程序**：仍传 `lifeStage` 不传 `manual` 时，行为与今天完全一致（不能把顾客选的版本悄悄换掉）。
- **幼犬狗 + 只有成犬版的菜**：`riskLevel=HIGH`，确认文案必须说清"钙磷/能量密度不同"，且取消能去幼犬筛选。
- **历史订单 / 制作单**：没有版本字段时只少一行字，不报错、不猜。

---

## File Structure

**后端**

| 文件 | 责任 |
|---|---|
| `backend/src/domain/recipe/recipe-series.ts` | 版本中文名、`resolveSeriesLifeStageRisk()` |
| `backend/src/interfaces/dto/recipes/recipe-response.dto.ts` | `matchType` 增加 `NO_DOG`；新增 `riskLevel` / `manualLifeStage` |
| `backend/src/interfaces/controllers/recipes.controller.ts` | `manual` 参数、`NO_DOG`、风险回填、选版语义 |
| `backend/src/domain/recipe/types.ts` | `RecipeSnapshot` 增加 `series_life_stage` / `_label` |
| `backend/src/application/recipe/production-recipe-snapshot.ts` | 快照写入上述字段 |
| `backend/src/application/order/order.service.ts`、`backend/src/application/tasting-pack/tasting-pack-production.service.ts` | 传入版本字段 |

**小程序**

| 文件 | 责任 |
|---|---|
| `miniapp/src/utils/life-stage-ui.ts`（新） | 八态判定、版本条文案、版本面板文案、确认弹窗文案（纯函数） |
| `miniapp/src/composables/useLifeStageVersion.ts` | 改为"读菜谱结论 → 八态"的映射器，不再发请求 |
| `miniapp/src/components/recipe/LifeStageVersionBar.vue`（新） | 版本条 |
| `miniapp/src/components/recipe/LifeStageVersionSheet.vue`（新） | 版本面板 |
| `miniapp/src/pages/recipe-detail/index.vue` | 详情页接入 |
| `miniapp/src/pages/recipe-order/index.vue` | 订购页接入、删顶部下拉、确认一次 |
| `miniapp/src/pages/recipe-diy/index.vue` | DIY 页接入、换版、生成时确认 |
| `miniapp/src/pages/diy-sheet/index.vue` | 只读版本行、打印 |
| `miniapp/src/pages/checkout/index.vue`、`miniapp/src/pages/order-detail/index.vue`、`miniapp/src/pages/orders-list/index.vue` | 版本展示、复购提示 |
| `miniapp/src/utils/label-mapping.ts` | 统一版本中文名 |

---

## Task 1: 后端 · 风险分级函数

**Files:**
- Modify: `backend/src/domain/recipe/recipe-series.ts`
- Test: `backend/tests/domain/recipe/recipe-series.spec.ts`

**Interfaces:**
- Produces: `type SeriesLifeStageRisk = 'HIGH' | 'LOW' | 'NONE'`；`resolveSeriesLifeStageRisk(dogLifeStage?: string | null, recipeLifeStage?: string | null): SeriesLifeStageRisk`

- [ ] **Step 1: 写失败测试**

在 `recipe-series.spec.ts` 追加：

```ts
import { resolveSeriesLifeStageRisk } from '../../../src/domain/recipe/recipe-series';

describe('resolveSeriesLifeStageRisk', () => {
  it('幼犬与非幼犬 → HIGH，双向都成立', () => {
    expect(resolveSeriesLifeStageRisk('PUPPY_14_WEEKS_PLUS', 'HIGH_ACTIVITY_ADULT')).toBe('HIGH');
    expect(resolveSeriesLifeStageRisk('HIGH_ACTIVITY_ADULT', 'PUPPY_UNDER_14_WEEKS')).toBe('HIGH');
  });

  it('繁殖期与非繁殖期 → HIGH', () => {
    expect(resolveSeriesLifeStageRisk('REPRODUCTION', 'LOW_ACTIVITY_ADULT_OR_SENIOR')).toBe('HIGH');
  });

  it('成犬与低活动/老年 → LOW', () => {
    expect(resolveSeriesLifeStageRisk('HIGH_ACTIVITY_ADULT', 'LOW_ACTIVITY_ADULT_OR_SENIOR')).toBe('LOW');
  });

  it('同版、缺值、未知阶段 → NONE', () => {
    expect(resolveSeriesLifeStageRisk('HIGH_ACTIVITY_ADULT', 'HIGH_ACTIVITY_ADULT')).toBe('NONE');
    expect(resolveSeriesLifeStageRisk(null, 'HIGH_ACTIVITY_ADULT')).toBe('NONE');
    expect(resolveSeriesLifeStageRisk('HIGH_ACTIVITY_ADULT', 'SOMETHING_ELSE')).toBe('NONE');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/domain/recipe/recipe-series.spec.ts -t resolveSeriesLifeStageRisk`
Expected: FAIL（`resolveSeriesLifeStageRisk is not a function`）

- [ ] **Step 3: 实现**

在 `recipe-series.ts` 追加（导出常量 `ORDERED_RECIPE_SERIES_LIFE_STAGES` 已有，可复用）：

```ts
export type SeriesLifeStageRisk = 'HIGH' | 'LOW' | 'NONE';

const PUPPY_SERIES_STAGES = new Set(['PUPPY_UNDER_14_WEEKS', 'PUPPY_14_WEEKS_PLUS']);

export function resolveSeriesLifeStageRisk(
  dogLifeStage?: string | null,
  recipeLifeStage?: string | null,
): SeriesLifeStageRisk {
  if (!dogLifeStage || !recipeLifeStage) return 'NONE';
  if (!ORDERED_RECIPE_SERIES_LIFE_STAGES.includes(dogLifeStage as never)) return 'NONE';
  if (!ORDERED_RECIPE_SERIES_LIFE_STAGES.includes(recipeLifeStage as never)) return 'NONE';
  if (dogLifeStage === recipeLifeStage) return 'NONE';
  if (PUPPY_SERIES_STAGES.has(dogLifeStage) !== PUPPY_SERIES_STAGES.has(recipeLifeStage)) return 'HIGH';
  if ((dogLifeStage === 'REPRODUCTION') !== (recipeLifeStage === 'REPRODUCTION')) return 'HIGH';
  return 'LOW';
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest tests/domain/recipe/recipe-series.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/src/domain/recipe/recipe-series.ts backend/tests/domain/recipe/recipe-series.spec.ts
git commit -m "feat(life-stage): 后端风险分级（幼犬/繁殖期 HIGH，成犬↔老年 LOW）"
```

---

## Task 2: 后端 · 结论契约（NO_DOG / manual / riskLevel）

**Files:**
- Modify: `backend/src/interfaces/dto/recipes/recipe-response.dto.ts`
- Modify: `backend/src/interfaces/controllers/recipes.controller.ts:1311-1420,1920-1990,1805-1840`
- Test: `backend/tests/interfaces/controllers/recipes.controller.spec.ts`

**Interfaces:**
- Consumes: `resolveSeriesLifeStageRisk()`（Task 1）
- Produces: `matchType` 增加 `'NO_DOG'`；`riskLevel?: 'HIGH' | 'LOW' | 'NONE'`；`manualLifeStage?: string`；`GET /recipes/:id?manual=true|false`

- [ ] **Step 1: 写失败测试**

在 `recipes.controller.spec.ts` 的 `GET /api/v1/recipes/:id` describe 内追加（复用该文件已有的 `mockPrismaService`、`publicSeriesRecipe`、`dog-1` 等 fixture）：

```ts
it('没有 dogId 时返回 NO_DOG，不带警示文案', async () => {
  const res = await request(app.getHttpServer()).get('/api/v1/recipes/series-1');
  expect(res.body.data.lifeStageMatch.matchType).toBe('NO_DOG');
  expect(res.body.data.lifeStageMatch.riskLevel).toBe('NONE');
  expect(res.body.data.lifeStageMatch.message).toBeUndefined();
});

it('dogId 解析不到狗时也返回 NO_DOG', async () => {
  mockPrismaService.dog.findFirst.mockResolvedValueOnce(null);
  const res = await request(app.getHttpServer())
    .get('/api/v1/recipes/series-1?dogId=missing-dog');
  expect(res.body.data.lifeStageMatch.matchType).toBe('NO_DOG');
});

it('manual=false 时忽略 lifeStage，按狗选版', async () => {
  // 沿用现有 dog-1（SENIOR + 低活动）与 series-1 两个版本的 mock
  const res = await request(app.getHttpServer())
    .get('/api/v1/recipes/series-1?dogId=dog-1&lifeStage=HIGH_ACTIVITY_ADULT&manual=false')
    .set('Authorization', 'Bearer customer-token');
  expect(res.body.data.lifeStageMatch.selectedLifeStage).toBe('LOW_ACTIVITY_ADULT_OR_SENIOR');
  expect(res.body.data.lifeStageMatch.matchType).toBe('MATCHED');
});

it('旧版：有 lifeStage 但不传 manual → 仍按手动选中处理（兼容）', async () => {
  const res = await request(app.getHttpServer())
    .get('/api/v1/recipes/series-1?dogId=dog-1&lifeStage=HIGH_ACTIVITY_ADULT')
    .set('Authorization', 'Bearer customer-token');
  expect(res.body.data.lifeStageMatch.matchType).toBe('MANUAL_MISMATCH');
  expect(res.body.data.lifeStageMatch.riskLevel).toBe('LOW');
});

it('幼犬狗 + 成犬版（手动或回退）→ HIGH 风险', async () => {
  mockPrismaService.dog.findFirst.mockResolvedValueOnce({
    id: 'dog-puppy', name: '奶糖', breedId: null,
    birthday: new Date(Date.now() - 90 * 24 * 3600 * 1000),
    lifeStageOverride: 'NONE', activityLevel: 'MEDIUM', sizeClassOverride: null,
  });
  const res = await request(app.getHttpServer())
    .get('/api/v1/recipes/series-1?dogId=dog-puppy&lifeStage=HIGH_ACTIVITY_ADULT&manual=true')
    .set('Authorization', 'Bearer customer-token');
  expect(res.body.data.lifeStageMatch.matchType).toBe('MANUAL_MISMATCH');
  expect(res.body.data.lifeStageMatch.riskLevel).toBe('HIGH');
});
```

> 具体 fixture id 以文件里已有的为准（`adult-recipe-id` / `senior-recipe-id` / `dog-puppy` 若不存在，用现有 mock 命名替换，保持断言不变）。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/interfaces/controllers/recipes.controller.spec.ts -t "NO_DOG|manual"` 
Expected: FAIL（`matchType` 是 `FALLBACK_ADULT` / 不认 `manual`）

- [ ] **Step 3: 改 DTO**

```ts
export type RecipeLifeStageMatchType =
  | 'NO_DOG'
  | 'MATCHED'
  | 'MANUAL_MISMATCH'
  | 'FALLBACK_ADULT'
  | 'FALLBACK_FIRST'
  | 'LEGACY';

export interface RecipeLifeStageMatchDto {
  requestedLifeStage?: string;
  manualLifeStage?: string;
  riskLevel?: 'HIGH' | 'LOW' | 'NONE';
  // 其余字段不变
}
```

- [ ] **Step 4: 改选版逻辑**

`resolveRequestedSeriesLifeStage(manualLifeStage, dogId, req, manual)`：
- 没有 `dogId` → `{ hasDog: false, requestedLifeStage: manual ? manualLifeStage : undefined }`
- 狗查不到 → 同上（`hasDog: false`）
- 查到狗 → `dogLifeStage`；`requestedLifeStage = manual ? (manualLifeStage || dogLifeStage) : dogLifeStage`；`manualLifeStage` 只在 `manual && manualLifeStage && manualLifeStage !== dogLifeStage` 时返回

`resolvePublicSeriesSelection`：
```ts
const matchType = !hasDog
  ? 'NO_DOG'
  : manualLifeStage && exactMatch
    ? 'MANUAL_MISMATCH'
    : selectedLifeStage === dogLifeStage
      ? 'MATCHED'
      : selectedLifeStage === 'HIGH_ACTIVITY_ADULT'
        ? 'FALLBACK_ADULT'
        : 'FALLBACK_FIRST';
const riskLevel = hasDog
  ? resolveSeriesLifeStageRisk(dogLifeStage, selectedLifeStage)
  : 'NONE';
```

`GET /recipes/:id` 与 `GET /recipes/:id/life-stage-match` 都加：
```ts
@Query('manual') manual?: string,
...
const manualSelection = manual === undefined ? Boolean(lifeStage) : manual === 'true';
```

- [ ] **Step 5: 跑测试**

Run: `cd backend && npx jest tests/interfaces/controllers/recipes.controller.spec.ts`
Expected: PASS（含原有 life-stage 用例；若旧用例断言 `FALLBACK_*` 在无狗场景，改为 `NO_DOG`）

- [ ] **Step 6: 提交**

```bash
git add backend/src/interfaces/dto/recipes/recipe-response.dto.ts backend/src/interfaces/controllers/recipes.controller.ts backend/tests/interfaces/controllers/recipes.controller.spec.ts
git commit -m "feat(life-stage): 结论增加 NO_DOG/manual/riskLevel，手动选择只认显式 manual"
```

---

## Task 3: 版本中文名统一（前后端）

**Files:**
- Modify: `backend/src/domain/recipe/recipe-series.ts:33-39`
- Modify: `miniapp/src/utils/label-mapping.ts:66-80`
- Test: `backend/tests/domain/recipe/recipe-series.spec.ts`、`miniapp/src/utils/life-stage-match.spec.ts`

**Interfaces:**
- Produces: 5 个固定中文名（见 Global Constraints），前后端逐字一致。

- [ ] **Step 1: 写失败测试**

后端 `recipe-series.spec.ts`：
```ts
it('版本中文名与前端约定一致', () => {
  expect(SERIES_LIFE_STAGE_LABELS.PUPPY_UNDER_14_WEEKS).toBe('幼犬版（14 周内）');
  expect(SERIES_LIFE_STAGE_LABELS.PUPPY_14_WEEKS_PLUS).toBe('幼犬版（14 周以上）');
  expect(SERIES_LIFE_STAGE_LABELS.HIGH_ACTIVITY_ADULT).toBe('成犬版');
  expect(SERIES_LIFE_STAGE_LABELS.LOW_ACTIVITY_ADULT_OR_SENIOR).toBe('低活动 / 老年版');
  expect(SERIES_LIFE_STAGE_LABELS.REPRODUCTION).toBe('繁殖期版');
});
```

小程序 `life-stage-match.spec.ts` 把原断言改成同样 5 个字符串。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/domain/recipe/recipe-series.spec.ts -t "中文名"`
Run: `cd miniapp && npx vitest run src/utils/life-stage-match.spec.ts`
Expected: FAIL

- [ ] **Step 3: 改两份映射表**

只改字符串，不改 key；`LEGACY` 不在两张表里（不展示）。

- [ ] **Step 4: 跑测试**

Run: 同上
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/src/domain/recipe/recipe-series.ts backend/tests/domain/recipe/recipe-series.spec.ts miniapp/src/utils/label-mapping.ts miniapp/src/utils/life-stage-match.spec.ts
git commit -m "feat(life-stage): 统一版本中文名（幼犬版/成犬版/低活动·老年版/繁殖期版）"
```

---

## Task 4: 后端 · 订单快照记录版本

**Files:**
- Modify: `backend/src/domain/recipe/types.ts:13-24`
- Modify: `backend/src/application/recipe/production-recipe-snapshot.ts:48-58,99-160`
- Modify: `backend/src/application/order/order.service.ts:1403,2016`
- Modify: `backend/src/application/tasting-pack/tasting-pack-production.service.ts:421`
- Test: `backend/tests/application/recipe/production-recipe-snapshot.spec.ts`（不存在则新建）

**Interfaces:**
- Produces: `RecipeSnapshot.series_life_stage?: string`、`series_life_stage_label?: string`；`BuildProductionRecipeSnapshotParams.seriesLifeStage?` / `seriesLifeStageLabel?`

- [ ] **Step 1: 写失败测试**

新建/追加：
```ts
it('快照写入生命阶段版本与中文名', () => {
  const snapshot = buildProductionRecipeSnapshot({
    recipe: baseRecipe,
    ingredientMap: new Map(),
    prepMethodMap: new Map(),
    seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
    seriesLifeStageLabel: '成犬版',
  });
  expect(snapshot.series_life_stage).toBe('HIGH_ACTIVITY_ADULT');
  expect(snapshot.series_life_stage_label).toBe('成犬版');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/recipe/production-recipe-snapshot.spec.ts`
Expected: FAIL

- [ ] **Step 3: 实现并接线**

- `RecipeSnapshot` 加两个可选字段。
- `BuildProductionRecipeSnapshotParams` 加两个可选参数，返回值写入。
- 三个调用点传入 `recipe.seriesLifeStage` 与 `SERIES_LIFE_STAGE_LABELS[...]`；若调用点的 recipe select 没有 `seriesLifeStage`，补上。

- [ ] **Step 4: 跑测试 + 订单相关测试**

Run: `cd backend && npx jest tests/application/recipe/production-recipe-snapshot.spec.ts tests/application/order`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/src/domain/recipe/types.ts backend/src/application/recipe/production-recipe-snapshot.ts backend/src/application/order/order.service.ts backend/src/application/tasting-pack/tasting-pack-production.service.ts backend/tests/application/recipe/production-recipe-snapshot.spec.ts
git commit -m "feat(order): 订单快照记录生命阶段版本"
```

---

## Task 5: 小程序 · 八态与文案纯函数

**Files:**
- Create: `miniapp/src/utils/life-stage-ui.ts`
- Create: `miniapp/src/utils/life-stage-ui.spec.ts`
- Modify: `miniapp/src/utils/life-stage-match.ts`（`LifeStageMatchVerdict` 增加 `riskLevel` / `manualLifeStage`）

**Interfaces:**
- Produces:
  - `type LifeStageUiState = 'no_dog' | 'unknown' | 'matched' | 'manual_low' | 'manual_high' | 'fallback_low' | 'fallback_high' | 'legacy'`
  - `resolveLifeStageUiState(input: { hasDog: boolean; verdict?: LifeStageMatchVerdict | null }): LifeStageUiState`
  - `buildLifeStageBarCopy(state, ctx): { title: string; subtitle: string; action: 'switch' | 'restore' | 'suitable' | 'retry' | 'add_dog' | 'none'; actionLabel: string }`
  - `buildRiskConfirmCopy(ctx: { dogName: string; dogAgeText?: string; currentVersionLabel: string }): { title; content; confirmText: '仍要继续'; cancelText: '看合适版' }`
  - `buildVersionOptionSubtitle(lifeStage: string): string`

- [ ] **Step 1: 写失败测试**

```ts
import { resolveLifeStageUiState, buildLifeStageBarCopy, buildRiskConfirmCopy } from './life-stage-ui';

it('没狗优先于任何结论', () => {
  expect(resolveLifeStageUiState({ hasDog: false, verdict: { matchType: 'FALLBACK_ADULT' } })).toBe('no_dog');
});
it('没结论是 unknown，LEGACY 是 legacy', () => {
  expect(resolveLifeStageUiState({ hasDog: true, verdict: null })).toBe('unknown');
  expect(resolveLifeStageUiState({ hasDog: true, verdict: { matchType: 'LEGACY' } })).toBe('legacy');
});
it('手动不匹配按风险分两档', () => {
  expect(resolveLifeStageUiState({ hasDog: true, verdict: { matchType: 'MANUAL_MISMATCH', riskLevel: 'HIGH' } })).toBe('manual_high');
  expect(resolveLifeStageUiState({ hasDog: true, verdict: { matchType: 'MANUAL_MISMATCH', riskLevel: 'LOW' } })).toBe('manual_low');
});
it('回退按风险分两档', () => {
  expect(resolveLifeStageUiState({ hasDog: true, verdict: { matchType: 'FALLBACK_FIRST', riskLevel: 'HIGH' } })).toBe('fallback_high');
  expect(resolveLifeStageUiState({ hasDog: true, verdict: { matchType: 'FALLBACK_ADULT', riskLevel: 'LOW' } })).toBe('fallback_low');
});
it('版本条文案不含系统词', () => {
  const copy = buildLifeStageBarCopy('manual_low', { dogName: '旺财', currentLabel: '幼犬版（14 周以上）', suggestedLabel: '成犬版' });
  expect(copy.subtitle).toBe('当前不是按旺财档案匹配的版本');
  expect(copy.actionLabel).toBe('恢复为成犬版');
  expect(copy.subtitle).not.toContain('不匹配');
});
it('确认弹窗按钮不超过 4 字，且点名当前版本', () => {
  const copy = buildRiskConfirmCopy({ dogName: '旺财', dogAgeText: '3个月', currentVersionLabel: '成犬版' });
  expect(copy.content).toContain('成犬版');
  expect(copy.confirmText.length).toBeLessThanOrEqual(4);
  expect(copy.cancelText.length).toBeLessThanOrEqual(4);
  expect(copy.content).toContain('钙磷比例');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd miniapp && npx vitest run src/utils/life-stage-ui.spec.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现纯函数**（照 Spec 5.1 / 5.2 / 3.4 的逐字文案；不要在组件里再写文案）

- [ ] **Step 4: 跑测试确认通过**

Run: `cd miniapp && npx vitest run src/utils/life-stage-ui.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add miniapp/src/utils/life-stage-ui.ts miniapp/src/utils/life-stage-ui.spec.ts miniapp/src/utils/life-stage-match.ts
git commit -m "feat(life-stage): 八态判定与文案纯函数"
```

---

## Task 6: 小程序 · 版本条 / 版本面板组件

**Files:**
- Create: `miniapp/src/components/recipe/LifeStageVersionBar.vue`
- Create: `miniapp/src/components/recipe/LifeStageVersionSheet.vue`
- Test: `miniapp/src/components/recipe/LifeStageVersionBar.spec.ts`（源码断言，沿用项目现有方式）

**Interfaces:**
- Consumes: `LifeStageUiState`、`buildLifeStageBarCopy()`（Task 5）
- Produces: `<LifeStageVersionBar :state :dog-name :dog-age-text :current-label :suggested-label :version-count @switch @retry @add-dog @see-suitable />`；`<LifeStageVersionSheet v-model:visible :versions @select />`

- [ ] **Step 1: 写失败测试**

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

it('版本条不写死文案，必须走 life-stage-ui', () => {
  const src = readFileSync(resolve(__dirname, 'LifeStageVersionBar.vue'), 'utf8');
  expect(src).toContain("from '@/utils/life-stage-ui'");
  expect(src).not.toContain('不匹配');
  expect(src).not.toContain('没有完全匹配');
});
it('只有多版本才出现换一版', () => {
  const src = readFileSync(resolve(__dirname, 'LifeStageVersionBar.vue'), 'utf8');
  expect(src).toContain('versionCount > 1');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd miniapp && npx vitest run src/components/recipe/LifeStageVersionBar.spec.ts`
Expected: FAIL（ENOENT）

- [ ] **Step 3: 实现两个组件**

- 版本条：两行 + 右侧动作；4 种色调（中性/琥珀/红/灰）；`v-if="state !== 'legacy'"`；无状态时不渲染。
- 版本面板：底部弹层，列表项显示版本名 + `buildVersionOptionSubtitle()`，当前/匹配标记，选中后点"用这个版本"才 emit。
- 样式复用 `LifeStageVersionCard.vue` 的色值；不引全局样式。

- [ ] **Step 4: 跑测试确认通过**

Run: 同上
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add miniapp/src/components/recipe/LifeStageVersionBar.vue miniapp/src/components/recipe/LifeStageVersionSheet.vue miniapp/src/components/recipe/LifeStageVersionBar.spec.ts
git commit -m "feat(life-stage): 版本条与版本面板组件"
```

---

## Task 7: 小程序 · Composable 改为结论映射器

**Files:**
- Modify: `miniapp/src/composables/useLifeStageVersion.ts`
- Modify: `miniapp/src/composables/useLifeStageVersion.spec.ts`

**Interfaces:**
- Consumes: `resolveLifeStageUiState()`（Task 5）
- Produces: `useLifeStageVersion({ verdict, dogId, applicableStages?, dogName? }) => { state, riskLevel, dogLifeStage, isMatch, reminderText, selectedLabel }`（**移除** `check` / `checkFailed`）

- [ ] **Step 1: 改测试（先失败）**

```ts
it('不再发请求：源码里没有 fetchLifeStageMatch', () => {
  expect(source).not.toContain('fetchLifeStageMatch');
});
it('没狗时 state 是 no_dog', () => {
  // 用 createApp 或直接测 resolveLifeStageUiState 的入参拼接
});
```

（项目现有 spec 是源码断言 + 少量逻辑测试；保留"不自己判定"的断言：仍必须使用 `isLifeStageMismatch` 的地方改为读 `verdict.matchType`，但**不得**出现 `resolveDogRecipeLifeStage`。）

- [ ] **Step 2: 跑测试确认失败**

Run: `cd miniapp && npx vitest run src/composables/useLifeStageVersion.spec.ts`
Expected: FAIL

- [ ] **Step 3: 重写 composable**

```ts
export function useLifeStageVersion(options: {
  verdict: () => LifeStageMatchVerdict | null | undefined
  dogId: () => string | null | undefined
  applicableStages?: () => unknown
  dogName?: () => string | null | undefined
}) { ... }
```
- `state = computed(() => resolveLifeStageUiState({ hasDog: Boolean(dogId()), verdict: verdict() }))`
- `isMatch = state === 'matched' || state === 'legacy' || state === 'no_dog'`
- `selectedLabel = verdict()?.selectedLifeStageLabel || getLifeStageLabel(verdict()?.selectedLifeStage)`
- 保留 `dogLifeStage`、`reminderText`（仅在需要兜底时用）

- [ ] **Step 4: 跑测试**

Run: 同上，Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add miniapp/src/composables/useLifeStageVersion.ts miniapp/src/composables/useLifeStageVersion.spec.ts
git commit -m "refactor(life-stage): composable 改为结论映射，不再单独请求"
```

---

## Task 8: 小程序 · 详情页

**Files:**
- Modify: `miniapp/src/pages/recipe-detail/index.vue`
- Test: `miniapp/src/pages/recipe-detail.regression.spec.ts`

**Interfaces:**
- Consumes: `<LifeStageVersionBar>` / `<LifeStageVersionSheet>`（Task 6）、composable（Task 7）

- [ ] **Step 1: 改回归断言（先失败）**

- 断言页面含 `<LifeStageVersionBar`、`:state="lifeStageState"`、`<LifeStageVersionSheet`。
- 断言 `buildOrderRoute` / `buildDiyRoute` 只在 `selectedManualLifeStage` 有值时拼 `lifeStage`，并带 `manual=true`。
- 断言不再含 `<LifeStageVersionCard`。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd miniapp && npx vitest run src/pages/recipe-detail.regression.spec.ts`
Expected: FAIL

- [ ] **Step 3: 改页面**

- 组件替换。
- `switchVersion(lifeStage)`：设 `selectedManualLifeStage`，`loadRecipeDetail()`（带 `lifeStage` + `manual=true`）。
- `selectDogForDetail`：清空 `selectedManualLifeStage` 再重载。
- 路由：`lifeStage` 只在手动时带，附 `manual=true`。
- 版本条的 `retry` → `loadRecipeDetail()`；`add-dog` → `goCreateDog()`（详情页已有）。

- [ ] **Step 4: 跑测试**

Run: 同上，Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add miniapp/src/pages/recipe-detail/index.vue miniapp/src/pages/recipe-detail.regression.spec.ts
git commit -m "feat(detail): 详情页接入自动匹配版本条"
```

---

## Task 9: 小程序 · 订购页（核心）

**Files:**
- Modify: `miniapp/src/pages/recipe-order/index.vue`
- Test: `miniapp/src/pages/recipe-order.regression.spec.ts`

**Interfaces:**
- Consumes: 组件 + composable

- [ ] **Step 1: 改回归断言（先失败）**

- 删除/改写：顶部下拉相关断言（`toggleLifeStageDropdown`、`recipe-life-stage-picker`）。
- 新增：`loadDogListThenRecipe` 顺序（源码断言 `await loadDogs()` 在 `await loadRecipeDetail()` 之前）；`selectDog` 后重载菜谱；`manual` 参数只在手动时传；`acknowledgedForOrder` 存在；无 `dismissWarning`。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd miniapp && npx vitest run src/pages/recipe-order.regression.spec.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

- `onMounted`：先 `await loadDogs({ silentSelection: true })` → 定 `selectedDogId` → `await loadRecipeDetail()` → `loadDogCalcResult()`。
- `loadDogs` 增加参数：初始选择时只设 `selectedDogId`，不触发计算/请求。
- `loadRecipeDetail` 请求参数：`dogId`、`manual`（布尔），`lifeStage` 仅在 `manualLifeStage` 有值时传。
- `selectDog`：清 `manualLifeStage` → 重载菜谱 → 重算 → 轻提示（`uni.showToast({ icon: 'none', duration: 1800 })`）。
- 竞态：重载菜谱与重算都走现有请求序号（`pricingPreviewRequestSeq` / `dogCalcRequestSeq`），版本、饭量、价格必须来自同一只狗；旧响应直接丢弃。
- 版本条的 `retry` → 重载菜谱；`add-dog` → `goToCreateDog()`；`see-suitable` → 跳首页并带 `lifeStage` 筛选（`uni.reLaunch` 或 `navigateTo`）。
- `switchVersion`：设 manual → 重载 → 重算；保留 `selectedCycleDays` 与每餐克数偏好。
- 删除顶部选择器模板/样式/函数；把版本列表面板交给 `LifeStageVersionSheet`。
- 下单：`riskLevel === 'HIGH'` 且 `!acknowledgedForOrder` → `confirmLifeStageMismatch`；确认后 `acknowledgedForOrder = true`；换狗/换版置 `false`。删除 `dismissWarning`。
- 复购：读 `previousLifeStage`，与当前 `selectedLifeStage` 不同则显示提示条："上次买的是{旧版本名}；按旺财现在的档案，已换成{新版本名}"（旧版本名用 `getLifeStageLabel`，不显示就不显示）。

- [ ] **Step 4: 跑测试**

Run: 同上，Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add miniapp/src/pages/recipe-order/index.vue miniapp/src/pages/recipe-order.regression.spec.ts
git commit -m "feat(order): 版本跟随狗狗自动切换，确认只做一次"
```

---

## Task 10: 小程序 · DIY 页

**Files:**
- Modify: `miniapp/src/pages/recipe-diy/index.vue`
- Test: `miniapp/src/pages/recipe-diy.regression.spec.ts`（不存在则新建）

- [ ] **Step 1: 断言（先失败）**

- 含 `<LifeStageVersionBar`、版本面板。
- 不含 `acknowledgedLifeStageDogIds`、不含"我已知晓"。
- `generate` 前有 `riskLevel === 'HIGH'` 判断且带 `source: 'diy'`。

- [ ] **Step 2: 跑测试确认失败** → `npx vitest run src/pages/recipe-diy.regression.spec.ts`

- [ ] **Step 3: 实现**

- 选狗区下方加版本条；点"换一版"打开面板，选中后 `manual=true` 重载 `loadRecipe()`。
- `loadRecipe()` 请求带 `dogId` + `manual`。
- `selectDog`：清 manual → 重载菜谱 → 重算。
- 删除卡片、"我已知晓"、`dismissWarning`、`acknowledgedLifeStageDogIds`、`showWarning`。
- `generate()`：`riskLevel === 'HIGH'` → 弹 `confirmLifeStageMismatch(source='diy')`；取消 return。
- 失败（接口错）时不进入制作单，保留页面。
- 版本条的 `retry` → `loadRecipe()`；`add-dog` → `goToCreateDog()`。

- [ ] **Step 4: 跑测试** → PASS

- [ ] **Step 5: 提交**

```bash
git add miniapp/src/pages/recipe-diy/index.vue miniapp/src/pages/recipe-diy.regression.spec.ts
git commit -m "feat(diy): 版本条与换版入口，生成制作单前按风险确认"
```

---

## Task 11: 小程序 · 制作单（只读版本）

**Files:**
- Modify: `miniapp/src/pages/diy-sheet/index.vue`
- Test: `miniapp/src/pages/diy-sheet.regression.spec.ts`

- [ ] **Step 1: 改断言（先失败）**

- 不含 `<LifeStageVersionCard`、不含 `useLifeStageVersion`、不含 `life-stage-unknown-note`。
- 含版本行：`lifeStageLabel`（源码断言 `版本：`）。

- [ ] **Step 2: 跑测试确认失败** → `npx vitest run src/pages/diy-sheet.regression.spec.ts`

- [ ] **Step 3: 实现**

- 删除 composable 调用与两处提示。
- `recipe` 加载后算 `lifeStageLabel = recipe.selectedLifeStageLabel || getLifeStageLabel(recipe.selectedLifeStage)`。
- 头部信息加一行"版本：{{ lifeStageLabel }}"（无值不显示）。
- 打印 canvas 在标题下加同一行（找到文字绘制处，追加一次 `fillText`）。

- [ ] **Step 4: 跑测试** → PASS

- [ ] **Step 5: 提交**

```bash
git add miniapp/src/pages/diy-sheet/index.vue miniapp/src/pages/diy-sheet.regression.spec.ts
git commit -m "feat(diy-sheet): 制作单显示版本（含打印），移除实时判定"
```

---

## Task 12: 订单确认 / 详情 / 复购展示版本

**Files:**
- Modify: `miniapp/src/pages/checkout/index.vue`
- Modify: `miniapp/src/pages/order-detail/index.vue`
- Modify: `miniapp/src/pages/orders-list/index.vue`（复购 query）
- Test: `miniapp/src/pages/checkout.regression.spec.ts`、`miniapp/src/pages/order-detail.regression.spec.ts`

- [ ] **Step 1: 断言（先失败）**

- checkout 模板含 `lifeStageLabel`；order-detail 模板含 `series_life_stage_label`；复购 query 含 `previousLifeStage`。

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现**

- checkout：`orderConfig.lifeStage` → `getLifeStageLabel()`，菜品行右侧小字。
- order-detail：`item.recipeSnapshot?.series_life_stage_label` → 菜品名下"旺财 · 成犬版"；字段缺失（历史单）就整行不渲染，不回查、不猜。
- orders-list / order-detail 复购：query 增加 `previousLifeStage=<snapshot.series_life_stage>`（没有就不加）。

- [ ] **Step 4: 跑测试** → PASS

- [ ] **Step 5: 提交**

```bash
git add miniapp/src/pages/checkout/index.vue miniapp/src/pages/order-detail/index.vue miniapp/src/pages/orders-list/index.vue miniapp/src/pages/checkout.regression.spec.ts miniapp/src/pages/order-detail.regression.spec.ts
git commit -m "feat(order): 订单确认/详情/复购显示生命阶段版本"
```

---

## Task 13: 埋点 + 旧 spec 清理 + 全量验证

**Files:**
- Modify: `miniapp/src/pages/life-stage-warning.regression.spec.ts`（改写，不删除）
- Modify: 相关页面（埋点调用）
- Test: 全量

- [ ] **Step 1: 改写旧断言**

把"四页共用卡片 + 我已知晓 + 每次确认"改为新契约：
- 三页都含 `<LifeStageVersionBar`；
- **不含** `我已知晓`；
- 订购/DIY 含 `riskLevel === 'HIGH'` 与 `confirmLifeStageMismatch`；
- 未选狗不渲染警示（源码断言页面有 `state === 'no_dog'` 分支）。

- [ ] **Step 2: 加埋点**

在版本条渲染 / 打开面板 / 切换成功 / 确认弹出 / 确认结果 处调用 `trackFunnelEvent`，事件名与字段照 Spec 6.8。

- [ ] **Step 3: 全量验证**

```bash
cd backend && npm test
cd ../miniapp && npm test
cd ../miniapp && npm run build:mp-weixin
```

Expected：后端 512 suites / 5594 tests 全过；小程序 2133 tests 全过（唯一例外：`__zhipuImage.guard.spec.ts` 为历史坏测试，主工作区同样失败，允许保留）；构建成功。

- [ ] **Step 4: 手工验收**

照 Spec 7.3 的 9 条逐条走（游客、幼犬、换狗、手动换版、双确认、无幼犬版、复购、制作单、断网）。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "test(life-stage): 回归断言改到新契约，补埋点"
```

---

## 交付前

- `git log --oneline origin/main..HEAD` 应只包含本计划的提交。
- 合并回 `main` 并推送 `origin/main` 后再上传体验版（脚本只从 `origin/main` 构建）。
- 上传前确认 `dist/build` 是**生产**构建（不是 dev）。
