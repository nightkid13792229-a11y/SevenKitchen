# 产品线「发布 / 更新」与封面展示归属 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把产品线的「系列发布」改成「发布 / 更新」：首次发布不勾阶段、把当前已就绪（READY）的阶段一次发（1 个就绪也能发）；已上线系列更新时只发勾选的阶段；展示资料收敛到系列级（封面图、封面角标、一句话卖点），并从后台和展示层移除目标健康标签与封面标题回退。

**Architecture:** 后端先改发布门槛纯函数（可操作阶段、可发布标志、角标提醒），再改服务层（保存门面 `applyToLive`、按 `stageCodes` 发布）；admin-web 改类型/纯函数/抽屉/编辑器入口；miniapp 只改 `resolveCoverBadgeText` 去掉 `coverTitle` 回退。没有数据库迁移。

**Tech Stack:** NestJS + Prisma + Jest（backend）；Vue 3 + Element Plus + Vitest（admin-web）；uni-app + Vitest（miniapp）。

**Spec:** `docs/superpowers/specs/2026-10-26-series-release-and-auto-cover-design.md`

## Global Constraints

- 角标：最多 2 个；只能引用 `recipe_health_tag` 合规词表；选填；没选就什么都不显示。
- 小程序首页/详情页：封面文字只来自 `coverBadges`，**不再回退 `coverTitle`**；空角标 → 不渲染。
- 定制交付页：`RecipeCover` 的标题/版本 badge 不动。
- 产品线（CATALOG）：`coverTitle` 不再编辑、不再必填、不再展示；DB 列与 API 字段保留，不做迁移。
- 目标健康标签：两个抽屉的 UI 移除；后端字段、API、AI 写入、筛选逻辑本期都不动。
- 首次发布：不显示阶段勾选；范围 = 当前已就绪（READY）的阶段；**1 个就绪也能发，不要求 5 个齐全**；没有 READY 才不能发。
- 更新：只显示可操作阶段（READY 新阶段 + PUBLIC 有更新）的勾选，默认全选；`stageCodes` 省略 = 全量，空数组 = 400。
- 下架后重新上线：按首次发布处理（当前 READY，≥1 个即可），判定用 `businessStatus`。
- 门面保存：`applyToLive=true` 只由后台「保存发布设置」传入；AI `set_copy` 不传。
- 已上线系列保存时，封面图/一句话卖点不能清空（400）；未上线系列允许留空。
- 封面图上传限制沿用：JPG/PNG/WebP，≤5MB；**封面只能走系统上传，不提供外链粘贴/URL 输入**。一句话卖点 ≤200 字。封面标题 ≤20 字（仅旧数据/旧页面）。
- 小程序只做体验版代码上传，不发布正式版。
- 本地联调期间不要跑 `backend npm run build`（会删 `dist`）；类型自检用 `npx tsc --noEmit`。

## Review Focus

1. **已上线系列把封面/卖点清空**：应 400，线上商品不能变空白。测试归属：Task 2。
2. **更新只勾 A 阶段**：B 阶段的待更新版本不能被改成 PUBLIC。测试归属：Task 2。
3. **首次发布**：不能依赖前端传 `stageCodes`，后端必须自己取当前全部 READY；**只有 1 个 READY 也要能发**。测试归属：Task 2。
4. **没配角标的老系列**：小程序首页/详情页不能再显示 `coverTitle` 兜底。测试归属：Task 6。
5. **AI 改文案**：`set_copy` 调 `updateSeriesReleaseSettings` 时不能触发线上同步。测试归属：Task 2。

---

### Task 1: 后端发布门槛纯函数

**Files:**
- Modify: `backend/src/domain/recipe-designer/series-release-readiness.ts`
- Test: `backend/tests/domain/recipe-designer/series-release-readiness.spec.ts`

**注意：** 本任务与 Task 2 共享同一组类型改动；Task 1 提交后后端 `tsc` 可能暂时红（服务层还在用旧字段），Task 2 收口。中间不要单独部署。

**Interfaces:**
- Produces:
  - `SeriesReleaseBlockerCode = 'COVER_IMAGE_REQUIRED' | 'SELLING_POINT_REQUIRED'`
  - `SeriesReleaseWarningCode = 'COVER_BADGE_MISSING'`
  - `SeriesReleaseStageReadiness` 增加 `actionable: boolean`
  - `SeriesReleaseReadiness` 删除 `requiredLifeStages` / `requiredStages`，增加 `canRelease: boolean`；`presentation.coverBadges: string[]`；`summary` 改为 `{ totalStageCount, publishableStageCount, pendingStageCount, publishedStageCount, upToDateStageCount, designedStageCount, actionableStageCount }`
  - `BuildSeriesReleaseReadinessInput` 删除 `requiredLifeStages`

- [ ] **Step 1: 改测试，先写新口径**

在 `series-release-readiness.spec.ts` 删除「必做阶段」相关用例，新增：

