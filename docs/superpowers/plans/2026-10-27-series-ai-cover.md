# 产品线 AI 封面 · 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在「发布 / 更新」抽屉的封面图旁给管理员一个按钮，点一次即可生成 16:9 的系列封面（未上线系列直接保存，已上线/已有封面先预览再确认），失败不冲掉原图、不自动重试。

**Architecture:** 后端新增一个只给管理员的控制器 `POST /api/v1/admin/recipe-series/:seriesId/ai-cover` 和一个应用服务 `SeriesCoverImageService`（取系列名 + 最近一份有原料的草稿食材 → 调 `RecipeCoverImageService`）。`RecipeCoverImageService` 只加一个 `layout` 可选参数（默认方图，旧入口零变化），16:9 走现有 `recipe-cover` 压缩预设后转存 COS。前端在 `SeriesReleaseDrawer.vue` 里接入按钮 / 生成中 / 预览 / 错误状态，纯逻辑抽到 `seriesAiCover.ts`。

**Tech Stack:** NestJS + Prisma + Jest（后端）；Vue 3 + Element Plus + Vitest（admin-web）。

**Spec:** `docs/superpowers/specs/2026-10-27-series-ai-cover-design.md`

## 环境与边界

- 只在独立 worktree 开发：`/Users/zhaochen/Documents/SevenKitchen/.worktrees/series-ai-cover-20261027`，分支 `feature/series-ai-cover-20261027`（已从 `origin/main` = `35ceda1f` 切出）。
- **不要**动主工作目录 `/Users/zhaochen/Documents/SevenKitchen`（别的会话在用）和其它 worktree。
- 依赖未安装，先跑：

```bash
cd backend && npm ci
cd admin-web && npm ci
```

## Global Constraints

- **只有管理员点按钮才生成**：不监听打开抽屉自动生成；打开抽屉只查 `GET /recipes/ai-cover-availability`。
- **只由前端决定 `save`，后端兜底**：`save=true` 仅用于「封面为空 + 系列未上线」；后端发现系列已上线时强制不写库，返回 `saved=false`。
- **生图接口永不写 `Recipe` 行、永不传 `applyToLive`**；只允许写 `RecipeSeries.coverImageUrl`。
- **图必须是 COS 地址**（转存后），不得把智谱临时链接存库。
- 16:9 规格：智谱 `1728x960` → `ImageOptimizationService` 的 `recipe-cover` 预设 → 750×422、≤160KB JPEG → COS `recipes/covers`。
- 旧单食谱入口零变化：`layout` 缺省 = `SQUARE`，智谱 `1280x1280`，原图直传。
- 前端生成请求 **120000ms** 超时，`timeoutErrorMessage` 用中文；失败/超时**不自动重试**，原封面保留。
- 临时名（`未命名…`）不生成：按钮禁用 + 提示；后端 400。
- **不新增数据库字段、不做 migration**。
- 不改小程序、不改封面角标、不改发布 / 更新 / 下架主流程、不改旧「编辑食谱」页。
- 验证命令：`cd backend && npm test`、`cd backend && npm run build`、`cd admin-web && npx vitest run`、`cd admin-web && npm run build`。
- 提交信息用英文 `type(scope): ...`，与仓库近期提交一致。

## Review Focus

1. **已上线系列 + `save=true`**（例如另一个标签页刚发布了这条系列）：必须不写库、`saved=false`，前端转预览；否则会出现「系列有新封面、线上还是旧图、保存按钮又不变脏」的死角。
2. **系列名还是临时名 / 空名**：按钮必须禁用、后端必须 400，一次生图钱都不能花。
3. **AI 未配置 / 可用性查询失败**：不得发起生成请求；按钮禁用 + 配置指引；手动上传不受影响。
4. **120 秒超时但服务端还在跑**：中文超时提示 + 「重试」；原封面不动；不得自动重试或自动弹第二次请求。
5. **旧单食谱 AI 封面**：默认 `layout` 必须是 `SQUARE`，仍是 `1280x1280` 方图、原图直传，不能因为共用服务而变成 16:9。

---

### Task 1: 生图服务支持 16:9（旧入口不变）

**Files:**
- Modify: `backend/src/application/recipe-designer/recipe-cover-image.service.ts`
- Create: `backend/tests/application/recipe-designer/recipe-cover-image.service.spec.ts`

**Interfaces:**
- Produces:
  - `export type RecipeCoverLayout = 'SQUARE' | 'COVER_16_9'`
  - `GenerateRecipeCoverInput.layout?: RecipeCoverLayout`
  - `new RecipeCoverImageService(agentProviderConfigService, cosService, imageOptimizationService)`
  - `generate(input): Promise<{ url: string; provider: string; model: string }>`（返回值不变）

- [ ] **Step 1: 写失败测试**

