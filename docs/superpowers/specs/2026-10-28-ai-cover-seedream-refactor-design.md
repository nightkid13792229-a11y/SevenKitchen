# AI 食谱封面重构（DeepSeek + Seedream 5.0 Pro）· 设计

- 日期：2026-10-28
- 状态：方案已确认（老板 2026-10-28 逐条确认；实施计划见 `docs/superpowers/plans/2026-10-28-ai-cover-seedream-refactor.md`）
- 范围：`backend/`、`admin-web/`
- 不在范围：小程序代码、封面角标、发布 / 更新 / 下线主流程、营养评估
- 取代：`docs/superpowers/specs/2026-10-27-series-ai-cover-design.md` 中的「智谱 GLM-Image 生图」部分；发布 / 更新抽屉和上线检查的交互骨架沿用

## 0. 一页话总结

1. **模型换掉**：不再使用智谱 GLM-Image。封面生图改用 **火山方舟 Seedream 5.0 Pro**（`doubao-seedream-5-0-pro-260628`，2048×1152，`watermark:false`）；写提示词用 **DeepSeek Flash**（`deepseek-flash`），不走系统默认配置。
2. **配置独立**：AI / Agent 配置页把「智谱封面图」卡片重构为「AI 食谱封面」卡片，点「配置」进入独立配置页；只配置 **DeepSeek（启用 / Base URL / 模型 / Key）**、**Seedream（启用 / Base URL / 模型 / Key）**、**系统提示词**；不配置尺寸、水印、生成规则、试写 / 试生成。
3. **两条产品线都有 AI 封面**：
   - 产品线：`SeriesReleaseDrawer`（发布 / 更新抽屉），封面是系列级；
   - 定制线：`LaunchReadinessDrawer` 的「订单展示」`PresentationPanel`（上线检查抽屉），封面是 `DesignRecipe` 草稿级。
4. **只做草稿预览**：点「AI 生成封面」→ 后端取最新配方食材 → DeepSeek 写 Seedream prompt → Seedream 生图 → 转存 COS → 预览；**不直接写线上**。点「用这张」只替换表单，保存 / 发布时才落库。
5. **数据口径**：仅 FOOD 食材，排除补剂 / 包材 / 零重量 / 水；每条带 **名称 + 部位/状态/预处理整串 + 归一化占比**。产品线沿用既有阶段优先级；定制线取当前 `DesignRecipe` 草稿。
6. **两页功能一致**：AI 生成、预览、用这张 / 不要、手动上传 / 更换、移除、大图预览；抽共享 `AICoverField` 组件。
7. **旧封面删除**：引用安全 + **7 天回收站**。保存 / 发布时，旧 URL 在 `RecipeSeries`、`DesignRecipe`、`Recipe` 中都不再被引用，才移到 `recipes/covers/trash/`，7 天后删除；还有引用就保留。AI 预览未采用、手动上传未保存的图同样进回收站 / 清理。
8. **下线旧入口**：旧「编辑食谱」页的「AI 生成封面图」直接删除；旧「智谱封面图」卡片、Key 配置、GLM 生图代码全部停用 / 删除。GLM 不再出现在生产封面链路。
9. **不存 1500 母图**：Seedream 2048×1152 → 现有 `recipe-cover` 处理 → 750×422、≤160KB，存 COS。
10. **成本 / 权限**：Seedream 约 0.2 元/张；AI 生成、配置仅管理员；手动上传按现有权限；每次点击只生成一张，不自动循环。

## 1. 背景与问题

上一期（2026-10-27）把 AI 自动封面做进了产品线发布抽屉，使用智谱 GLM-Image。实测 10 个食材的食谱封面出现三类问题：

- 文字：模型把中文食材名 / 百分比画成标签；
- 食材：只画 5–6 个，或把鸭胸画成鸡胸、燕麦画成荞麦；
- 质感：素材库感、生肉不诱人。

