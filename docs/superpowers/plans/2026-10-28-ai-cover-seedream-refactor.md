# AI 食谱封面重构（DeepSeek + Seedream 5.0 Pro）· 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 AI 封面从 GLM-Image 切到 Seedream 5.0 Pro：DeepSeek Flash 写提示词、Seedream 生图；产品线发布 / 更新抽屉和定制线上线检查抽屉共用 `AICoverField`；只做草稿预览，保存时才落库；旧封面引用安全 + 7 天回收站；旧单食谱 AI 入口和智谱封面配置全部下线。

**Architecture:** 后端新增 `RecipeCoverConfig`（提示词）和 `CoverTrash`（回收站）两张表，`AgentProviderConfig` 增加 `ARK` provider 和 `RECIPE_COVER_PROMPT` / `RECIPE_COVER_IMAGE` 两个不回落系统默认的用途。`SeedreamImageService` 调火山方舟图片 API；`RecipeCoverImageService` 负责 DeepSeek prompt + Seedream + 750×422 + COS；系列与定制各一个只预览的取数服务；`CoverTrashService` 做引用检查 / 回收站。前端抽 `AICoverField`，替换发布抽屉的封面区、接入上线检查的「订单展示」。

**Tech Stack:** NestJS + Prisma + Jest（backend）；Vue 3 + Element Plus + Vitest（admin-web）；火山方舟 Ark 图片 API；DeepSeek Chat API；腾讯云 COS。

**Spec:** `docs/superpowers/specs/2026-10-28-ai-cover-seedream-refactor-design.md`

## 环境与边界

- 独立 worktree：`/Users/zhaochen/Documents/SevenKitchen/.worktrees/series-ai-cover-20261027`，分支 `feature/series-ai-cover-20261027`。
- 不要动主工作目录 `/Users/zhaochen/Documents/SevenKitchen` 和其它 worktree。
- 依赖已安装；需要时先 `cd backend && npm ci` / `cd admin-web && npm ci`。
- 后端本地联调时不要在跑 `start:dev` 的情况下执行 `npm run build`（会删 `dist`）；本计划按“只跑测试 / 构建”的方式执行。

## Global Constraints

- **生产封面链路不得调用智谱 GLM-Image**；旧单食谱 AI 封面入口删除。
- **DeepSeek 与 Ark 都不回退系统默认**：用途 `RECIPE_COVER_PROMPT` / `RECIPE_COVER_IMAGE`，缺失时功能不可用。
- DeepSeek 默认模型 **`deepseek-flash`**；关闭思考 / 低 effort；温度、max tokens、超时由代码固定。
- Seedream 模型 **`doubao-seedream-5-0-pro-260628`**；尺寸 **`2048x1152`**；`watermark:false`；`response_format:url`；只处理本项目 COS 前缀。
- 图片最终规格：`ImageOptimizationService` 的 `recipe-cover` 预设 → **750×422、≤160KB** JPEG → COS `recipes/covers/`；不存 1500 母图。
- 仅 FOOD 食材；排除补剂 / 包材 / 零重量 / 水；带名称、`preparationMethod` 整串、归一化 `ratioPercent`。
- 产品线阶段优先级：`HIGH_ACTIVITY_ADULT` → `PUPPY_14_WEEKS_PLUS` → `LOW_ACTIVITY_ADULT_OR_SENIOR` → `REPRODUCTION`；定制线取当前 `DesignRecipe` 草稿。
- AI 接口**只返回预览 URL**，不写 `RecipeSeries` / `DesignRecipe` / `Recipe` 封面字段。
- 旧封面删除只在保存 / 发布成功后处理；引用安全 + **7 天回收站**；AI 预览未采用 / 手动上传未保存也要清理。
- 配置页只有 DeepSeek（启用 / Base URL / 模型 / Key）、Seedream（启用 / Base URL / 模型 / Key）、系统提示词、保存；**没有**尺寸 / 水印 / 生成规则 / 试写 / 试生成。
- AI 生成、配置仅管理员；手动上传沿用现有页面权限；已上线系列不能移除封面。
- 后端全量测试 / 构建、admin 测试 / 构建通过后再提交 / 部署；已知 3 条既有失败（`tests/recipe.service.preparation-method-history.spec.ts`、`tests/application/supplement-shop/supplement-aftersale.service.spec.ts`）不作为本次新增失败。
- 不改小程序、不改封面角标、不改发布 / 更新 / 下线主流程。

## Review Focus

- **旧封面仍被 PUBLIC Recipe 引用**：替换系列封面时只更新系列、不同步 PUBLIC 食谱，直接删旧图会让顾客页面缺图；必须引用检查 + 同步后才进回收站。
- **AI 预览被丢弃**：用户点「不要」/关闭 / 重新生成后，预览 URL 不能留成孤儿；必须调用清理接口进回收站。
- **已上线系列移除封面**：后端已拒绝清空；前端必须禁用 / 隐藏移除，避免用户反复点。
- **定制草稿旧封面仍被已发布 Recipe 引用**：`updateDraftPresentation` 只改草稿；旧 URL 若仍被 `Recipe` 引用，不能进回收站。
- **未配置 DeepSeek / Ark**：不得回退全局默认；按钮不可用 + 明确文案；配置页状态要能看出哪一项缺失。
- **食材口径**：只取 FOOD、排除补剂 / 包材 / 零重量 / 水；占比归一化；预处理整串原样传给 DeepSeek。
- **COS 前缀 / 外部 URL**：回收站只处理本项目 `recipes/` 前缀；外部 URL 不碰。
- **旧单食谱 / 智谱残留**：删除 UI 和接口后，确认没有代码再调 `zhipu-image` / 旧 AI 封面接口。

---

## File Structure

### Backend