```ts
// backend/tests/application/recipe-designer/recipe-cover-image.service.spec.ts
import { RecipeCoverImageService } from 'src/application/recipe-designer/recipe-cover-image.service';

describe('RecipeCoverImageService · cover layout', () => {
  const configService = {
    getEnabledProviderRuntimeConfig: jest.fn().mockResolvedValue({
      provider: 'ZHIPU',
      model: 'glm-image',
      baseUrl: 'https://open.bigmodel.cn',
      apiKey: 'key',
      requestTimeoutMs: 90000,
    }),
  };
  const cosService = {
    uploadImage: jest.fn().mockResolvedValue({
      url: 'https://cos.example.com/recipes/covers/ai.jpg',
    }),
  };
  const imageOptimizationService = {
    optimizeForUpload: jest.fn().mockResolvedValue({
      buffer: Buffer.from('optimized'),
      filename: 'ai-cover-miniapp-cover.jpg',
    }),
  };
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;
  let service: RecipeCoverImageService;

  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock = jest
      .fn()
      // ① 智谱生图
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({ data: [{ url: 'https://temp.example.com/a.jpg' }] }),
      })
      // ② 下载临时图
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      });
    global.fetch = fetchMock as unknown as typeof fetch;
    service = new RecipeCoverImageService(
      configService as any,
      cosService as any,
      imageOptimizationService as any,
    );
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('默认方图：1280x1280、原图直传、不走压缩', async () => {
    const result = await service.generate({ recipeName: '鸡肉南瓜餐' });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.size).toBe('1280x1280');
    expect(imageOptimizationService.optimizeForUpload).not.toHaveBeenCalled();
    expect(cosService.uploadImage).toHaveBeenCalledWith(
      Buffer.from([1, 2, 3]),
      expect.stringContaining('ai-cover-'),
      'recipes/covers',
    );
    expect(result.url).toBe('https://cos.example.com/recipes/covers/ai.jpg');
  });

  it('16:9 封面：1728x960、先走 recipe-cover 压缩再上传', async () => {
    await service.generate({
      recipeName: '鸡肉南瓜餐',
      layout: 'COVER_16_9',
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.size).toBe('1728x960');
    expect(imageOptimizationService.optimizeForUpload).toHaveBeenCalledWith(
      Buffer.from([1, 2, 3]),
      'recipe-cover',
    );
    expect(cosService.uploadImage).toHaveBeenCalledWith(
      Buffer.from('optimized'),
      'ai-cover-miniapp-cover.jpg',
      'recipes/covers',
    );
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && npx jest tests/application/recipe-designer/recipe-cover-image.service.spec.ts`
Expected: FAIL（`optimizeForUpload` 未被调用 / 构造参数对不上）。

- [ ] **Step 3: 实现**

在 `recipe-cover-image.service.ts`：

1. 引入并注入 `ImageOptimizationService`（第三个构造函数参数，放在 `cosService` 之后）。
2. 新增 `RecipeCoverLayout` 与 `GenerateRecipeCoverInput.layout?: RecipeCoverLayout`。
3. `generate()` 开头：`const layout = input.layout ?? 'SQUARE';`、`const size = layout === 'COVER_16_9' ? '1728x960' : '1280x1280';`，把 `size` 传给 `callZhipuImage`。
4. 下载得到 `buffer` 后：`COVER_16_9` 时调 `this.imageOptimizationService.optimizeForUpload(buffer, 'recipe-cover')`，用返回的 `buffer` / `filename` 上传；`SQUARE` 保持原样（`ai-cover-${Date.now()}.jpg` + 原 buffer）。
5. COS 目录保持 `'recipes/covers'`；`isAvailable()` / 下载失败文案 / 返回值结构不变。

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && npx jest tests/application/recipe-designer/recipe-cover-image.service.spec.ts`
Expected: PASS（2 个用例）。

- [ ] **Step 5: 提交**

```bash
git add backend/src/application/recipe-designer/recipe-cover-image.service.ts backend/tests/application/recipe-designer/recipe-cover-image.service.spec.ts
git commit -m "feat(series-ai-cover): render 16:9 cover without changing the square path"
```

---

### Task 2: 系列封面生成服务（校验 / 食材 / 保存语义）

**Files:**
- Create: `backend/src/application/recipe-designer/series-cover-image.service.ts`
- Create: `backend/tests/application/recipe-designer/series-cover-image.service.spec.ts`

**Interfaces:**
- Consumes: `RecipeCoverImageService.isAvailable()`、`RecipeCoverImageService.generate({ recipeName, foodNames, layout: 'COVER_16_9' })`（Task 1）。
- Produces:
  - `export interface SeriesCoverGenerationResult { url: string; provider: string; model: string; saved: boolean; foodNames: string[] }`
  - `generateForSeries(seriesId: string, options?: { save?: boolean }): Promise<SeriesCoverGenerationResult>`

- [ ] **Step 1: 写失败测试**

测试用 mock：`prisma.recipeSeries.findUnique/update`、`prisma.recipe.count`、`prisma.designRecipe.findMany`、`coverImageService.isAvailable/generate`。

必须覆盖：

```ts
// 系列不存在 / 已删除 / 非 ACTIVE → NotFoundException('食谱系列不存在')
// designMode=ORDER → BadRequestException('订单定制系列不支持 AI 封面生成')
// 名称 '未命名系列 · 10-27 11:00' → BadRequestException 且 generate 未被调用
// isAvailable=false → BadRequestException('AI 生图还没配置…') 且 generate 未被调用
```

食材挑选（`designRecipe.findMany` 返回按 `updatedAt desc` 的数组）：

```ts
it('取最近一份有可用食材的草稿：排除补剂、去重、最多 5 个', async () => {
  prisma.designRecipe.findMany.mockResolvedValue([
    { items: [] },
    {
      items: [
        { ingredient: { name: '鸡肉粉', type: 'SUPPLEMENT' }, nutritionFood: { name: '鸡肉粉' } },
        { ingredient: { name: '鸡胸肉', type: 'FOOD' }, nutritionFood: { name: '鸡胸肉' } },
        { ingredient: { name: '南瓜', type: 'FOOD' }, nutritionFood: { name: '南瓜' } },
        { ingredient: { name: '鸡胸肉', type: 'FOOD' }, nutritionFood: { name: '鸡胸肉' } },
        { ingredient: null, nutritionFood: { name: '糙米' } },
        { ingredient: { name: '三文鱼', type: 'FOOD' }, nutritionFood: { name: '三文鱼' } },
        { ingredient: { name: '牛肉', type: 'FOOD' }, nutritionFood: { name: '牛肉' } },
        { ingredient: { name: '鸭肉', type: 'FOOD' }, nutritionFood: { name: '鸭肉' } },
      ],
    },
  ]);

  await service.generateForSeries('series-1');

  expect(coverImageService.generate).toHaveBeenCalledWith({
    recipeName: '鸡肉南瓜餐',
    foodNames: ['鸡胸肉', '南瓜', '糙米', '三文鱼', '牛肉'],
    layout: 'COVER_16_9',
  });
});
```

保存语义：

```ts
it('未上线 + save=true：只写系列封面', async () => {
  prisma.recipeSeries.findUnique.mockResolvedValue(series({ businessStatus: 'DRAFT' }));
  prisma.recipe.count.mockResolvedValue(0);

  const result = await service.generateForSeries('series-1', { save: true });

  expect(prisma.recipeSeries.update).toHaveBeenCalledWith({
    where: { id: 'series-1' },
    data: { coverImageUrl: 'https://cos.example.com/ai.jpg' },
  });
  expect(result.saved).toBe(true);
});