```ts
it('marks READY and PUBLIC+pending stages as actionable', () => {
  const result = buildSeriesReleaseReadiness({
    seriesId: 's1',
    designMode: 'CATALOG',
    businessStatus: 'PUBLIC',
    presentation: {
      coverImageUrl: 'https://cdn.example.com/c.jpg',
      coverTitle: null,
      sellingPoint: '低脂易消化',
      coverBadges: ['低脂'],
    },
    stages: [
      stage({ stageCode: 'PUPPY_UNDER_14_WEEKS', label: '幼犬', status: 'READY' }),
      stage({
        stageCode: 'HIGH_ACTIVITY_ADULT',
        label: '成犬',
        status: 'PUBLIC',
        latestRecipeVersion: 4,
        publishedRecipeVersion: 3,
        hasPendingUpdate: true,
      }),
      stage({
        stageCode: 'LOW_ACTIVITY_ADULT_OR_SENIOR',
        label: '老年犬',
        status: 'PUBLIC',
        latestRecipeVersion: 2,
        publishedRecipeVersion: 2,
      }),
    ],
  });

  expect(result.stages.map((s) => [s.stageCode, s.actionable])).toEqual([
    ['PUPPY_UNDER_14_WEEKS', true],
    ['HIGH_ACTIVITY_ADULT', true],
    ['LOW_ACTIVITY_ADULT_OR_SENIOR', false],
  ]);
  expect(result.summary).toEqual({
    totalStageCount: 3,
    publishableStageCount: 1,
    pendingStageCount: 1,
    publishedStageCount: 2,
    upToDateStageCount: 1,
    designedStageCount: 3,
    actionableStageCount: 2,
  });
  expect(result.canRelease).toBe(true);
});

it('does not block on a missing cover title; warns when no badge is set', () => {
  const result = buildSeriesReleaseReadiness({
    seriesId: 's1',
    designMode: 'CATALOG',
    presentation: {
      coverImageUrl: 'https://cdn.example.com/c.jpg',
      coverTitle: null,
      sellingPoint: '低脂易消化',
      coverBadges: [],
    },
    stages: [stage({ stageCode: 'HIGH_ACTIVITY_ADULT', label: '成犬', status: 'READY' })],
  });

  expect(result.blockers.map((b) => b.code)).toEqual([]);
  expect(result.warnings.map((w) => w.code)).toEqual(['COVER_BADGE_MISSING']);
  expect(result.ready).toBe(true);
  expect(result.canRelease).toBe(true);
});

it('is ready but not releasable when there is no actionable stage', () => {
  const result = buildSeriesReleaseReadiness({
    seriesId: 's1',
    designMode: 'CATALOG',
    presentation: {
      coverImageUrl: 'https://cdn.example.com/c.jpg',
      sellingPoint: '低脂易消化',
      coverBadges: ['低脂'],
    },
    stages: [stage({ stageCode: 'HIGH_ACTIVITY_ADULT', label: '成犬', status: 'EMPTY' })],
  });

  expect(result.ready).toBe(true);
  expect(result.canRelease).toBe(false);
  expect(result.summary.actionableStageCount).toBe(0);
});

it('allows first release when only one stage is READY', () => {
  const result = buildSeriesReleaseReadiness({
    seriesId: 's1',
    designMode: 'CATALOG',
    presentation: {
      coverImageUrl: 'https://cdn.example.com/c.jpg',
      sellingPoint: '低脂易消化',
      coverBadges: ['低脂'],
    },
    stages: [
      stage({ stageCode: 'HIGH_ACTIVITY_ADULT', label: '成犬', status: 'READY' }),
      stage({ stageCode: 'PUPPY_UNDER_14_WEEKS', label: '幼犬' }),
      stage({ stageCode: 'PUPPY_14_WEEKS_PLUS', label: '大幼犬' }),
      stage({ stageCode: 'LOW_ACTIVITY_ADULT_OR_SENIOR', label: '低活动' }),
      stage({ stageCode: 'REPRODUCTION', label: '繁殖期' }),
    ],
  });

  expect(result.ready).toBe(true);
  expect(result.canRelease).toBe(true);
  expect(result.summary).toMatchObject({
    totalStageCount: 5,
    publishableStageCount: 1,
    actionableStageCount: 1,
    designedStageCount: 1,
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && npx jest tests/domain/recipe-designer/series-release-readiness.spec.ts --runInBand`
Expected: FAIL —— 新字段不存在，旧用例还在断言 `requiredLifeStages`。

- [ ] **Step 3: 实现新类型与新 builder**

在 `series-release-readiness.ts`：

- 删除 `REQUIRED_LIFE_STAGES_EMPTY`、`REQUIRED_LIFE_STAGE_UNKNOWN`、`REQUIRED_STAGE_NOT_READY`、`COVER_TITLE_REQUIRED`、`TARGET_HEALTH_TAGS_MISSING`；
- `actionable` 的计算放在 `hasPendingUpdate` 之后：`status === 'READY' || (status === 'PUBLIC' && hasPendingUpdate)`；
- `canRelease = blockers.length === 0 && actionableStageCount > 0`；
- `coverBadges` 用 `normalizeStringList(presentation.coverBadges)`；
- 角标为空时 push `COVER_BADGE_MISSING`（`scope: 'PRESENTATION'`, `field: 'coverBadges'`）；
- 删除 `describeStageStatus` / `requiredStageCodeSet` 等只服务必做阶段的代码。

- [ ] **Step 4: 运行测试确认通过**