- `backend/prisma/schema.prisma`：新增 `RecipeCoverConfig`、`CoverTrash` 模型 + migration。
- `backend/src/application/recipe-designer/recipe-cover-config.service.ts`：提示词默认值 / 读写 / 可用性。
- `backend/src/application/recipe-designer/seedream-image.ts`：Ark 图片 API 客户端。
- `backend/src/application/recipe-designer/recipe-cover-image.service.ts`：DeepSeek prompt + Seedream + 图片处理 + COS（替换智谱）。
- `backend/src/application/recipe-designer/recipe-cover-visual-brief.service.ts`：DeepSeek `deepseek-flash` + 配置提示词。
- `backend/src/application/recipe-designer/series-cover-image.service.ts`：系列取数 + 只预览。
- `backend/src/application/recipe-designer/design-recipe-cover-image.service.ts`：定制草稿取数 + 只预览。
- `backend/src/application/recipe-designer/cover-reference.service.ts`：跨 `RecipeSeries` / `DesignRecipe` / `Recipe` 引用检查。
- `backend/src/application/recipe-designer/cover-trash.service.ts`：回收站 / 7 天清理。
- `backend/src/application/nutrition-governance/agent-provider-config.service.ts`：ARK provider、两个用途、不回退。
- `backend/src/interfaces/controllers/admin-recipe-series-cover.controller.ts`：系列 AI 预览接口。
- `backend/src/interfaces/controllers/recipe-designer.controller.ts`：定制草稿 AI 预览接口。
- `backend/src/interfaces/controllers/nutrition-governance.controller.ts`：AI 食谱封面配置 GET/PUT。
- `backend/src/interfaces/controllers/ai-cover-preview.controller.ts`：预览清理 DELETE。
- `backend/src/application/recipe-designer/recipe-designer.service.ts`：保存后旧封面回收站。
- `backend/src/infrastructure/services/tencent-cos.service.ts`：复制 / 移动对象。
- 删除：`zhipu-image.ts`、`zhipu-api.ts`、智谱配置接口 / 测试、单食谱 AI 封面接口。

### Admin Web

- `admin-web/src/views/RecipeDesigner/components/AICoverField.vue`：共享封面字段。
- `admin-web/src/views/RecipeDesigner/components/SeriesReleaseDrawer.vue`：接入 `AICoverField`。
- `admin-web/src/views/RecipeDesigner/components/PresentationPanel.vue`：接入 `AICoverField`（ORDER）。
- `admin-web/src/views/AgentConfig/index.vue`：AI 食谱封面卡片。
- `admin-web/src/views/AgentConfig/RecipeCoverConfigDrawer.vue`：配置页。
- `admin-web/src/api/recipeDesigner.ts`：系列 / 定制 AI、预览清理。
- `admin-web/src/api/nutritionGovernance.ts`：AI 食谱封面配置。
- `admin-web/src/types/recipeDesigner.ts` / `nutritionGovernance.ts`：类型。
- 删除：`RecipeForm.vue` AI 区块、`zhipuImage` API / 类型 / 测试。

### Tests

- 后端：`tests/application/recipe-designer/recipe-cover-config.service.spec.ts`、`seedream-image.spec.ts`、`recipe-cover-image.service.spec.ts`、`recipe-cover-visual-brief.service.spec.ts`、`series-cover-image.service.spec.ts`、`design-recipe-cover-image.service.spec.ts`、`cover-reference.service.spec.ts`、`cover-trash.service.spec.ts`、`recipe-cover-config.controller.spec.ts`、`ai-cover-preview.controller.spec.ts`；`tests/application/nutrition-governance/agent-provider-config.service.spec.ts`；`tests/controllers/admin-recipe-series-cover.controller.spec.ts`。
- 前端：`admin-web/src/views/RecipeDesigner/aiCoverField.regression.spec.ts`、`seriesReleaseDrawer.regression.spec.ts`、`presentationPanel.regression.spec.ts`、`admin-web/src/views/AgentConfig/recipeCoverConfig.regression.spec.ts`。

---

## Task 1: RecipeCoverConfig 表 + 提示词服务

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20261028120000_recipe_cover_config/migration.sql`
- Create: `backend/src/application/recipe-designer/recipe-cover-config.service.ts`
- Test: `backend/tests/application/recipe-designer/recipe-cover-config.service.spec.ts`

**Interfaces:**
- Produces: `getPromptTemplate(): Promise<string>`；`updatePromptTemplate(input: { promptTemplate: string }, userId?: string): Promise<{ promptTemplate: string }>`；`DEFAULT_RECIPE_COVER_PROMPT`。

- [ ] **Step 1: Write the failing test**

```ts
it('没有配置时返回默认提示词', async () => {
  prisma.recipeCoverConfig.findUnique.mockResolvedValue(null);
  expect(await service.getPromptTemplate()).toContain('commercial food photographer');
});

it('保存后读回新提示词并 trim', async () => {
  prisma.recipeCoverConfig.upsert.mockResolvedValue({ promptTemplate: '新提示词' });
  await service.updatePromptTemplate({ promptTemplate: '  新提示词  ' }, 'admin-1');
  expect(prisma.recipeCoverConfig.upsert).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: 'singleton' },
    create: expect.objectContaining({ promptTemplate: '新提示词' }),
    update: expect.objectContaining({ promptTemplate: '新提示词', updatedBy: 'admin-1' }),
  }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/application/recipe-designer/recipe-cover-config.service.spec.ts -v`
Expected: FAIL（模块不存在）

- [ ] **Step 3: Add schema + migration**

`RecipeCoverConfig`：
- `id String @id @default("singleton")`
- `promptTemplate String @map("prompt_template") @db.Text`
- `updatedBy String? @map("updated_by")`
- `updatedAt DateTime @updatedAt @map("updated_at")`
- `@@map("recipe_cover_config")`

`DEFAULT_RECIPE_COVER_PROMPT` 使用当前 `buildRecipeCoverVisualSystemPrompt()` 的正文（写清：单段、全部食材、只吃肉/内脏/蔬菜/谷物的可见外观、生鲜、无文字、商业美食摄影、所有食材可见、无多余食物）。默认值放在服务文件中，不入库；首次保存才写行。

Run: `cd backend && npm run prisma:generate:build`

- [ ] **Step 4: Implement service**

`getPromptTemplate()`：`findUnique({ where: { id: 'singleton' } })`；无行 / 空串返回默认；否则 trim 后返回。
`updatePromptTemplate`：校验非空、长度 ≤ 6000；`upsert` singleton；返回 trim 后值。

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx jest tests/application/recipe-designer/recipe-cover-config.service.spec.ts -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20261028120000_recipe_cover_config backend/src/application/recipe-designer/recipe-cover-config.service.ts backend/tests/application/recipe-designer/recipe-cover-config.service.spec.ts
git commit -m "feat(ai-cover): add recipe cover prompt config"
```