it('已上线 + save=true：强制不落库，返回预览', async () => {
  prisma.recipeSeries.findUnique.mockResolvedValue(series({ businessStatus: 'PUBLIC' }));

  const result = await service.generateForSeries('series-1', { save: true });

  expect(prisma.recipeSeries.update).not.toHaveBeenCalled();
  expect(result.saved).toBe(false);
});
```

其余用例：

```ts
// 没有带食材的草稿 → generate 仍被调用，foodNames: []
// save=false → update 未被调用，saved=false
// generate 抛错 → update 未被调用，错误原样抛出
```

还要断言：`generate` 调用参数含 `layout: 'COVER_16_9'`、`recipeName` 是系列名（trim 后）、**不含** `lifeStageLabels`。

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && npx jest tests/application/recipe-designer/series-cover-image.service.spec.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

`series-cover-image.service.ts` 结构：

```ts
@Injectable()
export class SeriesCoverImageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly coverImageService: RecipeCoverImageService,
  ) {}

  async generateForSeries(
    seriesId: string,
    options: { save?: boolean } = {},
  ): Promise<SeriesCoverGenerationResult>
}
```

校验顺序（照 spec 6.3）：

1. `recipeSeries.findUnique` 取 `id/name/status/deletedAt/designMode/businessStatus`；不存在、`status !== ACTIVE`、`deletedAt` → `NotFoundException('食谱系列不存在')`。
2. `designMode === RecipeDesignMode.ORDER` → `BadRequestException('订单定制系列不支持 AI 封面生成')`。
3. `name.trim()` 为空或以 `未命名` 开头 → `BadRequestException('系列名称还是临时名称，先改成正式名称再生成封面')`。
4. `!isAvailable()` → 与单食谱入口同一句配置指引（照 `recipes.controller.ts:2075` 的文案）。
5. 计算 `isLive`：`businessStatus === RecipeSeriesBusinessStatus.PUBLIC` 或 `recipe.count({ where: { seriesId, status: RecipeStatus.PUBLIC } }) > 0`。
6. `shouldSave = options.save === true && !isLive`。
7. `loadFoodNames(seriesId)`（私有方法）：`designRecipe.findMany({ where: { seriesId }, orderBy: { updatedAt: 'desc' }, take: 20, select: { items: { orderBy: { sortOrder: 'asc' }, select: { ingredient: { select: { name: true, type: true } }, nutritionFood: { select: { name: true } } } } } })`；逐份找第一份有可用食材的，排除 `IngredientType.SUPPLEMENT`、去重、最多 5 个、优先 `ingredient.name` 再退回 `nutritionFood.name`；都没有返回 `[]`。
8. `coverImageService.generate({ recipeName: name, foodNames, layout: 'COVER_16_9' })`。
9. `shouldSave` 时 `prisma.recipeSeries.update({ where: { id: seriesId }, data: { coverImageUrl: result.url } })`。
10. 返回 `{ ...result, saved: shouldSave, foodNames }`。

**不要**写 `recipe.updateMany`、不要碰 `applyToLive`、不要写角标表。

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && npx jest tests/application/recipe-designer/series-cover-image.service.spec.ts`
Expected: PASS（全部用例）。

- [ ] **Step 5: 提交**

```bash
git add backend/src/application/recipe-designer/series-cover-image.service.ts backend/tests/application/recipe-designer/series-cover-image.service.spec.ts
git commit -m "feat(series-ai-cover): generate series cover from name and draft foods"
```

---

### Task 3: 管理员接口与模块注册

**Files:**
- Create: `backend/src/interfaces/controllers/admin-recipe-series-cover.controller.ts`
- Modify: `backend/src/app.module.ts`（import + controllers + providers）
- Create: `backend/tests/controllers/admin-recipe-series-cover.controller.spec.ts`

**Interfaces:**
- Consumes: `SeriesCoverImageService.generateForSeries(seriesId, { save })`（Task 2）。
- Produces: `POST /api/v1/admin/recipe-series/:seriesId/ai-cover`，body `{ save?: boolean }`，返回 `ApiResponseDto<SeriesCoverGenerationResult>`。