Run: `cd backend && npx jest tests/domain/recipe-designer/series-release-readiness.spec.ts --runInBand`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add backend/src/domain/recipe-designer/series-release-readiness.ts backend/tests/domain/recipe-designer/series-release-readiness.spec.ts
git commit -m "feat(recipe-designer): derive series release scope from stage status"
```

---

### Task 2: 后端服务与接口（门面保存、按阶段更新、角标进 readiness）

**Files:**
- Modify: `backend/src/application/recipe-designer/recipe-designer.service.ts`
- Modify: `backend/src/interfaces/dto/recipe-designer/recipe-designer.dto.ts`
- Modify: `backend/src/interfaces/controllers/recipe-designer.controller.ts`
- Test: `backend/tests/application/recipe-designer/series-staged-release.spec.ts`
- Test: `backend/tests/interfaces/controllers/recipe-designer.controller.spec.ts`

**注意：** 现有 spec 的 prisma mock 需要补 `recipeSeriesCoverBadge.findMany`、`recipe.updateMany` 的断言，以及 `$transaction` 透传；先看同文件已有事务用例的写法。

**Interfaces:**
- Consumes: Task 1 的 `SeriesReleaseReadiness` / `SeriesReleaseStageReadiness.actionable` / `canRelease`。
- Produces:
  - `releaseSeries(seriesId, access, options?: { stageCodes?: string[] }): Promise<SeriesReleaseResult>`
  - `updateSeriesReleaseSettings(seriesId, dto, access, options?: { applyToLive?: boolean })`
  - `class ReleaseRecipeSeriesDto { stageCodes?: string[] }`
  - `SeriesReleaseResult` 删除 `requiredLifeStages`

- [ ] **Step 1: 写服务测试**

在 `series-staged-release.spec.ts` 的 `releaseSeries` describe 里新增/改写：

```ts
it('releases all READY stages on first release and ignores caller stageCodes', async () => {
  // 夹具：系列 businessStatus=DRAFT，两个 READY 阶段、一个 EMPTY
  // 断言：两条 READY 最新 DRAFT → PUBLIC；EMPTY 仍无行；series.businessStatus=PUBLIC
  // 调用：releaseSeries(seriesId, access, { stageCodes: [只传一个] })
  // 期望：两条都发布（首次发布忽略 stageCodes）
});

it('releases a single READY stage when it is the only ready one', async () => {
  // 夹具：businessStatus=DRAFT，一个 READY + 其余 EMPTY
  // 调用：releaseSeries(seriesId, access)（不传 stageCodes）
  // 断言：只有那个 READY 的最新 DRAFT → PUBLIC；其余阶段仍无 Recipe；系列 → PUBLIC
});

it('releases only the selected pending stages and leaves the others DRAFT', async () => {
  // 夹具：businessStatus=PUBLIC，A/PUBLIC+新 DRAFT，B/PUBLIC+新 DRAFT
  // 调用：releaseSeries(seriesId, access, { stageCodes: ['A'] })
  // 断言：A 的最新 DRAFT 变 PUBLIC；B 的最新 DRAFT 仍是 DRAFT；B 的旧 PUBLIC 不变
});

it('rejects an empty stageCodes array (already published series)', async () => {
  // 夹具：businessStatus=PUBLIC，至少一个可操作阶段
  await expect(
    service.releaseSeries(seriesId, access, { stageCodes: [] }),
  ).rejects.toThrow('请至少选择一个要更新的阶段');
});

it('rejects stage codes that are not actionable', async () => {
  await expect(
    service.releaseSeries(seriesId, access, { stageCodes: ['HIGH_ACTIVITY_ADULT'] }),
  ).rejects.toThrow('当前不可更新');
});

it('rejects a first release with zero READY stages', async () => {
  // 夹具：businessStatus=DRAFT，没有任何 READY 阶段
  // 断言：releaseSeries 抛 400「还没有可发布的阶段」；事务未开；series 未被置 PUBLIC
});

it('rejects an update with zero actionable stages instead of a no-op release', async () => {
  // 夹具：businessStatus=PUBLIC，所有阶段都已是最新（无 actionable）
  // 调用：releaseSeries(seriesId, access)（不传 stageCodes）
  // 断言：抛 400「当前没有可更新的阶段」；recipe.updateMany 未被调用
});

it('applies facade fields to live recipes only when applyToLive is true', async () => {
  // 调用 updateSeriesReleaseSettings(..., { applyToLive: true })
  // 断言 recipe.updateMany 被调用，where 含 { seriesId, status: 'PUBLIC' }
  // 再调用一次不传 applyToLive（模拟 AI set_copy）
  // 断言 recipe.updateMany 未被第二次调用
});