经过多轮提示词、画面描述、构图调整，GLM 仍然无法稳定画对 10 个食材。2026-10-28 在 DSH 里用 **Seedream 5.0 Pro** 跑同一份食谱，一版就把 10 个食材、心/胗/肝三碟、一个生蛋、无文字、商业质感做对（9/10）。因此决定把封面生图整体切到 Seedream。

同时，定制线的上线检查目前只有手动上传 / 移除封面，没有 AI；产品线已有 AI 但只在发布抽屉。两条线需要统一能力、统一配置、统一清理策略。

## 2. 老板已确认的决定（2026-10-28）

1. **完全用 Seedream 5.0 Pro 替代 GLM-Image**；DeepSeek 写提示词，Seedream 生图；不再使用 GLM-Image。
2. 新增 / 重构「AI 食谱封面」配置板块：与其它 AI Agent 一样，先看到卡片，点「配置」才进入配置页；DeepSeek 和火山 Ark 分别独立配置，**不使用系统默认**。
3. DeepSeek 配置新增「指定模型」；能用轻量模型就用轻量模型提升速度。
4. 配置板块只保留必要参数；尺寸、水印、生成规则不做配置：
   - 尺寸是 API 生成参数，代码固定 2048×1152；提示词里的 16:9 只是引导，生图后的 750×422 是最终门禁；
   - 水印由 API 的 `watermark:false` 控制，代码固定关闭，不做 Web 开关；
   - 生成规则（仅食材、阶段优先级、草稿、7 天回收站）写死在代码 / DSH，不在后台配置；
   - 不做「试写提示词 / 试生成」；测试直接在生产点一次 AI 生成。
5. 产品线阶段优先级沿用之前定的顺序；定制线取当前草稿。
6. 抽共享 `AICoverField` 组件。
7. 不额外存 1500 宽母图。
8. 火山 Ark Key 由老板新建生产专用 Key。
9. 旧封面删除采用「引用安全 + 7 天回收站」。
10. 旧单食谱 AI 封面入口直接下线。

## 3. 配置板块：AI 食谱封面

### 3.1 卡片

在 `admin-web/src/views/AgentConfig/index.vue` 中，把现有「智谱封面图（食谱封面图生成）」卡片替换为「AI 食谱封面」卡片：

- 标题：AI 食谱封面
- 说明：DeepSeek 写提示词，Seedream 5.0 Pro 生图
- 状态：DeepSeek 已配置 / 未配置；Seedream 已配置 / 未配置；提示词 已配置 / 默认
- 按钮：「配置」
- 功能可用条件：DeepSeek 已启用 + Seedream 已启用 + 提示词非空

卡片不展示 Key 明文，只展示末四位；与其他 AI Agent 卡片一致的交互（点击配置进入配置页 / 抽屉）。

### 3.2 配置页字段

| 分组 | 字段 | 说明 |
|---|---|---|
| DeepSeek | 启用 | 布尔 |
| DeepSeek | Base URL | 默认 `https://api.deepseek.com` |
| DeepSeek | 模型 | 默认 `deepseek-flash`；支持手填 / 拉取模型 |
| DeepSeek | API Key | 密码框；加密存储；回显末四位；留空不修改 |
| Seedream | 启用 | 布尔 |
| Seedream | Base URL | 默认 `https://ark.cn-beijing.volces.com/api/v3` |
| Seedream | 模型 | 默认 `doubao-seedream-5-0-pro-260628` |
| Seedream | API Key | 密码框；加密存储；回显末四位；留空不修改 |
| 提示词 | 系统提示词 | 多行文本；DeepSeek 的 system prompt；可恢复默认 |
| 状态 | 保存 | 保存配置并刷新卡片状态 |

不放入配置页：尺寸、水印、超时、温度、最大 tokens、生成规则、试写提示词、试生成、回收站天数。

### 3.3 DeepSeek 模型

当前 DeepSeek Key 可调用的模型（2026-10-28 通过 `/models` 查询）：

- `deepseek-flash`（DeepSeek-V4.1-Flash）：轻量，1M 上下文，支持文字 + 图片输入，effort 低 / 高 / 最高；**封面提示词用它**。
- `deepseek-v4-pro`（DeepSeek-V4-Pro）：更重，纯文本，1M 上下文；封面不需要。