- [ ] **Step 1: 写失败测试**

```ts
// backend/tests/controllers/admin-recipe-series-cover.controller.spec.ts
import { RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { AdminRecipeSeriesCoverController } from 'src/interfaces/controllers/admin-recipe-series-cover.controller';

const result = {
  url: 'https://cos.example.com/recipes/covers/a.jpg',
  provider: 'ZHIPU',
  model: 'glm-image',
  saved: false,
  foodNames: ['鸡胸肉'],
};

describe('AdminRecipeSeriesCoverController', () => {
  it('类路径与路由契约', () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, AdminRecipeSeriesCoverController),
    ).toBe('api/v1/admin/recipe-series');

    const handler = AdminRecipeSeriesCoverController.prototype.generateSeriesAiCover;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(':seriesId/ai-cover');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST);
  });

  it('类级守卫是 AuthGuard + AdminGuard', () => {
    const guards =
      Reflect.getMetadata(GUARDS_METADATA, AdminRecipeSeriesCoverController) ?? [];
    expect(guards.map((guard: any) => guard.name)).toEqual(
      expect.arrayContaining(['AuthGuard', 'AdminGuard']),
    );
  });

  it('save 默认 false，显式 true 透传', async () => {
    const service = { generateForSeries: jest.fn().mockResolvedValue(result) };
    const controller = new AdminRecipeSeriesCoverController(service as any);

    const empty = await controller.generateSeriesAiCover('series-1', {});
    expect(service.generateForSeries).toHaveBeenCalledWith('series-1', { save: false });
    expect(empty.data).toEqual(result);

    await controller.generateSeriesAiCover('series-1', { save: true });
    expect(service.generateForSeries).toHaveBeenLastCalledWith('series-1', { save: true });
  });

  it('服务抛错不被吞', async () => {
    const service = {
      generateForSeries: jest.fn().mockRejectedValue(new Error('boom')),
    };
    const controller = new AdminRecipeSeriesCoverController(service as any);
    await expect(
      controller.generateSeriesAiCover('series-1', {}),
    ).rejects.toThrow('boom');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && npx jest tests/controllers/admin-recipe-series-cover.controller.spec.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

`admin-recipe-series-cover.controller.ts`：

```ts
@ApiTags('Admin Recipe Series')
@ApiSecurity('bearer')
@Controller('api/v1/admin/recipe-series')
@UseGuards(AuthGuard, AdminGuard)
export class AdminRecipeSeriesCoverController {
  constructor(private readonly seriesCoverImageService: SeriesCoverImageService) {}

  @Post(':seriesId/ai-cover')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'AI 生成产品线封面（默认只预览，save=true 且未上线时写入系列）' })
  async generateSeriesAiCover(
    @Param('seriesId') seriesId: string,
    @Body() dto: { save?: boolean },
  ): Promise<ApiResponseDto<SeriesCoverGenerationResult>> {
    const result = await this.seriesCoverImageService.generateForSeries(seriesId, {
      save: dto?.save === true,
    });
    return ApiResponseDto.success(result);
  }
}
```

`app.module.ts`：

- import `AdminRecipeSeriesCoverController`（和 `AdminRecipeTaxonomyController` 放一起）与 `SeriesCoverImageService`（和 `RecipeCoverImageService` 放一起）；
- `controllers` 数组加 `AdminRecipeSeriesCoverController,`；
- `providers` 数组加 `SeriesCoverImageService,`。

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && npx jest tests/controllers/admin-recipe-series-cover.controller.spec.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add backend/src/interfaces/controllers/admin-recipe-series-cover.controller.ts backend/src/app.module.ts backend/tests/controllers/admin-recipe-series-cover.controller.spec.ts
git commit -m "feat(series-ai-cover): add admin endpoint for series cover generation"
```

---

### Task 4: 前端 API、类型与纯函数

**Files:**
- Modify: `admin-web/src/types/recipeDesigner.ts`
- Create: `admin-web/src/utils/recipeDesigner/seriesAiCover.ts`
- Modify: `admin-web/src/api/recipeDesigner.ts`
- Create: `admin-web/src/utils/recipeDesigner/__tests__/seriesAiCover.spec.ts`

**Interfaces:**
- Produces:
  - `SeriesAiCoverResult` 类型
  - `generateSeriesAiCover(seriesId, payload?: { save?: boolean }): Promise<SeriesAiCoverResult>`
  - `SERIES_AI_COVER_TIMEOUT_MS = 120000`
  - `SERIES_AI_COVER_TIMEOUT_MESSAGE = '生成超时（120 秒），请点重试'`
  - `SeriesAiCoverContext` 与四个纯函数（见下）

- [ ] **Step 1: 写失败测试**