it('rejects clearing cover or selling point on a live series', async () => {
  await expect(
    service.updateSeriesReleaseSettings(seriesId, { coverImageUrl: null }, access),
  ).rejects.toThrow('已上线系列不能清空封面图');
  await expect(
    service.updateSeriesReleaseSettings(seriesId, { sellingPoint: '' }, access),
  ).rejects.toThrow('已上线系列不能清空一句话卖点');
});
```

在 `getSeriesReleaseReadiness` describe 新增：

```ts
it('includes cover badge names in readiness presentation', async () => {
  // prisma.recipeSeriesCoverBadge.findMany 返回 [{ healthTag: { name: '低脂' } }]
  // 断言 readiness.presentation.coverBadges === ['低脂']
});
```

在 controller spec 新增：

```ts
it('passes release stageCodes from the body', async () => {
  await controller.releaseSeries('s1', { stageCodes: ['HIGH_ACTIVITY_ADULT'] }, user);
  expect(service.releaseSeries).toHaveBeenCalledWith(
    's1',
    expect.anything(),
    { stageCodes: ['HIGH_ACTIVITY_ADULT'] },
  );
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && npx jest tests/application/recipe-designer/series-staged-release.spec.ts tests/interfaces/controllers/recipe-designer.controller.spec.ts --runInBand`
Expected: FAIL —— 方法签名/行为还没改。

- [ ] **Step 3: 实现**

`updateSeriesReleaseSettings`：
- 删除 `requiredLifeStages` 分支；
- 计算 `isLive = series.businessStatus === PUBLIC || (await prisma.recipe.count({ where: { seriesId, status: PUBLIC } })) > 0`；
- 已上线时，`coverImageUrl` / `sellingPoint` 被传成空值 → `BadRequestException`；
- 用 `$transaction` 包住 series update + 可选 `recipe.updateMany({ where: { seriesId, status: PUBLIC }, data: buildSeriesPresentationUpdateData(saved) })`；
- `applyToLive` 默认 false。

`releaseSeries`：
- 新增 `options: { stageCodes?: string[] } = {}`；
- `isFirstRelease = readiness.releaseState === 'UNPUBLISHED'`；
- 首次：`selected = actionable.filter(s => s.status === 'READY').map(s => s.stageCode)`，忽略 `options.stageCodes`；
- 更新：`options.stageCodes === undefined` → 全部 actionable；空数组 → 400；非法代码 → 400；
- 目标只取选中阶段：`pickSeriesReleasePublishTargets(sources.recipes).filter(r => selectedSet.has(resolveSeriesReleaseRecipeStage(r)))`；
- 事务里两次 `updateMany`：
  1. 选中目标：`data: { ...presentationData, status: PUBLIC }`；
  2. 其余所有 PUBLIC 行：`data: presentationData`（`id: { notIn: targetIds }`）；
- `publishedRecipeCount = 第一次.count`，`updatedRecipeCount = 第一次.count + 第二次.count`；
- `releasedStageCodes = selected`；结果删除 `requiredLifeStages`；
- 新增私有 `buildSeriesPresentationUpdateData(series)`：封面图/卖点必写；coverTitle 仅非空写；targetHealthTags 仅非空写。

`buildSeriesReleaseReadinessForSeries`：
- 删除 `requiredLifeStages` 入参/传参；
- 传入 `coverBadges: string[]`；
- 新增私有 `loadSeriesCoverBadgeNames(seriesId)`，用 `recipeSeriesCoverBadge.findMany({ where: { seriesId }, select: { healthTag: { select: { name: true } } }, orderBy: { sortOrder: 'asc' } })`；
- `getSeriesReleaseReadiness` 与 `releaseSeries` 都先取角标名再 build。

DTO/controller：
- `ReleaseRecipeSeriesDto`（`@IsOptional @IsArray @ArrayMaxSize(RECIPE_SERIES_RELEASE_STAGE_CODES.length) @IsString({ each: true }) stageCodes?: string[]`）；
- controller `releaseSeries` 增加 `@Body() dto: ReleaseRecipeSeriesDto`，调用 `service.releaseSeries(seriesId, access, { stageCodes: dto?.stageCodes })`；
- controller 的 `updateSeriesReleaseSettings`（PATCH release-settings）必须传 `{ applyToLive: true }`——这是「人点保存」的唯一入口；AI 适配器直接调服务，不传，保持 false。
- controller spec 增加：`expect(service.updateSeriesReleaseSettings).toHaveBeenCalledWith(..., { applyToLive: true })`。

- [ ] **Step 4: 运行测试确认通过**

Run: `cd backend && npx jest tests/application/recipe-designer/series-staged-release.spec.ts tests/interfaces/controllers/recipe-designer.controller.spec.ts --runInBand`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add backend/src/application/recipe-designer/recipe-designer.service.ts backend/src/interfaces/dto/recipe-designer/recipe-designer.dto.ts backend/src/interfaces/controllers/recipe-designer.controller.ts backend/tests/application/recipe-designer/series-staged-release.spec.ts backend/tests/interfaces/controllers/recipe-designer.controller.spec.ts
git commit -m "feat(recipe-designer): release selected series stages and sync live facade"
```

---

### Task 3: admin-web 类型、API 与纯函数

**Files:**
- Modify: `admin-web/src/types/recipeDesigner.ts`
- Modify: `admin-web/src/api/recipeDesigner.ts`
- Modify: `admin-web/src/utils/recipeDesigner/seriesRelease.ts`
- Test: `admin-web/src/utils/recipeDesigner/seriesRelease.spec.ts`

**注意：** 本任务会改前端类型；`seriesRelease.regression.spec.ts` 里引用旧字段的源文本断言要同步删掉（否则会红），新的抽屉断言留到 Task 4 加。

**Interfaces:**
- Consumes: Task 1/2 的 readiness/result 类型。
- Produces:
  - `SeriesReleaseForm { coverImageUrl: string; sellingPoint: string; coverBadgeHealthTagIds: string[] }`
  - `buildSeriesReleaseForm(readiness, coverBadgeHealthTagIds?: string[]): SeriesReleaseForm`
  - `buildSeriesReleaseSettingsPatch(form, baseline)`（只含 coverImageUrl/sellingPoint）
  - `isSeriesReleaseBadgesDirty(form, baseline): boolean`
  - `isSeriesReleaseFormDirty(form, baseline): boolean`（设置 + 角标）
  - `seriesReleaseProgress(readiness)` → `{ published, total, percent, label }`
  - `seriesReleasePrimaryActionVerb(readiness): '发布' | '更新'`
  - `resolveSeriesReleaseActionableStages(readiness)`
  - `resolveSeriesReleaseDefaultSelectedStageCodes(readiness): string[]`（首次 = `[]`；更新 = 全部 actionable）
  - `seriesReleaseStageScopeLabel(stage): '待发布' | '有更新' | '已是最新' | '未入库' | '未设计'`
  - `releaseSeries(seriesId, payload?: { stageCodes?: string[] })`
  - 前端类型删除 `requiredLifeStages` / `requiredStages` / `COVER_TITLE_REQUIRED` / `TARGET_HEALTH_TAGS_MISSING`，增加 `canRelease` / `actionable` / `coverBadges`

- [ ] **Step 1: 改纯函数测试**

在 `seriesRelease.spec.ts` 删除必填阶段/健康标签用例，新增：

```ts
it('hydrates cover, selling point and badge ids', () => {
  const form = buildSeriesReleaseForm(
    { presentation: { coverImageUrl: ' x ', sellingPoint: ' 卖点 ', coverBadges: ['低脂'] } } as any,
    ['tag-1'],
  )
  expect(form).toEqual({
    coverImageUrl: 'x',
    sellingPoint: '卖点',
    coverBadgeHealthTagIds: ['tag-1'],
  })
})

it('patches only cover and selling point', () => {
  const patch = buildSeriesReleaseSettingsPatch(
    { coverImageUrl: 'new', sellingPoint: '', coverBadgeHealthTagIds: [] },
    { coverImageUrl: 'old', sellingPoint: 'old', coverBadgeHealthTagIds: [] },
  )
  expect(patch).toEqual({ coverImageUrl: 'new', sellingPoint: null })
})

it('counts badge changes as dirty', () => {
  const a = { coverImageUrl: '', sellingPoint: '', coverBadgeHealthTagIds: [] }
  const b = { ...a, coverBadgeHealthTagIds: ['tag-1'] }
  expect(isSeriesReleaseFormDirty(a, b)).toBe(true)
})

it('defaults selection to none for first release and all actionable for update', () => {
  const readiness = { releaseState: 'UNPUBLISHED', stages: [{ stageCode: 'A', actionable: true }] } as any
  expect(resolveSeriesReleaseDefaultSelectedStageCodes(readiness)).toEqual([])
  const update = { releaseState: 'PUBLISHED', stages: [{ stageCode: 'A', actionable: true }, { stageCode: 'B', actionable: false }] } as any
  expect(resolveSeriesReleaseDefaultSelectedStageCodes(update)).toEqual(['A'])
})

it('labels action verb and scope', () => {
  expect(seriesReleasePrimaryActionVerb({ releaseState: 'UNPUBLISHED' } as any)).toBe('发布')
  expect(seriesReleasePrimaryActionVerb({ releaseState: 'NEEDS_UPDATE' } as any)).toBe('更新')
  expect(seriesReleaseStageScopeLabel({ status: 'READY' } as any)).toBe('待发布')
  expect(seriesReleaseStageScopeLabel({ status: 'PUBLIC', hasPendingUpdate: true } as any)).toBe('有更新')
  expect(seriesReleaseStageScopeLabel({ status: 'PUBLIC', hasPendingUpdate: false } as any)).toBe('已是最新')
  expect(seriesReleaseStageScopeLabel({ status: 'DRAFT' } as any)).toBe('未入库')
  expect(seriesReleaseStageScopeLabel({ status: 'EMPTY' } as any)).toBe('未设计')
})

it('shows published progress over all stages', () => {
  expect(
    seriesReleaseProgress({
      summary: { publishedStageCount: 2, totalStageCount: 5 },
    } as any),
  ).toEqual({ published: 2, total: 5, percent: 40, label: '已上线 2/5 个阶段' })
})

it('uses canRelease to decide whether the primary action is available', () => {
  expect(isSeriesReleasePrimaryActionAvailable({ canRelease: false } as any)).toBe(false)
  expect(isSeriesReleasePrimaryActionAvailable({ canRelease: true } as any)).toBe(true)
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd admin-web && npx vitest run src/utils/recipeDesigner/seriesRelease.spec.ts`
Expected: FAIL —— 类型/函数不存在。

- [ ] **Step 3: 实现**

- 类型按 Interfaces 改；`UpdateRecipeSeriesReleaseSettingsPayload` 删除 `requiredLifeStages`/`targetHealthTags`；`SeriesReleaseResult` 删除 `requiredLifeStages`。
- `api/recipeDesigner.ts` 的 `releaseSeries` 改为 `(seriesId, payload: { stageCodes?: string[] } = {}) => api.post(..., payload)`。
- 纯函数按 Interfaces 改；`seriesReleaseProgress` 用 `publishedStageCount / totalStageCount`；`isSeriesReleaseFormDirty` = `hasSeriesReleaseSettingsPatch(patch) || isSeriesReleaseBadgesDirty(form, baseline)`；`buildSeriesReleaseSettingsPatch` 只看 `coverImageUrl`/`sellingPoint`。
- 同步删掉 `seriesRelease.regression.spec.ts` 里引用 `requiredStages`/`requiredLifeStages`/`REQUIRED_STAGE_NOT_READY`/`TARGET_HEALTH_TAGS_MISSING` 的旧断言；抽屉的新断言 Task 4 再加。

- [ ] **Step 4: 运行测试确认通过**

Run: `cd admin-web && npx vitest run src/utils/recipeDesigner/seriesRelease.spec.ts src/views/RecipeDesigner/seriesRelease.regression.spec.ts`
Expected: PASS（抽屉断言暂时只保留仍成立的部分）。

- [ ] **Step 5: 提交**

```bash
git add admin-web/src/types/recipeDesigner.ts admin-web/src/api/recipeDesigner.ts admin-web/src/utils/recipeDesigner/seriesRelease.ts admin-web/src/utils/recipeDesigner/seriesRelease.spec.ts
git commit -m "feat(admin-web): align series release types and form with staged updates"
```

---

### Task 4: 发布 / 更新抽屉

**Files:**
- Modify: `admin-web/src/views/RecipeDesigner/components/SeriesReleaseDrawer.vue`
- Test: `admin-web/src/views/RecipeDesigner/seriesRelease.regression.spec.ts`

**Interfaces:**
- Consumes: Task 3 的 form/patch/progress/verb/selection 函数；`recipeSeriesCoverBadgeApi`；`recipeHealthTagApi`。
- Produces: 抽屉 UI；`releaseSeries(seriesId, { stageCodes })` 调用；保存时先设置后角标。

- [ ] **Step 1: 改回归 spec 的源文本断言**

在 `seriesRelease.regression.spec.ts` 删除/替换必填阶段、封面标题、健康标签的断言，新增：

```ts
it('uses stage scope selection instead of required life stages', () => {
  expect(drawer).toContain('selectedStageCodes')
  expect(drawer).toContain('resolveSeriesReleaseDefaultSelectedStageCodes')
  expect(drawer).toContain('seriesReleaseStageScopeLabel(stage)')
  expect(drawer).not.toContain('form.requiredLifeStages')
  expect(drawer).not.toContain('requiredLifeStages')
})

it('edits cover, badge and selling point only, with upload-only cover', () => {
  expect(drawer).toContain(':src="form.coverImageUrl"')
  expect(drawer).toContain('v-model="form.sellingPoint"')
  expect(drawer).toContain('v-model="form.coverBadgeHealthTagIds"')
  expect(drawer).toContain('recipeApi.uploadImage(file)')
  expect(drawer).toContain('recipeSeriesCoverBadgeApi')
  expect(drawer).not.toContain('v-model="form.coverImageUrl"')
  expect(drawer).not.toContain('或粘贴已有封面图地址')
  expect(drawer).not.toContain('form.coverTitle')
  expect(drawer).not.toContain('form.targetHealthTags')
})

it('previews the customer cover and sends selected stages', () => {
  expect(drawer).toContain('顾客看到的样子')
  expect(drawer).toContain('coverBadgeText')
  expect(drawer).toContain('releaseSeries(props.seriesId, { stageCodes')
  expect(drawer).toContain('readiness.canRelease')
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd admin-web && npx vitest run src/views/RecipeDesigner/seriesRelease.regression.spec.ts`
Expected: FAIL —— 抽屉还是旧结构。

- [ ] **Step 3: 发布范围与阶段选择**

- 表单改为 `coverImageUrl`、`sellingPoint`、`coverBadgeHealthTagIds`；删除 `requiredLifeStages`/`coverTitle`/`targetHealthTags`。
- 打开时并行拉 `getSeriesReleaseReadiness` 与 `recipeSeriesCoverBadgeApi.get`；用 `buildSeriesReleaseForm(readiness, badgeIds)` 初始化。
- `selectedStageCodes`：
  - `releaseState === 'UNPUBLISHED'`：不渲染勾选框，范围 = `publishableStageCount`；
  - 否则：`stage.actionable` 的复选框绑 `selectedStageCodes`，默认全部 actionable；`全选/清空` 只作用于 actionable。
- 每行展示 `seriesReleaseStageStatusLabel`、`seriesReleaseStageScopeLabel`、`formatSeriesReleaseStageVersion`。
- 运行：`cd admin-web && npx vitest run src/views/RecipeDesigner/seriesRelease.regression.spec.ts -t "uses stage scope selection"` —— PASS。

- [ ] **Step 4: 发布设置与顾客预览**

- 发布设置：封面图上传（保留 `handleCoverUpload`）、角标多选（`:multiple-limit="2"`，选项来自 `healthTags`）、一句话卖点；删除封面标题/目标标签。
- 预览：封面图 + `coverBadgeText`（角标名 ` · ` 连接；空则不渲染）+ 系列名 + 卖点。
- 运行：`cd admin-web && npx vitest run src/views/RecipeDesigner/seriesRelease.regression.spec.ts -t "edits cover"` 与 `-t "previews the customer cover"` —— 两条都 PASS。

- [ ] **Step 5: 保存与发布动作**

- 保存：先 `updateSeriesReleaseSettings`（若有 patch），再 `recipeSeriesCoverBadgeApi.save`（若有变化）；固定提示；保存后刷新 readiness/badges，保留仍可操作的用户勾选。
- 发布：`isUpdate = releaseState !== 'UNPUBLISHED'`；首次不传 body，更新传 `{ stageCodes: selectedStageCodes }`；按钮文案 `${verb} ${count} 个阶段`；`dirty || !readiness.canRelease || (isUpdate && selected.length === 0)` 禁用。
- 底部提示/确认文案按设计稿第 6.2 节。
- 运行 `cd admin-web && npx vitest run src/views/RecipeDesigner/seriesRelease.regression.spec.ts src/utils/recipeDesigner/seriesRelease.spec.ts`，Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add admin-web/src/views/RecipeDesigner/components/SeriesReleaseDrawer.vue admin-web/src/views/RecipeDesigner/seriesRelease.regression.spec.ts
git commit -m "feat(admin-web): revamp series release drawer for staged updates"
```

---

### Task 5: 上线检查只读系列资料、移除目标标签、编辑器入口

**Files:**
- Modify: `admin-web/src/views/RecipeDesigner/components/LaunchReadinessDrawer.vue`
- Modify: `admin-web/src/views/RecipeDesigner/components/PresentationPanel.vue`
- Modify: `admin-web/src/views/RecipeDesigner/Editor.vue`
- Modify: `admin-web/src/views/RecipeDesigner/index.vue`
- Test: `admin-web/src/views/RecipeDesigner/launchReadiness.regression.spec.ts`
- Test: `admin-web/src/views/RecipeDesigner/presentation.regression.spec.ts`
- Test: `admin-web/src/views/RecipeDesigner/seriesRelease.regression.spec.ts`（index/editor 断言）

**Interfaces:**
- Consumes: `getSeriesReleaseReadiness`；`SeriesReleaseDrawer` 的 `modelValue`/`seriesId`/`seriesName`/`released`。
- Produces: `LaunchReadinessDrawer` 新 prop `seriesId?: string` 与 emit `open-series-release`；`PresentationPanel` 不再显示目标标签；编辑器可打开发布抽屉；卡片按钮显示「发布 / 更新」。

- [ ] **Step 1: 写回归断言**

```ts
// launchReadiness.regression.spec.ts
it('shows a read-only series facade block for catalog designs', () => {
  expect(drawer).toContain('系列资料')
  expect(drawer).toContain('open-series-release')
  expect(drawer).toContain('seriesId')
})

// presentation.regression.spec.ts
it('no longer edits target health tags in the order presentation panel', () => {
  expect(source).not.toContain('目标健康标签')
  expect(source).not.toContain('v-model="form.targetHealthTags"')
})

// seriesRelease.regression.spec.ts
it('opens the shared release drawer from the editor and relabels the card entry', () => {
  expect(editorSource).toContain('SeriesReleaseDrawer')
  expect(editorSource).toContain('发布 / 更新')
  expect(indexSource).toContain("'更新'")
  expect(indexSource).toContain("'发布'")
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd admin-web && npx vitest run src/views/RecipeDesigner/launchReadiness.regression.spec.ts src/views/RecipeDesigner/presentation.regression.spec.ts src/views/RecipeDesigner/seriesRelease.regression.spec.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

- `LaunchReadinessDrawer`：
  - props 增加 `seriesId?: string`；
  - `designMode !== 'ORDER' && seriesId` 时拉 `getSeriesReleaseReadiness`，渲染只读「系列资料（共用）」：封面 ✓/✗、卖点 ✓/✗、角标 names 或「未设置（封面左下角为空）」，按钮 emit `open-series-release`；
  - ORDER 保留 `PresentationPanel`，移除目标标签（在组件内改）。
- `PresentationPanel.vue`：删除「目标健康标签」表单项与 `healthTags` 加载；保留其余字段。
- `Editor.vue`：
  - 顶部加「发布 / 更新」按钮（`draft?.seriesId && !orderId`），打开 `SeriesReleaseDrawer`；
  - 接收 launch drawer 的 `open-series-release`，关闭上线检查并打开发布抽屉；
  - `released` 后刷新草稿/上线检查。
- `index.vue`：`seriesReleaseEntryLabel` 返回 `'更新'`（`businessStatus === 'PUBLIC'`）否则 `'发布'`。

- [ ] **Step 4: 运行相关测试**

Run: `cd admin-web && npx vitest run src/views/RecipeDesigner/launchReadiness.regression.spec.ts src/views/RecipeDesigner/presentation.regression.spec.ts src/views/RecipeDesigner/seriesRelease.regression.spec.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add admin-web/src/views/RecipeDesigner/components/LaunchReadinessDrawer.vue admin-web/src/views/RecipeDesigner/components/PresentationPanel.vue admin-web/src/views/RecipeDesigner/Editor.vue admin-web/src/views/RecipeDesigner/index.vue admin-web/src/views/RecipeDesigner/launchReadiness.regression.spec.ts admin-web/src/views/RecipeDesigner/presentation.regression.spec.ts admin-web/src/views/RecipeDesigner/seriesRelease.regression.spec.ts
git commit -m "feat(admin-web): expose series facade status and release entry in editor"
```

---

### Task 6: 小程序封面角标去掉 coverTitle 回退

**Files:**
- Modify: `miniapp/src/utils/cover-badge.ts`
- Create: `miniapp/src/utils/cover-badge.spec.ts`
- Modify: `miniapp/src/pages/home.regression.spec.ts`
- Modify: `miniapp/src/pages/recipe-detail.regression.spec.ts`

**Interfaces:**
- Produces: `resolveCoverBadgeText(source?: { coverBadges?: string[] | null } | null): string` —— 只返回角标；空返回 `''`。

- [ ] **Step 1: 写单测**

```ts
import { describe, expect, it } from 'vitest'
import { resolveCoverBadgeText } from './cover-badge'

describe('resolveCoverBadgeText', () => {
  it('joins series badges with a separator', () => {
    expect(resolveCoverBadgeText({ coverBadges: ['低脂', '易消化'] })).toBe('低脂 · 易消化')
  })

  it('returns empty when no badge is configured, even if a legacy cover title exists', () => {
    expect(resolveCoverBadgeText({ coverBadges: [], coverTitle: '旧封面标题' } as any)).toBe('')
    expect(resolveCoverBadgeText({ coverTitle: '旧封面标题' } as any)).toBe('')
  })

  it('trims and ignores blank badges', () => {
    expect(resolveCoverBadgeText({ coverBadges: [' 低脂 ', '', '  '] })).toBe('低脂')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd miniapp && npx vitest run src/utils/cover-badge.spec.ts`
Expected: FAIL —— 现在还会回退 `coverTitle`。

- [ ] **Step 3: 实现**

`cover-badge.ts` 删除 `legacy` 分支和 `CoverBadgeSource.coverTitle` 字段；JSDoc 改成「角标只来自系列合规词表；没配就不显示」。
页面侧的 `coverTitle?: string` 类型可以先保留（API 仍返回，避免无关改动）；只删解析回退。
`home.regression.spec.ts` / `recipe-detail.regression.spec.ts`：把「回退 coverTitle」的注释改掉；保留 `v-if` 与 class 断言。

- [ ] **Step 4: 运行单测与回归**

Run: `cd miniapp && npx vitest run src/utils/cover-badge.spec.ts src/pages/home.regression.spec.ts src/pages/recipe-detail.regression.spec.ts`
Expected: PASS。

- [ ] **Step 5: 构建小程序**

Run: `cd miniapp && npm run build:mp-weixin`
Expected: 构建成功；产物在 `miniapp/dist/build/mp-weixin`。

- [ ] **Step 6: 提交**

```bash
git add miniapp/src/utils/cover-badge.ts miniapp/src/utils/cover-badge.spec.ts miniapp/src/pages/home.regression.spec.ts miniapp/src/pages/recipe-detail.regression.spec.ts
git commit -m "feat(miniapp): show cover badges without legacy cover-title fallback"
```

---

### Task 7: 全量验证与交付

**Files:** 无新增；可能只改验证中发现的问题。

- [ ] **Step 1: 后端类型与测试**

Run:
```bash
cd backend
npx tsc --noEmit
npx jest tests/domain/recipe-designer/series-release-readiness.spec.ts tests/application/recipe-designer/series-staged-release.spec.ts tests/interfaces/controllers/recipe-designer.controller.spec.ts --runInBand
```
Expected: 类型 0 error；测试全部 PASS。

- [ ] **Step 2: admin-web 测试与构建**

Run:
```bash
cd admin-web
npx vitest run src/utils/recipeDesigner/seriesRelease.spec.ts src/views/RecipeDesigner/seriesRelease.regression.spec.ts src/views/RecipeDesigner/launchReadiness.regression.spec.ts src/views/RecipeDesigner/presentation.regression.spec.ts
npm run build
```
Expected: 测试 PASS；`vue-tsc -b && vite build` 成功。

- [ ] **Step 3: 小程序测试与构建**

Run:
```bash
cd miniapp
npx vitest run src/utils/cover-badge.spec.ts src/pages/home.regression.spec.ts src/pages/recipe-detail.regression.spec.ts
npm run build:mp-weixin
```
Expected: 测试 PASS；构建成功。

- [ ] **Step 4: 全量测试**

Run:
```bash
cd backend && npm test -- --runInBand
cd admin-web && npm test
cd miniapp && npm test
```
Expected: 三个包全绿。若全量测试里有与本计划无关的历史失败，先在交付说明里写清楚是哪条、为什么与本计划无关，不要静默跳过。

- [ ] **Step 5: 体验版上传（按项目规则）**

确认微信开发者工具没有自动化会话占用后：

```bash
cd miniapp
/Applications/wechatwebdevtools.app/Contents/MacOS/cli upload \
  --project "$(pwd)" --version "<当天日期递增版本号>" --desc "发布/更新与封面角标" --lang zh
```

Expected: 看到 `✔ upload`。只上传体验版，不发布正式版。

- [ ] **Step 6: 提交验证修复（如有）**

```bash
git add -A
git commit -m "chore: verify series release and cover badge rollout"
```

---

## 交付说明

- 设计稿：`docs/superpowers/specs/2026-10-26-series-release-and-auto-cover-design.md`（已确认）。
- 本计划不含 AI 自动封面；下阶段按设计稿第 13 节另起计划。
- 小程序只上传体验版；微信开发者工具打开 `miniapp/dist/build/mp-weixin`。
- 后端与 admin-web 的部署按项目既有流程，需先合并到 `main` 并推送 `origin/main`。