代码固定：

- 模型默认 `deepseek-flash`；配置页允许改；
- 请求关闭思考 / 使用低 effort，提升速度；
- 温度、最大 tokens、超时由代码默认，不暴露。

### 3.4 Seedream 参数

- 模型：`doubao-seedream-5-0-pro-260628`
- 尺寸：`2048x1152`（16:9；API `size` 参数，代码固定）
- 输出格式：JPEG / URL
- 水印：`watermark: false`（API 参数，代码固定；控制台账号级默认不能覆盖时以控制台为准）
- 参考图：本期不用

### 3.5 提示词

- **预设系统提示词**：DeepSeek 的 system prompt，指导它把配方数据写成 Seedream 的摄影 prompt。
- **Seedream 固定约束**：代码常量，追加在 DeepSeek 输出后，兜底「无文字、仅食材、生鲜、不裁剪」；不在配置页暴露。
- **配方数据**：由后端结构化后作为 DeepSeek 的 user payload；不是手填。
- 不做试写 / 试生成；生产点一次 AI 生成就是测试。

## 4. 数据口径

### 4.1 产品线（Series）

沿用 2026-10-27 已确认的阶段优先级：

1. 普通成年犬（`HIGH_ACTIVITY_ADULT`）
2. 大于等于 14 周幼犬（`PUPPY_14_WEEKS_PLUS`）
3. 低运动量成犬或老年犬（`LOW_ACTIVITY_ADULT_OR_SENIOR`）
4. 繁殖期（`REPRODUCTION`）

取该阶段**最新一份有食材的 DesignRecipe 草稿**；该阶段没有草稿时退回该阶段已发布 / 草稿 Recipe；四个阶段都没有时退回最近一份有食材的草稿；最后退回最近一份 Recipe。仅 FOOD，排除补剂 / 包材 / 零重量 / 水；同名同预处理合并；占比归一化。

### 4.2 定制线（DesignRecipe）

取当前「上线检查」对应的 `DesignRecipe` 草稿（最新版本）的 items：

- 仅 `IngredientType.FOOD`；
- 排除补剂 / 包材 / 零重量 / 水；
- 名称 + `preparationMethod` 整串 + 归一化 `ratioPercent`；
- 同名同预处理合并。

不取已发布历史版本；封面与检查中的配方一致。

### 4.3 结构化输入

```json
{
  "ingredients": [
    { "index": 0, "name": "鸭胸", "preparation": "鸭胸/生/去皮", "ratio": 47 },
    { "index": 1, "name": "燕麦米", "preparation": "生", "ratio": 16 }
  ]
}
```

DeepSeek 输出一段英文摄影 prompt；后端追加固定约束后交给 Seedream。不把中文名 / 百分比原文直接塞给 Seedream。

## 5. 生成流程

```text
点击 AI 生成封面
  → 后端取该实体最新配方的食材（仅 FOOD）
  → DeepSeek（deepseek-flash，低 effort）写 Seedream prompt
  → Seedream 5.0 Pro（2048×1152，watermark:false）
  → 下载结果图
  → ImageOptimizationService `recipe-cover`（750×422、≤160KB）
  → 上传 COS `recipes/covers/`
  → 返回预览 URL（不写实体封面）
  → 抽屉显示预览
  → 用这张 → 只改表单
  → 保存发布设置 / 保存展示资料 → 落库 + 旧封面回收站
```

### 5.1 草稿语义

- AI 接口**永远只返回预览 URL**，不写 `RecipeSeries` / `DesignRecipe` / `Recipe` 的封面字段。
- 产品线：`SeriesReleaseDrawer` 的「保存发布设置」落库；已上线系列保存时同步 PUBLIC 食谱封面。
- 定制线：`PresentationPanel` 的「保存展示资料」通过 `updateDraftPresentation` 落库到 `DesignRecipe`；发布 / 提交时再同步。
- 不再沿用「空封面 + 未上线就自动写系列」的行为；首生成也只做预览。