```ts
// admin-web/src/utils/recipeDesigner/__tests__/seriesAiCover.spec.ts
import {
  SERIES_AI_COVER_TIMEOUT_MESSAGE,
  SERIES_AI_COVER_TIMEOUT_MS,
  buildSeriesAiCoverSaveFlag,
  resolveSeriesAiCoverButtonLabel,
  resolveSeriesAiCoverHint,
  resolveSeriesAiCoverUnavailableReason,
  type SeriesAiCoverContext,
} from '../seriesAiCover';

const base: SeriesAiCoverContext = {
  isAdmin: true,
  available: true,
  generating: false,
  busy: false,
  savedSeriesName: '鸡肉南瓜餐',
  hasCover: false,
  isLive: false,
};

describe('seriesAiCover', () => {
  it('按钮文案随状态变化', () => {
    expect(resolveSeriesAiCoverButtonLabel(false, false)).toBe('AI 生成图片');
    expect(resolveSeriesAiCoverButtonLabel(true, false)).toBe('重新生成');
    expect(resolveSeriesAiCoverButtonLabel(false, true)).toBe('生成中…');
  });

  it('只有未上线 + 空封面才直接保存', () => {
    expect(buildSeriesAiCoverSaveFlag({ hasCover: false, isLive: false })).toBe(true);
    expect(buildSeriesAiCoverSaveFlag({ hasCover: true, isLive: false })).toBe(false);
    expect(buildSeriesAiCoverSaveFlag({ hasCover: false, isLive: true })).toBe(false);
    expect(buildSeriesAiCoverSaveFlag({ hasCover: true, isLive: true })).toBe(false);
  });

  it('不可用原因按优先级返回', () => {
    expect(
      resolveSeriesAiCoverUnavailableReason({
        ...base,
        savedSeriesName: '未命名系列 · 10-27 11:00',
      }),
    ).toContain('正式名称');
    expect(
      resolveSeriesAiCoverUnavailableReason({ ...base, available: false }),
    ).toContain('AI 设置');
    expect(
      resolveSeriesAiCoverUnavailableReason({ ...base, available: null }),
    ).toContain('检查');
    expect(
      resolveSeriesAiCoverUnavailableReason({ ...base, busy: true }),
    ).toContain('保存');
    expect(
      resolveSeriesAiCoverUnavailableReason({ ...base, savedSeriesName: '' }),
    ).toContain('正式名称');
    expect(resolveSeriesAiCoverUnavailableReason({ ...base, isAdmin: false })).toBe('');
    expect(resolveSeriesAiCoverUnavailableReason(base)).toBe('');
  });

  it('提示文案随封面 / 上线状态变化', () => {
    expect(resolveSeriesAiCoverHint(base)).toContain('自动保存');
    expect(resolveSeriesAiCoverHint({ ...base, isLive: true })).toContain('预览');
    expect(resolveSeriesAiCoverHint({ ...base, hasCover: true })).toContain('用这张');
    expect(
      resolveSeriesAiCoverHint({ ...base, available: false }),
    ).toContain('AI 设置');
  });

  it('超时常量与文案固定', () => {
    expect(SERIES_AI_COVER_TIMEOUT_MS).toBe(120000);
    expect(SERIES_AI_COVER_TIMEOUT_MESSAGE).toContain('120');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd admin-web && npx vitest run src/utils/recipeDesigner/__tests__/seriesAiCover.spec.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现纯函数**

```ts
// admin-web/src/utils/recipeDesigner/seriesAiCover.ts
import { isTemporarySeriesName } from './seriesName'

export const SERIES_AI_COVER_TIMEOUT_MS = 120_000
export const SERIES_AI_COVER_TIMEOUT_MESSAGE = '生成超时（120 秒），请点重试'

export interface SeriesAiCoverContext {
  isAdmin: boolean
  /** null = 还没查完 / 查失败 */
  available: boolean | null
  generating: boolean
  /** 上传 / 保存 / 发布 / 下架进行中 */
  busy: boolean
  /** 已成功写库的系列名（抽屉里改名保存后更新） */
  savedSeriesName?: string | null
  hasCover: boolean
  /** 已上线过（含待更新） */
  isLive: boolean
}

export function resolveSeriesAiCoverUnavailableReason(ctx: SeriesAiCoverContext): string
export function resolveSeriesAiCoverHint(ctx: SeriesAiCoverContext): string
export function resolveSeriesAiCoverButtonLabel(hasCover: boolean, generating: boolean): string
export function buildSeriesAiCoverSaveFlag(input: { hasCover: boolean; isLive: boolean }): boolean
```

规则：

- `resolveSeriesAiCoverUnavailableReason` 优先级：非管理员 → `''`（按钮不渲染）；生成中 → `''`（走 loading）；`busy` → `'正在保存，请稍候…'`；`available === null` → `'正在检查 AI 生图是否可用…'`；`available === false` → `'AI 自动封面未启用：到「AI 设置」添加 purpose=RECIPE_COVER_IMAGE、provider=ZHIPU 并启用。'`；名称空或 `isTemporarySeriesName()` → `'先把系列名称改成正式名称（离开输入框自动保存），再生成封面。'`；否则 `''`。
- `resolveSeriesAiCoverHint`：先返回不可用原因；否则 `hasCover` → `'重新生成会先出预览，点「用这张」才替换。'`；`isLive` → `'生成后先看预览，确认后点「保存发布设置」才会生效。'`；否则 `'按系列名和最近一份草稿的食材生成，约 20–40 秒；生成后自动保存到系列。'`。
- `resolveSeriesAiCoverButtonLabel`：`generating` → `'生成中…'`；`hasCover` → `'重新生成'`；否则 `'AI 生成图片'`。
- `buildSeriesAiCoverSaveFlag`：`!hasCover && !isLive`。

- [ ] **Step 4: 加类型与 API**

`types/recipeDesigner.ts`（放在 `SeriesReleaseResult` 附近）：

```ts
/** AI 生成系列封面的结果（2026-10-27） */
export interface SeriesAiCoverResult {
  /** 一定是 COS 地址（已转存），不是智谱临时链接 */
  url: string
  provider: string
  model: string
  /** true = 已写入系列；false = 只返回预览 */
  saved: boolean
  /** 实际喂给提示词的食材（最多 5 个） */
  foodNames: string[]
}
```

`api/recipeDesigner.ts`：在 `unpublishSeries` 之后加（并 import `SeriesAiCoverResult` 与两个常量）：

```ts
  /**
   * AI 生成产品线封面（2026-10-27）。
   *
   * 只有管理员能调；`save` 由前端按「封面为空 + 系列未上线」决定，
   * 后端仍会兜底：已上线系列即使传 true 也不落库（响应 saved=false）。
   * 生图约 20–40 秒，超时放宽到 120 秒，避免默认 30 秒误判失败。
   */
  generateSeriesAiCover: (
    seriesId: string,
    payload: { save?: boolean } = {},
  ): Promise<SeriesAiCoverResult> =>
    api.post(`/admin/recipe-series/${seriesId}/ai-cover`, payload, {
      timeout: SERIES_AI_COVER_TIMEOUT_MS,
      timeoutErrorMessage: SERIES_AI_COVER_TIMEOUT_MESSAGE,
    }),