## Task 2: ARK provider + DeepSeek 独立用途

**Files:**
- Modify: `backend/src/application/nutrition-governance/agent-provider-config.service.ts`
- Test: `backend/tests/application/nutrition-governance/agent-provider-config.service.spec.ts`

**Interfaces:**
- Produces: `ARK_PROVIDER = 'ARK'`；`RECIPE_COVER_PROMPT_PURPOSE = 'RECIPE_COVER_PROMPT'`；`RECIPE_COVER_IMAGE_PURPOSE = 'RECIPE_COVER_IMAGE'`；`getEnabledDeepSeekRuntimeConfig({ purpose: RECIPE_COVER_PROMPT_PURPOSE, fallbackToDefault: false })`；`getEnabledProviderRuntimeConfig({ purpose: RECIPE_COVER_IMAGE_PURPOSE, provider: ARK_PROVIDER })`。

- [ ] **Step 1: Write failing tests**

```ts
it('封面 DeepSeek 用途未配置时不回退默认', async () => {
  findDeepSeekConfig.mockResolvedValue(null);
  await expect(service.getEnabledDeepSeekRuntimeConfig({
    purpose: RECIPE_COVER_PROMPT_PURPOSE,
    fallbackToDefault: false,
  })).rejects.toThrow('未启用');
});

it('ARK 封面用途返回运行时配置', async () => {
  prisma.agentProviderConfig.findUnique.mockResolvedValue({ provider: 'ARK', purpose: 'RECIPE_COVER_IMAGE', enabled: true, baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-seedream-5-0-pro-260628', apiKeyEncrypted: encrypted, requestTimeoutMs: 120000, maxConcurrency: 1, retryCount: 0 });
  const cfg = await service.getEnabledProviderRuntimeConfig({ purpose: RECIPE_COVER_IMAGE_PURPOSE, provider: ARK_PROVIDER });
  expect(cfg.model).toBe('doubao-seedream-5-0-pro-260628');
});
```

- [ ] **Step 2: Run and see fail**

Run: `cd backend && npx jest tests/application/nutrition-governance/agent-provider-config.service.spec.ts -v`
Expected: FAIL（常量 / 行为不存在）

- [ ] **Step 3: Add constants and no-default behavior**

`ARK_PROVIDER='ARK'`；两个 purpose 常量；`getEnabledDeepSeekRuntimeConfig` 在 `fallbackToDefault:false` 且用途缺失时抛 `DeepSeek Agent 设置未启用`；`getEnabledProviderRuntimeConfig` 已支持任意 provider，确认 ARK 不改逻辑。

- [ ] **Step 4: Run and pass**

Run: `cd backend && npx jest tests/application/nutrition-governance/agent-provider-config.service.spec.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/application/nutrition-governance/agent-provider-config.service.ts backend/tests/application/nutrition-governance/agent-provider-config.service.spec.ts
git commit -m "feat(ai-cover): add ARK provider and dedicated DeepSeek purpose"
```

## Task 3: Seedream Ark 客户端

**Files:**
- Create: `backend/src/application/recipe-designer/seedream-image.ts`
- Test: `backend/tests/application/recipe-designer/seedream-image.spec.ts`

**Interfaces:**
- Produces: `callSeedreamImage(input: { baseUrl: string; model: string; apiKey: string; requestTimeoutMs: number; prompt: string; size?: string; watermark?: boolean }): Promise<{ url: string }>`。

- [ ] **Step 1: Write failing test（假 fetch）**

```ts
it('请求体带 model/prompt/2048x1152/watermark:false/response_format:url', async () => {
  fetchMock.mockResolvedValue({ ok: true, text: async () => JSON.stringify({ data: [{ url: 'https://ark.example.com/a.jpg' }] }) });
  const result = await callSeedreamImage({ baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-seedream-5-0-pro-260628', apiKey: 'key', requestTimeoutMs: 120000, prompt: 'prompt' });
  const body = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(fetchMock.mock.calls[0][0]).toBe('https://ark.cn-beijing.volces.com/api/v3/images/generations');
  expect(body).toMatchObject({ model: 'doubao-seedream-5-0-pro-260628', prompt: 'prompt', size: '2048x1152', response_format: 'url', watermark: false });
  expect(result.url).toBe('https://ark.example.com/a.jpg');
});
```

- [ ] **Step 2: Run fail**

Run: `cd backend && npx jest tests/application/recipe-designer/seedream-image.spec.ts -v`
Expected: FAIL

- [ ] **Step 3: Implement client**

- URL：`${baseUrl.replace(/\/+$/,'')}/images/generations`
- `Content-Type: application/json`；`Authorization: Bearer <key>`
- body：`{ model, prompt, size: size || '2048x1152', response_format: 'url', output_format: 'jpeg', watermark: watermark ?? false }`
- 超时 AbortController；错误中文；响应 `data[0].url`；缺 URL 报 `生图失败：接口没有返回图片地址`。

- [ ] **Step 4: Run pass**

Run: `cd backend && npx jest tests/application/recipe-designer/seedream-image.spec.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/application/recipe-designer/seedream-image.ts backend/tests/application/recipe-designer/seedream-image.spec.ts
git commit -m "feat(ai-cover): add Seedream image client"
```