### 5.2 预览回收

- 点「不要」、重新生成、关闭抽屉、切换实体：未采用的预览 URL 调清理接口，进 7 天回收站。
- 手动上传后未保存的 URL 同样清理。
- 已经「用这张」并保存的 URL 不清理。

## 6. 两个页面

### 6.1 产品线：发布 / 更新抽屉

`admin-web/src/views/RecipeDesigner/components/SeriesReleaseDrawer.vue`

- 封面区域替换为共享 `AICoverField`：
  - 大图预览（点击打开弹窗）；
  - AI 生成 / 重新生成；
  - 手动上传 / 更换；
  - 移除封面（已上线系列禁用 / 隐藏，后端也拒绝清空）；
  - 生成中遮罩、错误 + 重试、AI 预览「用这张 / 不要」。
- 「保存发布设置」逻辑不变；保存成功后由后端清理旧封面。
- 不再在前端维护 AI 生成 / 预览状态，统一交给 `AICoverField`。

### 6.2 定制线：上线检查抽屉

`admin-web/src/views/RecipeDesigner/components/LaunchReadinessDrawer.vue` 里的 `PresentationPanel.vue`（仅 `designMode === 'ORDER'` 渲染）：

- 封面区域替换为共享 `AICoverField`，实体类型 `design`，实体 ID 为 `draftId`；
- AI 生成调用新的定制草稿接口；
- 用这张只改 `form.coverImageUrl`；
- 「保存展示资料」通过 `updateDraftPresentation` 落库；
- 手动上传 / 更换、移除、大图预览与产品线一致；
- 旧封面的回收站由后端保存逻辑处理。

### 6.3 共享组件 `AICoverField`

职责：

- 展示封面（空态 / 已有图 / 上传中 / 生成中）；
- 点击大图打开预览弹窗；
- 管理员 AI 生成按钮；可用性检查；
- 手动上传 / 更换（复用 `recipeApi.uploadImage`）；
- 移除（清空 v-model；已上线系列禁用）；
- AI 预览弹窗：用这张 / 不要；
- 失败 / 超时错误 + 重试；
- 关闭 / 切换 / 重新生成时清理未采用的预览和未保存的上传。

Props（建议）：

```ts
type CoverTarget =
  | { type: 'series'; id: string }
  | { type: 'design'; id: string }

defineProps<{
  modelValue: string
  target: CoverTarget
  isAdmin: boolean
  isLive?: boolean
  disabled?: boolean
}>()

defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()
```

- `AICoverField` 只负责封面字段，不负责保存 / 发布；保存仍由父页面完成。
- 产品线与定制线共用，差异通过 `target.type` 和接口映射。

### 6.4 权限

- AI 生成：仅管理员；
- 配置：仅管理员；
- 手动上传 / 移除：沿用现有页面的权限（展示资料 / 发布设置）；
- 已上线系列不能移除封面，只能更换；
- 定制草稿可以移除；已发布 Recipe 是否允许清空沿用后端现有校验。

## 7. COS 清理

### 7.1 引用

同一个封面 URL 可能被多处引用：

- `RecipeSeries.coverImageUrl`
- `DesignRecipe.coverImageUrl`
- `Recipe.coverImageUrl`（已发布 / 各阶段 / 定制副本）

系列发布带 `applyToLive` 时会把系列封面复制到所有 PUBLIC 食谱。**不能直接按 URL 删除**。

### 7.2 规则

1. 只在**保存 / 发布成功**后处理旧封面；用户点「移除」但没保存时不动线上图。
2. 旧 URL 在以上三张表中都不再被引用，才移到 `recipes/covers/trash/`。
3. 还有引用就保留；等最后一个引用被替换时再进回收站。
4. 产品线保存带 `applyToLive` 时先同步所有 PUBLIC 食谱，再检查引用、移回收站。
5. 定制线只更新 `DesignRecipe` 草稿；如果已发布 `Recipe` 仍引用旧图，保留，等发布同步后再处理。
6. AI 预览未采用、手动上传未保存：调清理接口；未被引用才进回收站。
7. 回收站保留 **7 天**；到期由 COS 生命周期或每日清理任务删除。
8. 只允许处理本项目 COS 前缀（`recipes/`、`recipes/covers/`）；外部 URL 不碰。
9. 删除失败记录日志，可重试；DB 已指向新图，不让用户卡住。
10. 已上线系列不能清空封面；「移除」只对草稿 / 未上线可用。