```

- [ ] **Step 5: 运行确认通过**

Run: `cd admin-web && npx vitest run src/utils/recipeDesigner/__tests__/seriesAiCover.spec.ts`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add admin-web/src/types/recipeDesigner.ts admin-web/src/utils/recipeDesigner/seriesAiCover.ts admin-web/src/utils/recipeDesigner/__tests__/seriesAiCover.spec.ts admin-web/src/api/recipeDesigner.ts
git commit -m "feat(series-ai-cover): add admin api and pure helpers"
```

---

### Task 5: 发布抽屉接入按钮、预览与失败状态

**Files:**
- Modify: `admin-web/src/views/RecipeDesigner/components/SeriesReleaseDrawer.vue`
- Create: `admin-web/src/views/RecipeDesigner/seriesAiCover.regression.spec.ts`

**Interfaces:**
- Consumes: Task 4 的 `generateSeriesAiCover`、常量、四个纯函数；现有 `recipeApi.getAiCoverAvailability()`、`isAdmin`、`isUpdate`、`form`、`baseline`、`loadReadiness`、`cloneSeriesReleaseForm`、`ElMessage`、`ElMessageBox`。
- Produces: 抽屉内 `handleGenerateAiCover` / `applyAiCoverPreview`（仅模板点击调用，**不得**在打开时自动调用）。

- [ ] **Step 1: 写失败测试（源码契约）**

```ts
// admin-web/src/views/RecipeDesigner/seriesAiCover.regression.spec.ts
import { describe, expect, it } from 'vitest'
import drawerSource from '@/views/RecipeDesigner/components/SeriesReleaseDrawer.vue?raw'
import apiSource from '@/api/recipeDesigner.ts?raw'
import helperSource from '@/utils/recipeDesigner/seriesAiCover.ts?raw'

describe('系列 AI 封面 · 源码契约', () => {
  it('接口路径、120 秒超时与中文超时提示', () => {
    expect(apiSource).toContain('`/admin/recipe-series/${seriesId}/ai-cover`')
    expect(apiSource).toContain('timeout: SERIES_AI_COVER_TIMEOUT_MS')
    expect(apiSource).toContain('timeoutErrorMessage: SERIES_AI_COVER_TIMEOUT_MESSAGE')
    expect(helperSource).toContain('120_000')
    expect(helperSource).toContain('生成超时（120 秒），请点重试')
  })

  it('按钮只在管理员可见，且只有点击才生成', () => {
    expect(drawerSource).toContain(
      '<div v-if="isAdmin" class="series-release__ai-cover-actions">',
    )
    expect(drawerSource).toContain('@click="handleGenerateAiCover"')
    // 只允许作为点击处理器出现一次；打开抽屉 / watch 里不许调用
    expect(
      (drawerSource.match(/handleGenerateAiCover\(/g) ?? []).length,
    ).toBe(1)
  })

  it('预览与重试入口存在', () => {
    expect(drawerSource).toContain('用这张')
    expect(drawerSource).toContain('不要')
    expect(drawerSource).toContain('applyAiCoverPreview')
    expect(drawerSource).toContain('aiCoverError')
    expect(drawerSource).toContain('aiCoverPreviewUrl')
  })

  it('覆盖前确认、按 saved 分支、超时用中文常量', () => {
    expect(drawerSource).toContain('约 0.1 元/张')
    expect(drawerSource).toContain('result.saved')
    expect(drawerSource).toContain("error?.code === 'ECONNABORTED'")
    expect(drawerSource).toContain('SERIES_AI_COVER_TIMEOUT_MESSAGE')
  })

  it('生成不阻断保存发布设置', () => {
    expect(drawerSource).toContain(':disabled="saving || uploading || !dirty"')
    expect(drawerSource).not.toContain('aiCoverGenerating || !dirty')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd admin-web && npx vitest run src/views/RecipeDesigner/seriesAiCover.regression.spec.ts`
Expected: FAIL（还没接入）。

- [ ] **Step 3: 接入模板**

在「封面图」`el-form-item` 里：

1. `el-upload` 增 `:disabled="uploading || aiCoverGenerating"`；遮罩文案改成 `uploading || aiCoverGenerating`，生成中显示 `AI 正在生成封面…（约 20–40 秒）`。
2. 右侧列顶部加：