## Task 4: 封面生成切 Seedream + DeepSeek 配置提示词

**Files:**
- Modify: `backend/src/application/recipe-designer/recipe-cover-image.service.ts`
- Modify: `backend/src/application/recipe-designer/recipe-cover-visual-brief.service.ts`
- Delete: `backend/src/application/recipe-designer/zhipu-image.ts`、`zhipu-api.ts`
- Test: `backend/tests/application/recipe-designer/recipe-cover-image.service.spec.ts`、`recipe-cover-visual-brief.service.spec.ts`

**Interfaces:**
- `RecipeCoverImageService.generate(input: { recipeName?: string; foodNames?: string[]; ingredients?: RecipeCoverIngredient[]; layout?: 'SQUARE'|'COVER_16_9' })` → `{ url, provider: 'ARK', model }`；内部用 `RecipeCoverConfigService.getPromptTemplate()` + `getEnabledDeepSeekRuntimeConfig({ purpose: 'RECIPE_COVER_PROMPT', fallbackToDefault: false })`；`SeedreamImageService`。
- `RecipeCoverImageService.isAvailable(): Promise<boolean>`：DeepSeek `RECIPE_COVER_PROMPT` 与 Ark `RECIPE_COVER_IMAGE` 都启用 + 提示词非空；`GET /recipes/ai-cover-availability` 使用它。
- `RecipeCoverVisualBriefService.build(ingredients)` 返回 DeepSeek 的 prompt 文本；不再用全局默认。

- [ ] **Step 1: Rewrite failing tests**

- 视觉 brief：配置服务返回自定义 prompt；DeepSeek 模型 `deepseek-flash`；用途 `RECIPE_COVER_PROMPT`；`fallbackToDefault:false`。
- 封面服务：Seedream 请求体 2048x1152/watermark false；下载 + 750 处理 + COS；不再有智谱。
- 可用性：DeepSeek / Ark 任一未配置或 prompt 为空 → `isAvailable=false`。
- 旧 `visualBrief` / `imageBrief` 分支可保留纯函数测试，但生产 service 不再走 ZHIPU。

- [ ] **Step 2: Run fail**

Run: `cd backend && npx jest tests/application/recipe-designer/recipe-cover-image.service.spec.ts tests/application/recipe-designer/recipe-cover-visual-brief.service.spec.ts -v`
Expected: FAIL

- [ ] **Step 3: Implement**

- `RecipeCoverVisualBriefService` 注入 `RecipeCoverConfigService`；system prompt 从配置读；DeepSeek 用途 / 模型；`extraBody` 关闭思考或低 effort；输出 sanitize / 约束。
- `RecipeCoverImageService` 用 `callSeedreamImage`；`size: '2048x1152'`、`watermark:false`；下载、`optimizeForUpload(…,'recipe-cover')`、COS；`provider:'ARK'`。
- `isAvailable` 改为检查两个用途 + prompt；不再调用智谱。
- 删除智谱文件；`app.module` 移除智谱 provider。

- [ ] **Step 4: Run pass**

Run: `cd backend && npx jest tests/application/recipe-designer/recipe-cover-image.service.spec.ts tests/application/recipe-designer/recipe-cover-visual-brief.service.spec.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/application/recipe-designer/recipe-cover-image.service.ts backend/src/application/recipe-designer/recipe-cover-visual-brief.service.ts backend/src/app.module.ts backend/tests/application/recipe-designer/recipe-cover-image.service.spec.ts backend/tests/application/recipe-designer/recipe-cover-visual-brief.service.spec.ts
git rm backend/src/application/recipe-designer/zhipu-image.ts backend/src/application/recipe-designer/zhipu-api.ts
git commit -m "feat(ai-cover): generate covers with Seedream and configured prompt"
```