### 7.3 数据结构

`cover_trash`：

- `id`
- `source_url`
- `trash_url`
- `reason`（REPLACED / REMOVED / PREVIEW_DISCARDED / UPLOAD_DISCARDED）
- `moved_at`
- `delete_after`（+7 天）
- `status`（PENDING / DELETED）
- `created_at`

### 7.4 操作顺序

1. 保存实体新封面（DB 更新 / 同步 PUBLIC 食谱）；
2. 查旧 URL 引用；
3. 无引用：复制到 trash 前缀 → 删除原对象 → 写 `cover_trash`；
4. 有引用：跳过，记录日志；
5. 7 天后清理任务删 trash 对象并标记 `DELETED`。

## 8. 后端改动

### 8.1 配置

- `AgentProviderConfig`：
  - 新增 provider `ARK`；
  - DeepSeek 用途 `RECIPE_COVER_PROMPT`；
  - Ark 用途 `RECIPE_COVER_IMAGE`；
  - 两者都**不回退系统默认**；缺失时 `isAvailable=false`。
- 新增 `RecipeCoverConfig` 单例表：`prompt_template`、`updated_by`、`updated_at`。
- 新增配置控制器：
  - `GET /api/v1/admin/nutrition-governance/agent-providers/recipe-cover`
  - `PUT /api/v1/admin/nutrition-governance/agent-providers/recipe-cover`
  - 返回 DeepSeek / Ark 状态（Key 末四位）、提示词、是否可用。
- `GET /recipes/ai-cover-availability` 改为检查「DeepSeek + Ark + 提示词」；不再检查智谱。

### 8.2 服务

- `SeedreamImageService`：调用 Ark 图片生成 API；`size=2048x1152`、`watermark=false`、`response_format=url`；下载 / 转存；错误中文。
- `RecipeCoverImageService`：从智谱切到 Seedream；保留 DeepSeek 视觉 brief / 图片处理 / COS。
- `RecipeCoverVisualBriefService`：DeepSeek 使用 `RECIPE_COVER_PROMPT` 配置与系统提示词；模型默认 `deepseek-flash`；低 effort。
- `SeriesCoverImageService`：保留阶段取数；改为**只预览**，不写系列。
- `DesignRecipeCoverImageService`：新；按 `draftId` 取当前草稿食材；只预览。
- `CoverTrashService` / `CoverReferenceService`：引用检查、回收站、7 天清理。
- `RecipeCoverConfigService`：提示词读写、默认值、可用性。
- 保存服务：
  - `updateSeriesReleaseSettings`：保存后旧封面回收站；
  - `updateDraftPresentation`：保存后旧封面回收站。
- 清理接口：
  - `DELETE /api/v1/admin/ai-covers/preview`（body `{ url }`）：预览 / 未保存上传图清理。

### 8.3 下线

- 删除旧 `POST /recipes/:id/ai-cover` 与 `GET /recipes/ai-cover-availability` 的单食谱用法（可用性接口保留给两页，改查新配置）。
- 删除 `RecipeForm.vue` 的 AI 封面区块。
- 删除智谱封面：`AgentConfig` 卡片、`zhipuImage` 工具、`nutrition-governance` 的智谱配置接口、`zhipu-image.ts`、`zhipu-api.ts`、相关测试。
- 智谱 `AgentProviderConfig` 行不迁移删除，保留停用（回滚用）；生产不再调用。

## 9. 前端改动