```vue
<div v-if="isAdmin" class="series-release__ai-cover-actions">
  <el-button
    size="small"
    :loading="aiCoverGenerating"
    :disabled="aiCoverGenerating || !!aiCoverUnavailableReason"
    @click="handleGenerateAiCover"
  >
    {{ aiCoverButtonLabel }}
  </el-button>
</div>
```

3. 「移除封面」按钮加 `:disabled="aiCoverGenerating || uploading"`。
4. 提示行：

```vue
<span v-if="aiCoverHint" class="series-release__hint">{{ aiCoverHint }}</span>
```

5. 封面行下方加预览卡与错误行：

```vue
<div v-if="aiCoverPreviewUrl" class="series-release__ai-preview">
  <img :src="aiCoverPreviewUrl" alt="AI 生成封面预览" />
  <div class="series-release__ai-preview-actions">
    <el-button size="small" type="primary" @click="applyAiCoverPreview">用这张</el-button>
    <el-button size="small" @click="aiCoverPreviewUrl = ''">不要</el-button>
  </div>
  <span class="series-release__hint">点「用这张」后，还要点「保存发布设置」才会生效。</span>
</div>
<div v-if="aiCoverError" class="series-release__ai-error">
  <span>{{ aiCoverError }}</span>
  <el-button link type="primary" @click="handleGenerateAiCover">重试</el-button>
</div>
```

- [ ] **Step 4: 接入脚本**

1. import：`recipeDesignerApi.generateSeriesAiCover`（已在 `recipeDesignerApi` 里）、`getApiErrorMessage`、`SERIES_AI_COVER_TIMEOUT_MESSAGE`、`buildSeriesAiCoverSaveFlag`、`resolveSeriesAiCoverButtonLabel`、`resolveSeriesAiCoverHint`、`resolveSeriesAiCoverUnavailableReason`、`isTemporarySeriesName`、`type SeriesAiCoverContext`。
2. 新增状态：

```ts
const aiCoverAvailable = ref<boolean | null>(null)
const aiCoverGenerating = ref(false)
const aiCoverPreviewUrl = ref('')
const aiCoverError = ref('')
/** 已成功写库的系列名：改名保存后由 AiNameField 的 saved 事件更新 */
const savedSeriesName = ref(String(props.seriesName ?? '').trim())
let aiCoverRequestSeq = 0
```

3. `watch(() => props.seriesName)` 里同时更新 `savedSeriesName`；`onNameAdopted(name)` 里也更新。
4. `isTemporaryName` 改成 `computed(() => isTemporarySeriesName(savedSeriesName.value))`（替掉手写 `startsWith`）。
5. 在 `isUpdate` 之后加：

```ts
const aiCoverContext = computed<SeriesAiCoverContext>(() => ({
  isAdmin: isAdmin.value,
  available: aiCoverAvailable.value,
  generating: aiCoverGenerating.value,
  busy: uploading.value || saving.value || releasing.value || unpublishing.value,
  savedSeriesName: savedSeriesName.value,
  hasCover: Boolean(form.coverImageUrl.trim()),
  isLive: isUpdate.value,
}))
const aiCoverUnavailableReason = computed(() =>
  resolveSeriesAiCoverUnavailableReason(aiCoverContext.value),
)
const aiCoverHint = computed(() => resolveSeriesAiCoverHint(aiCoverContext.value))
const aiCoverButtonLabel = computed(() =>
  resolveSeriesAiCoverButtonLabel(aiCoverContext.value.hasCover, aiCoverGenerating.value),
)
```

6. 可用性：

```ts
async function loadAiCoverAvailability(): Promise<void> {
  if (!isAdmin.value) {
    aiCoverAvailable.value = null
    return
  }
  try {
    const res = await recipeApi.getAiCoverAvailability()
    aiCoverAvailable.value = Boolean(res?.available)
  } catch {
    aiCoverAvailable.value = false
  }
}
```

在 `watch([props.modelValue, props.seriesId])` 打开分支调用 `void loadAiCoverAvailability()`；关闭分支里 `aiCoverRequestSeq += 1`、`aiCoverGenerating = false`、`aiCoverPreviewUrl = ''`、`aiCoverError = ''`、`aiCoverAvailable = null`。

7. 生成与确认：

```ts
async function handleGenerateAiCover(): Promise<void> {
  if (!props.seriesId || aiCoverGenerating.value || aiCoverUnavailableReason.value) return

  const hasCover = Boolean(form.coverImageUrl.trim())
  const save = buildSeriesAiCoverSaveFlag({ hasCover, isLive: isUpdate.value })
  if (hasCover) {
    try {
      await ElMessageBox.confirm(
        '重新生成需要再调用一次 AI（约 0.1 元/张）。生成后先看预览，点「用这张」才会替换当前封面。继续？',
        '重新生成封面',
        { type: 'warning', confirmButtonText: '继续生成', cancelButtonText: '取消' },
      )
    } catch {
      return
    }
  }

  const seq = ++aiCoverRequestSeq
  aiCoverGenerating.value = true
  aiCoverError.value = ''
  try {
    const result = await recipeDesignerApi.generateSeriesAiCover(props.seriesId, { save })
    if (seq !== aiCoverRequestSeq) return
    if (result.saved) {
      form.coverImageUrl = result.url
      baseline.value = cloneSeriesReleaseForm({
        ...baseline.value,
        coverImageUrl: result.url,
      })
      ElMessage.success('AI 封面已生成并保存')
      void loadReadiness(false)
    } else {
      aiCoverPreviewUrl.value = result.url
      ElMessage.success('已生成预览，确认后才会替换')
    }
  } catch (error: any) {
    if (seq !== aiCoverRequestSeq) return
    const isTimeout = error?.code === 'ECONNABORTED'
    aiCoverError.value = isTimeout
      ? SERIES_AI_COVER_TIMEOUT_MESSAGE
      : `AI 生成失败：${getApiErrorMessage(error, '请点重试')}`
  } finally {
    if (seq === aiCoverRequestSeq) aiCoverGenerating.value = false
  }
}

function applyAiCoverPreview(): void {
  if (!aiCoverPreviewUrl.value) return
  form.coverImageUrl = aiCoverPreviewUrl.value
  aiCoverPreviewUrl.value = ''
  aiCoverError.value = ''
  ElMessage.success('封面已替换，记得点「保存发布设置」')
}
```