## Task 5: 回收站 / 引用检查

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20261028130000_cover_trash/migration.sql`
- Create: `backend/src/application/recipe-designer/cover-reference.service.ts`
- Create: `backend/src/application/recipe-designer/cover-trash.service.ts`
- Modify: `backend/src/infrastructure/services/tencent-cos.service.ts`
- Test: `backend/tests/application/recipe-designer/cover-reference.service.spec.ts`、`cover-trash.service.spec.ts`

**Interfaces:**
- `CoverReferenceService.isReferenced(url: string): Promise<boolean>`（三表 count）。
- `CoverTrashService.trashIfUnreferenced(url: string, reason: 'REPLACED'|'REMOVED'|'PREVIEW_DISCARDED'|'UPLOAD_DISCARDED'): Promise<boolean>`。
- `TencentCosService.copyImageToTrash(url: string): Promise<string>`（复制 + 删原对象，返回 trash URL）。

- [ ] **Step 1: Failing tests**

- 任一表引用时 `isReferenced=true`；三表都 0 时 false。
- 未被引用：调用 COS 移动，写 `cover_trash`，`deleteAfter ≈ now+7d`。
- 被引用：不动 COS，返回 false。
- 非 `recipes/` URL：抛 400，不碰外部对象。

- [ ] **Step 2: Run fail / schema**

Run: `cd backend && npx jest tests/application/recipe-designer/cover-reference.service.spec.ts tests/application/recipe-designer/cover-trash.service.spec.ts -v`
Expected: FAIL

`CoverTrash`：`id`、`sourceUrl`、`trashUrl`、`reason`、`movedAt`、`deleteAfter`、`status`、`createdAt`；索引 `deleteAfter`；表 `cover_trash`。

- [ ] **Step 3: Implement**

- `TencentCosService`：新增 `copyImageToTrash`（SDK copyObject 到 `recipes/covers/trash/<timestamp>-<random>.<ext>`，成功后删原对象）。
- 只允许 `recipes/` 前缀；已是 `trash/` 直接返回。
- `CoverReferenceService` count `recipeSeries.coverImageUrl`、`designRecipe.coverImageUrl`、`recipe.coverImageUrl`。
- `CoverTrashService`：引用检查 → 移动 → 写表；7 天清理任务（`@nestjs/schedule` 每日或操作时检查）删除到期 trash 并标记 `DELETED`；失败日志。

- [ ] **Step 4: Pass**

Run: `cd backend && npx jest tests/application/recipe-designer/cover-reference.service.spec.ts tests/application/recipe-designer/cover-trash.service.spec.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20261028130000_cover_trash backend/src/application/recipe-designer/cover-reference.service.ts backend/src/application/recipe-designer/cover-trash.service.ts backend/src/infrastructure/services/tencent-cos.service.ts backend/tests/application/recipe-designer/cover-reference.service.spec.ts backend/tests/application/recipe-designer/cover-trash.service.spec.ts
git commit -m "feat(ai-cover): add reference-safe COS trash"
```

## Task 6: 系列 AI 封面改为只预览

**Files:**
- Modify: `backend/src/application/recipe-designer/series-cover-image.service.ts`
- Modify: `backend/src/interfaces/controllers/admin-recipe-series-cover.controller.ts`
- Test: `backend/tests/application/recipe-designer/series-cover-image.service.spec.ts`、`backend/tests/controllers/admin-recipe-series-cover.controller.spec.ts`

**Interfaces:**
- `SeriesCoverImageService.generateForSeries(seriesId: string): Promise<{ url; provider: 'ARK'; model; foodNames: string[]; stageCode: string | null }>`；不再有 `save`、不写 `RecipeSeries`。

- [ ] **Step 1: Rewrite tests**

- 合法系列：返回预览 URL / 食材 / stage；`recipeSeries.update` **未调用**。
- 阶段优先级 / 最新草稿 / fallback 保留。
- 临时名 / ORDER / 无食材 / 未配置：400/404；不调生图。
- 控制器：POST body 不再有 `save`；返回值无 `saved`。

- [ ] **Step 2: Run fail**

Run: `cd backend && npx jest tests/application/recipe-designer/series-cover-image.service.spec.ts tests/controllers/admin-recipe-series-cover.controller.spec.ts -v`
Expected: FAIL

- [ ] **Step 3: Implement**

- 删除 `save` 选项、`shouldSave`、`isSeriesLive` 的写库分支；保留阶段取数 / 校验 / 生图。
- 控制器只接收 `seriesId`；不再传 `save`。

- [ ] **Step 4: Pass**

Run: `cd backend && npx jest tests/application/recipe-designer/series-cover-image.service.spec.ts tests/controllers/admin-recipe-series-cover.controller.spec.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/application/recipe-designer/series-cover-image.service.ts backend/src/interfaces/controllers/admin-recipe-series-cover.controller.ts backend/tests/application/recipe-designer/series-cover-image.service.spec.ts backend/tests/controllers/admin-recipe-series-cover.controller.spec.ts
git commit -m "feat(ai-cover): make series AI cover preview-only"
```

## Task 7: 定制草稿 AI 封面

**Files:**
- Create: `backend/src/application/recipe-designer/design-recipe-cover-image.service.ts`
- Modify: `backend/src/interfaces/controllers/recipe-designer.controller.ts`
- Test: `backend/tests/application/recipe-designer/design-recipe-cover-image.service.spec.ts`、`backend/tests/controllers/recipe-designer-cover.controller.spec.ts`

**Interfaces:**
- `DesignRecipeCoverImageService.generateForDraft(draftId: string, access: RecipeDesignerAccessInput): Promise<{ url; provider: 'ARK'; model; foodNames: string[] }>`。
- `POST /api/v1/admin/design-recipes/:draftId/ai-cover`（AuthGuard + AdminGuard）→ preview。

- [ ] **Step 1: Failing tests**

- 读取当前 `DesignRecipe` 草稿 items；只 FOOD；排除补剂 / 包材 / 零重量 / 水；占比归一化；预处理整串进 DeepSeek payload。
- 不存在 / 无权限 / 无食材：404/403/400；不调生图。
- 控制器 admin-only；返回 `url/foodNames`，无写库。

- [ ] **Step 2: Run fail**

Run: `cd backend && npx jest tests/application/recipe-designer/design-recipe-cover-image.service.spec.ts tests/controllers/recipe-designer-cover.controller.spec.ts -v`
Expected: FAIL

- [ ] **Step 3: Implement**

- 复用 `getDraft` / `assertAccess`（按现有 `RecipeDesignerService` 的 access 方式）。
- 取 items；`extractIngredients` 逻辑与系列一致（可抽公共函数）。
- 调 `RecipeCoverImageService.generate({ ingredients, layout:'COVER_16_9' })`；返回预览。
- 控制器放在 `recipe-designer.controller.ts`，声明顺序避免被 `:id` 通配抢走。

- [ ] **Step 4: Pass**

Run: `cd backend && npx jest tests/application/recipe-designer/design-recipe-cover-image.service.spec.ts tests/controllers/recipe-designer-cover.controller.spec.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/application/recipe-designer/design-recipe-cover-image.service.ts backend/src/interfaces/controllers/recipe-designer.controller.ts backend/tests/application/recipe-designer/design-recipe-cover-image.service.spec.ts backend/tests/controllers/recipe-designer-cover.controller.spec.ts
git commit -m "feat(ai-cover): add draft cover generation for custom recipes"
```

## Task 8: 保存时旧封面回收站

**Files:**
- Modify: `backend/src/application/recipe-designer/recipe-designer.service.ts`
- Test: `backend/tests/application/recipe-designer/recipe-designer.presentation-cover-cleanup.spec.ts`

**Interfaces:**
- `updateSeriesReleaseSettings`：保存后对旧 `coverImageUrl` 调 `CoverTrashService.trashIfUnreferenced(old, 'REPLACED'|'REMOVED')`（`applyToLive` 同步后）。
- `updateDraftPresentation`：保存后对旧 `coverImageUrl` 调 `trashIfUnreferenced`。

- [ ] **Step 1: Failing tests**

- 系列旧封面 + `applyToLive:true`：先 `recipe.updateMany` 新图，再 `trashIfUnreferenced(old,'REPLACED')`。
- 旧 URL 仍被 Recipe 引用：`trashIfUnreferenced` 返回 false；不删。
- 草稿旧封面被已发布 Recipe 引用：跳过。
- 空 patch：不清理。
- 已上线系列清空封面：仍 400。

- [ ] **Step 2: Run fail**

Run: `cd backend && npx jest tests/application/recipe-designer/recipe-designer.presentation-cover-cleanup.spec.ts -v`
Expected: FAIL

- [ ] **Step 3: Implement**

- 更新前捕获 `oldCoverUrl`；更新后（系列在 `applyToLive` 事务后）调用垃圾服务；失败只记录，不回滚已保存内容。
- `trashIfUnreferenced` 在 `CoverTrashService` 内做引用检查；这里不重复。

- [ ] **Step 4: Pass**

Run: `cd backend && npx jest tests/application/recipe-designer/recipe-designer.presentation-cover-cleanup.spec.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/application/recipe-designer/recipe-designer.service.ts backend/tests/application/recipe-designer/recipe-designer.presentation-cover-cleanup.spec.ts
git commit -m "feat(ai-cover): trash old covers after saving"
```

## Task 9: 预览清理接口

**Files:**
- Create: `backend/src/interfaces/controllers/ai-cover-preview.controller.ts`
- Create: `backend/src/application/recipe-designer/ai-cover-preview.service.ts`
- Test: `backend/tests/controllers/ai-cover-preview.controller.spec.ts`

**Interfaces:**
- `DELETE /api/v1/admin/ai-covers/preview`，body `{ url: string }`，AuthGuard + AdminGuard。
- `AiCoverPreviewService.discard(url: string): Promise<{ trashed: boolean }>`。

- [ ] **Step 1: Failing tests**

- 未引用 URL：调 `trashIfUnreferenced(url,'PREVIEW_DISCARDED')`，返回 `trashed:true`。
- 已引用 URL：返回 `trashed:false`，不删。
- 非 `recipes/` URL：400。
- 非管理员：403。

- [ ] **Step 2: Run fail**

Run: `cd backend && npx jest tests/controllers/ai-cover-preview.controller.spec.ts -v`
Expected: FAIL

- [ ] **Step 3: Implement**

- 控制器 admin-only；DTO `url` 字符串非空。
- 服务校验前缀；调垃圾服务。

- [ ] **Step 4: Pass**

Run: `cd backend && npx jest tests/controllers/ai-cover-preview.controller.spec.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/interfaces/controllers/ai-cover-preview.controller.ts backend/src/application/recipe-designer/ai-cover-preview.service.ts backend/tests/controllers/ai-cover-preview.controller.spec.ts
git commit -m "feat(ai-cover): add preview discard endpoint"
```

## Task 10: AI 食谱封面配置 API

**Files:**
- Modify: `backend/src/interfaces/controllers/nutrition-governance.controller.ts`
- Modify: `backend/src/application/nutrition-governance/nutrition-governance.service.ts`
- Create: `backend/src/interfaces/dto/nutrition-governance/recipe-cover-config.dto.ts`
- Test: `backend/tests/controllers/recipe-cover-config.controller.spec.ts`

**Interfaces:**
- `GET /api/v1/admin/nutrition-governance/agent-providers/recipe-cover` → `{ deepseek: { enabled, configured, baseUrl, model, apiKeyLast4 }, ark: {...}, promptTemplate, ready }`。
- `PUT .../recipe-cover` body `{ deepseek: { enabled, baseUrl, model, apiKey?, clearApiKey? }, ark: {...}, promptTemplate }`；Key 加密；空 Key 保留旧；返回掩码。
- `ready = deepseek.enabled && deepseek.configured && ark.enabled && ark.configured && promptTemplate.trim().length > 0`。

- [ ] **Step 1: Failing tests**

- GET 未配置：ready false，两个 configured false，prompt 默认。
- PUT 保存 Key：加密、只回显末四位、不回明文。
- PUT 缺 Key 且启用：400。
- PUT 保存 prompt：读回 trim；清空 prompt：400。
- 非管理员：403。

- [ ] **Step 2: Run fail**

Run: `cd backend && npx jest tests/controllers/recipe-cover-config.controller.spec.ts -v`
Expected: FAIL

- [ ] **Step 3: Implement**

- 复用 `AgentProviderConfigService` 的 Key 加密 / 掩码；DeepSeek 用途 `RECIPE_COVER_PROMPT`，Ark 用途 `RECIPE_COVER_IMAGE`；都不回退默认。
- `RecipeCoverConfigService` 读写 prompt。
- `NutritionGovernanceService` 包装；DTO 校验。

- [ ] **Step 4: Pass**

Run: `cd backend && npx jest tests/controllers/recipe-cover-config.controller.spec.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/interfaces/controllers/nutrition-governance.controller.ts backend/src/application/nutrition-governance/nutrition-governance.service.ts backend/src/interfaces/dto/nutrition-governance/recipe-cover-config.dto.ts backend/tests/controllers/recipe-cover-config.controller.spec.ts
git commit -m "feat(ai-cover): add recipe cover config API"
```

## Task 11: 配置卡片 + 配置抽屉

**Files:**
- Modify: `admin-web/src/views/AgentConfig/index.vue`
- Create: `admin-web/src/views/AgentConfig/RecipeCoverConfigDrawer.vue`
- Modify: `admin-web/src/api/nutritionGovernance.ts`、`admin-web/src/types/nutritionGovernance.ts`
- Test: `admin-web/src/views/AgentConfig/recipeCoverConfig.regression.spec.ts`

**Interfaces:**
- 卡片状态：DeepSeek / Seedream / 提示词；「配置」打开抽屉。
- 抽屉字段：DeepSeek（启用 / Base URL / 模型 / Key）、Seedream（启用 / Base URL / 模型 / Key）、系统提示词、保存。
- 不出现尺寸 / 水印 / 生成规则 / 试写 / 试生成。

- [ ] **Step 1: Failing regression test**

```ts
it('AI 食谱封面卡片和配置字段，不含尺寸/水印/生成规则', () => {
  expect(agentConfigSource).toContain('AI 食谱封面');
  expect(drawerSource).toContain('deepseek-flash');
  expect(drawerSource).toContain('doubao-seedream-5-0-pro-260628');
  expect(drawerSource).toContain('系统提示词');
  expect(drawerSource).not.toContain('水印开关');
  expect(drawerSource).not.toContain('试生成');
  expect(agentConfigSource).not.toContain('智谱封面图');
});
```

- [ ] **Step 2: Run fail**

Run: `cd admin-web && npx vitest run src/views/AgentConfig/recipeCoverConfig.regression.spec.ts`
Expected: FAIL

- [ ] **Step 3: Implement UI + API**

- 卡片替换旧智谱卡片；配置抽屉；Key 密码框 / 末四位；保存；状态。
- API `getRecipeCoverConfig` / `updateRecipeCoverConfig`；类型。
- 移除 `zhipuImage` 卡片 / 引用。

- [ ] **Step 4: Run pass + build**

Run: `cd admin-web && npx vitest run src/views/AgentConfig/recipeCoverConfig.regression.spec.ts && npm run build`
Expected: PASS + build 成功

- [ ] **Step 5: Commit**

```bash
git add admin-web/src/views/AgentConfig/index.vue admin-web/src/views/AgentConfig/RecipeCoverConfigDrawer.vue admin-web/src/api/nutritionGovernance.ts admin-web/src/types/nutritionGovernance.ts admin-web/src/views/AgentConfig/recipeCoverConfig.regression.spec.ts
git commit -m "feat(ai-cover): add recipe cover config UI"
```

## Task 12: AICoverField + 产品线发布抽屉

**Files:**
- Create: `admin-web/src/views/RecipeDesigner/components/AICoverField.vue`
- Modify: `admin-web/src/views/RecipeDesigner/components/SeriesReleaseDrawer.vue`
- Modify: `admin-web/src/api/recipeDesigner.ts`、`admin-web/src/types/recipeDesigner.ts`
- Test: `admin-web/src/views/RecipeDesigner/aiCoverField.regression.spec.ts`、`seriesReleaseDrawer.regression.spec.ts`

**Interfaces:**
- `AICoverField` props `{ modelValue: string; target: { type:'series'|'design'; id:string }; isAdmin: boolean; isLive?: boolean; disabled?: boolean }`；emits `update:modelValue`。
- 系列 AI API：`POST /admin/recipe-series/:id/ai-cover` 返回 `{ url, foodNames, stageCode }`。
- 预览清理：`DELETE /admin/ai-covers/preview`。

- [ ] **Step 1: Failing regression**

- 组件有 AI 生成 / 上传 / 移除 / 大图预览 / 用这张 / 不要 / 重试。
- 生成中禁用，不阻断抽屉保存。
- 关闭 / 不要 / 重新生成调用预览清理。
- 已上线系列移除按钮禁用。
- `SeriesReleaseDrawer` 使用 `AICoverField`，不再有本地 `aiCoverPreviewUrl` 状态。

- [ ] **Step 2: Run fail**

Run: `cd admin-web && npx vitest run src/views/RecipeDesigner/aiCoverField.regression.spec.ts src/views/RecipeDesigner/seriesReleaseDrawer.regression.spec.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