- `AgentConfig/index.vue`：删「智谱封面图」卡片；新增「AI 食谱封面」卡片 + 配置抽屉。
- 新增 `RecipeCoverConfigDrawer.vue`：DeepSeek / Seedream / 提示词 / 保存。
- 新增 `AICoverField.vue`：共享封面字段。
- `SeriesReleaseDrawer.vue`：接入 `AICoverField`；删除本地 AI 状态 / 预览逻辑。
- `PresentationPanel.vue`：接入 `AICoverField`；保留保存逻辑。
- `api/recipeDesigner.ts`：
  - 系列 AI 接口改为新返回；
  - 新增定制草稿 AI 接口；
  - 新增预览清理接口；
  - 删除旧单食谱 AI 接口。
- 删除 `zhipuImage` 相关 API / 类型 / 测试。

## 10. 数据库

- 新增 `recipe_cover_config`（单例）。
- 新增 `cover_trash`。
- `AgentProviderConfig.provider` 是 `String`，新增 `ARK` 不需要字段迁移。
- 智谱旧配置行保留（停用）。
- 不新增 `RecipeSeries` / `DesignRecipe` / `Recipe` 字段。

## 11. 安全 / 权限 / 成本

- 配置、AI 生成仅管理员；Key 加密存储，只回显末四位；不写日志。
- Seedream 约 0.2 元/张；DeepSeek flash 每次几分钱；不自动重试、不打开抽屉自动生成。
- 每次点击只生成一张；预览未采用进回收站，不重复堆积。
- COS 删除只允许本项目前缀；引用检查后才移动。
- 回收站 7 天可恢复。

## 12. 验收标准

1. 配置页只出现 DeepSeek（4 项）、Seedream（4 项）、系统提示词、保存；没有尺寸 / 水印 / 生成规则 / 试写 / 试生成。
2. 未配置 DeepSeek 或 Ark 时，AI 按钮不可用 / 点击报清楚原因；不会回退系统默认。
3. 产品线发布 / 更新抽屉：AI 生成 → 预览 → 用这张 → 保存发布设置；保存后旧封面在无引用时进回收站。
4. 定制线上线检查抽屉：AI 生成 → 预览 → 用这张 → 保存展示资料；保存后旧封面在无引用时进回收站。
5. 两个页面都有手动上传 / 更换、移除、大图预览、错误重试。
6. AI 预览「不要」/ 关闭 / 重新生成后，未采用图进回收站；不残留孤儿图。
7. 旧封面仍被 PUBLIC 食谱引用时不被删除；同步后才进回收站。
8. 旧单食谱 AI 封面入口消失；智谱封面卡片 / 代码不再被调用。
9. 图片规格：2048×1152 生成 → 750×422、≤160KB → COS；不存 1500 母图。
10. 后端全量测试 / 构建、admin 测试 / 构建通过；部署后由老板新建 Ark Key 并跑一次真实链路。

## 13. 不做的事

- 不改小程序；
- 不改封面角标；
- 不改发布 / 更新 / 下线主流程；
- 不做参考图 / 品牌风格库；
- 不做 1500 宽母图；
- 不做配置页的试写 / 试生成 / 规则配置；
- 不做 GLM 自动降级。

## 14. 风险与回滚

- **旧图仍被引用**：引用检查 + 7 天回收站；如误删，7 天内从 trash 恢复。
- **Seedream API 不可用**：报错 + 重试；不自动切 GLM；保留旧封面。
- **Ark Key 未配置**：功能不可用；配置卡片提示。
- **回滚**：代码回滚到上一版；智谱旧配置行保留停用，可临时恢复旧代码；但生产不再默认使用 GLM。

## 15. 实施顺序

1. 配置 / 数据层：RecipeCoverConfig、CoverTrash、ARK/DeepSeek 配置、Seedream client。
2. 生成服务：Seedream + DeepSeek prompt + 图片处理；系列 / 定制取数。
3. 两个 AI 接口：系列预览、定制草稿预览。
4. 保存 / 回收站 / 预览清理。
5. 配置 API / UI。
6. `AICoverField` + 两个页面。
7. 下线旧单食谱 / 智谱。
8. 全量测试、构建、部署、真实链路验收。