- [ ] **Step 5: 加样式**

在 scoped style 末尾加 `.series-release__ai-cover-actions`（横向 flex、gap 8px、margin-bottom 6px）、`.series-release__ai-preview`（flex、gap 10px、浅边框、圆角；`img` 160×90、`object-fit: cover`）、`.series-release__ai-preview-actions`、`.series-release__ai-error`（12px、`var(--el-color-danger)`、flex + gap）。

- [ ] **Step 6: 运行确认通过**

Run: `cd admin-web && npx vitest run src/views/RecipeDesigner/seriesAiCover.regression.spec.ts src/utils/recipeDesigner/__tests__/seriesAiCover.spec.ts`
Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add admin-web/src/views/RecipeDesigner/components/SeriesReleaseDrawer.vue admin-web/src/views/RecipeDesigner/seriesAiCover.regression.spec.ts
git commit -m "feat(series-ai-cover): add admin-triggered cover generation to the release drawer"
```

---

### Task 6: 全量验证

**Files:** 无（只跑命令；如失败回到对应任务修）。

- [ ] **Step 1: 后端全量测试**

Run: `cd backend && npm test`
Expected: 全绿；若出现与本次无关的既有失败，先确认基线（`git stash` 后同命令）再决定，不顺手改无关代码。

- [ ] **Step 2: 后端构建**

Run: `cd backend && npm run build`
Expected: 成功（`dist/` 生成，末尾无 TS 错误）。

- [ ] **Step 3: 前端全量测试**

Run: `cd admin-web && npx vitest run`
Expected: 全绿。

- [ ] **Step 4: 前端构建**

Run: `cd admin-web && npm run build`
Expected: `vue-tsc` + `vite build` 成功。

- [ ] **Step 5: 确认工作区干净**

Run: `git status --short`
Expected: 无未提交改动（构建产物已被 .gitignore 忽略）。

---

### Task 7: 合并、部署与汇报

**Files:** 无（只跑命令 + 汇报）。

- [ ] **Step 1: 同步最新 main 并合并**

```bash
git fetch origin
git rebase origin/main
```

Expected: 无冲突（如冲突，只解决本次 5 个文件相关部分，不动无关代码）。

- [ ] **Step 2: 推送到 origin/main（快进）**

```bash
git push origin HEAD:main
git rev-parse origin/main
```

Expected: 推送成功；`origin/main` 指向本次最后一个提交。**不要** checkout 主工作目录的 `main`（被其它会话占用）。

- [ ] **Step 3: 部署后端**

```bash
bash backend/scripts/remote_deploy_v2.sh
```

Expected: 脚本输出 `Deploy commit: <sha>`（应等于 Step 2 的 sha）并成功重启。

- [ ] **Step 4: 部署 admin-web**

```bash
bash deploy-admin-web.sh
```

Expected: 构建 + rsync 成功，输出「Files uploaded successfully」。

- [ ] **Step 5: 线上冒烟**

```bash
# 未登录应 401（说明路由存在；404 = 没部署上）
curl -sS -o /dev/null -w '%{http_code}\n' -X POST https://api.sevenkitchen.cloud/api/v1/admin/recipe-series/smoke/ai-cover
```

Expected: `401`（或 `403`）。

- [ ] **Step 6: 汇报**

向老板汇报：设计稿 / 计划路径、提交号、测试与构建结果、部署提交、冒烟结果；说明**小程序本期 0 改动所以没有上传体验版**；提醒真实生图需要管理员在后台点一次（约 0.1 元/张），或问老板是否要我代点。

---

## 自检记录（写计划后自查）

- **规格覆盖**：设计稿 5.1 按钮 / 5.2 首生成 / 5.3 重新生成 / 5.4 失败超时 / 5.5 保存关系 / 5.6 线框 / 6.1–6.6 后端 / 7.1–7.6 前端 / 8 数据 / 9 测试 / 10 验收 / 11 已知问题均有对应任务或约束。
- **旧入口不变**：Task 1 的默认 `SQUARE` 用例 + Review Focus 第 5 条。
- **保存语义**：Task 2 的 `save=true + 已上线` 用例 + Task 5 的 `buildSeriesAiCoverSaveFlag` 用例。
- **临时名 / 未配置**：Task 2（后端 400）+ Task 4（按钮原因）+ Task 5（不请求）。
- **超时**：Task 4 常量 + Task 5 内联提示 / 无自动重试。
- **验收场景 13 条**：1/2/3/4/5/6/7/8/9/10/11/12/13 均落在上述任务或手工验收（真实生图由管理员点一次）。