- `AICoverField`：状态机（空 / 生成 / 预览 / 上传 / 错误）、可用性、清理、权限。
- `SeriesReleaseDrawer`：替换封面区；保存逻辑不变；后端保存清理旧图。
- API / 类型；超时 240000ms 中文提示。
- 手动上传复用 `recipeApi.uploadImage`。

- [ ] **Step 4: Pass**

Run: `cd admin-web && npx vitest run src/views/RecipeDesigner/aiCoverField.regression.spec.ts src/views/RecipeDesigner/seriesReleaseDrawer.regression.spec.ts && npm run build`
Expected: PASS + build

- [ ] **Step 5: Commit**

```bash
git add admin-web/src/views/RecipeDesigner/components/AICoverField.vue admin-web/src/views/RecipeDesigner/components/SeriesReleaseDrawer.vue admin-web/src/api/recipeDesigner.ts admin-web/src/types/recipeDesigner.ts admin-web/src/views/RecipeDesigner/aiCoverField.regression.spec.ts admin-web/src/views/RecipeDesigner/seriesReleaseDrawer.regression.spec.ts
git commit -m "feat(ai-cover): add shared cover field for series release"
```

## Task 13: 定制线上线检查接入

**Files:**
- Modify: `admin-web/src/views/RecipeDesigner/components/PresentationPanel.vue`
- Modify: `admin-web/src/api/recipeDesigner.ts`
- Test: `admin-web/src/views/RecipeDesigner/presentationPanel.regression.spec.ts`

**Interfaces:**
- `PresentationPanel` 的封面区用 `AICoverField`（`target.type='design'`，`id=draftId`）。
- 定制 AI API：`POST /admin/design-recipes/:id/ai-cover`。
- 保存仍走 `updateDraftPresentation`。

- [ ] **Step 1: Failing regression**

- `PresentationPanel` 使用 `AICoverField`；有 AI / 上传 / 移除 / 预览。
- 用这张只改 `form.coverImageUrl`；保存才落库。
- 已发布 Recipe 引用旧封面时不误删（后端测试已覆盖）。

- [ ] **Step 2: Run fail**

Run: `cd admin-web && npx vitest run src/views/RecipeDesigner/presentationPanel.regression.spec.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

- 替换现有上传 / 移除封面区块；保留保存 / dirty / 订单信息。
- API / 类型；移除旧内联上传逻辑。

- [ ] **Step 4: Pass**

Run: `cd admin-web && npx vitest run src/views/RecipeDesigner/presentationPanel.regression.spec.ts && npm run build`
Expected: PASS + build

- [ ] **Step 5: Commit**

```bash
git add admin-web/src/views/RecipeDesigner/components/PresentationPanel.vue admin-web/src/api/recipeDesigner.ts admin-web/src/views/RecipeDesigner/presentationPanel.regression.spec.ts
git commit -m "feat(ai-cover): add AI cover to custom recipe launch check"
```

## Task 14: 下线旧单食谱 AI 封面 + 智谱封面

**Files:**
- Modify: `admin-web/src/views/Recipes/RecipeForm.vue`
- Modify: `backend/src/interfaces/controllers/recipes.controller.ts`
- Modify: `backend/src/app.module.ts`
- Delete: 智谱封面相关文件 / 接口 / 测试 / 前端工具
- Test: `admin-web/src/views/Recipes/recipeForm.regression.spec.ts`（新增或扩展）；后端相关旧测试删除

**Interfaces:**
- 删除 `POST /recipes/:id/ai-cover`；删除 `RecipeForm.vue` AI 封面区块 / 状态 / API。
- 删除 `AgentConfig` 智谱卡片、`zhipuImage` API / 类型 / 测试、`nutrition-governance` 智谱配置接口、`zhipu-image.ts` / `zhipu-api.ts`、`zhipu-image-settings` 测试。
- `GET /recipes/ai-cover-availability` 保留但改查新配置（两页用）。

- [ ] **Step 1: Failing regression**

```ts
it('旧单食谱 AI 封面入口和智谱卡片消失', () => {
  expect(recipeFormSource).not.toContain('AI 生成封面图');
  expect(agentConfigSource).not.toContain('智谱封面图');
  expect(recipesApiSource).not.toContain('/ai-cover');
});
```

- [ ] **Step 2: Run fail**

Run: `cd admin-web && npx vitest run src/views/Recipes/recipeForm.regression.spec.ts`
Expected: FAIL

- [ ] **Step 3: Remove old code**

- 前端：删除 AI 区块、`aiCoverLoading`、API 调用、`zhipuImage` 工具 / 测试。
- 后端：删除 `recipes.controller` 单食谱 AI 接口、智谱配置接口 / 服务 / 客户端 / 测试；`app.module` 清理 provider。
- 保留智谱 `agent_provider_config` 行停用；不迁移删除。

- [ ] **Step 4: Run pass + builds**

Run:
```bash
cd backend && npm test && npm run build
cd admin-web && npx vitest run src/views/Recipes/recipeForm.regression.spec.ts && npm run build
```
Expected: 通过（后端 3 条既有失败除外）；无编译引用残留。

- [ ] **Step 5: Commit**

```bash
git add admin-web/src/views/Recipes/RecipeForm.vue admin-web/src/views/Recipes/recipeForm.regression.spec.ts backend/src/interfaces/controllers/recipes.controller.ts backend/src/app.module.ts
# 以及删除的智谱文件 / 测试
git commit -m "chore(ai-cover): remove legacy single-recipe AI cover and ZHIPU cover"
```

## Task 15: 全量验证 + 部署 + 真实链路

**Files:**
- 无新增；验证 / 部署。

- [ ] **Step 1: Backend full tests**

Run: `cd backend && npm test`
Expected: 仅 3 条既有失败（`tests/recipe.service.preparation-method-history.spec.ts`、`tests/application/supplement-shop/supplement-aftersale.service.spec.ts`）；其余通过。

- [ ] **Step 2: Builds**

Run:
```bash
cd backend && npm run build
cd admin-web && npm run build
```
Expected: 均成功。

- [ ] **Step 3: Push + deploy**

```bash
git fetch origin main
git rebase origin/main
git push origin HEAD:main
cd backend && bash scripts/remote_deploy_v2.sh
cd .. && bash deploy-admin-web.sh
```
Expected: 后端 / admin 部署成功，健康检查 200；部署脚本不会因 package.json scripts 变更触发 pnpm install（已加 lock hash 判定）。

- [ ] **Step 4: 老板配置 Ark Key + 真实链路**

- 老板在「AI / Agent 配置 → AI 食谱封面」填新火山 Ark Key、确认 DeepSeek Key / 模型 `deepseek-flash`、保存。
- 产品线：发布 / 更新抽屉点 AI 生成 → 预览 → 用这张 → 保存发布设置；检查 750×422、无文字、10 个食材、旧封面进回收站。
- 定制线：上线检查 → 订单展示 → AI 生成 → 用这张 → 保存展示资料；检查同样。
- 检查「不要」后预览图进回收站；已上线系列移除按钮禁用。

- [ ] **Step 5: Report**

报告部署提交、Seedream 真实出图结果、成本（约 0.2 元/张）、回收站验证结果；如有偏差，记录并修。

---

## Self-Review 记录

- 规格覆盖：配置 / 模型 / 数据 / 两页 / 共享组件 / 草稿 / 回收站 / 旧入口下线 / 旧封面引用安全，均有对应 Task。
- 类型一致性：`RecipeCoverImageService.generate` 入参 `ingredients`、`layout`；`SeriesCoverImageService.generateForSeries(seriesId)`；`DesignRecipeCoverImageService.generateForDraft(draftId, access)`；`CoverTrashService.trashIfUnreferenced(url, reason)`；前端 `AICoverField` `target` 联合类型。
- Review Focus 的引用 / 预览清理 / 已上线移除 / 缺失配置 / 食材口径 / COS 前缀，分别在 Task 5、8、9、10、12、13、14 有测试。
- 已知 3 条既有失败不作为新增失败；部署脚本的 lock hash 修复已在 `main`。
