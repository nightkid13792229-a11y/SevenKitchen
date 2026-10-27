# 产品线「AI 自动封面」· 设计

- 日期：2026-10-27
- 状态：已确认（老板 2026-10-27 批准；实施计划见 `docs/superpowers/plans/2026-10-27-series-ai-cover.md`）
- 范围：`backend/`（新增系列级生图接口 + 复用生图/转存服务）、`admin-web/`（发布 / 更新抽屉的封面生成交互）
- 不在本次范围：小程序代码、封面角标、发布 / 更新主流程、旧「编辑食谱」页的单食谱 AI 封面、数据库结构
- 上一期设计稿：`docs/superpowers/specs/2026-10-26-series-release-and-auto-cover-design.md`（第 13 节的方向）

## 0. 一页话总结

1. 发布 / 更新抽屉的封面图旁边，给管理员一个按钮：**封面为空时叫「AI 生成图片」，已有封面时叫「重新生成」**。只有人点了才会花钱。
2. 未上线系列、封面为空时：点一次 → 生成 → 转存 COS → **直接保存到系列**；不推给顾客，也不改任何 PUBLISHED 食谱行。已上线系列一律先预览、再保存。
3. 已有封面时：点「重新生成」→ 先确认（会覆盖、约 0.1 元）→ 生成后**只出预览**，点「用这张」才替换抽屉里的封面；最终要运营点「保存发布设置」才落库、才对线上生效。
4. 生图直接要 16:9 横图（智谱 `1728x960`），再走系统里现成的封面压缩流程统一成 750×422、160KB 以内，转存 COS；**不会存智谱的 30 天临时链接**。
5. 失败 / 超时保留原封面，给一行原因 + 「重试」；**没有自动重试、没有打开抽屉就自动生成**。
6. 不新增数据库字段，沿用 `recipe_series.cover_image_url`。

## 1. 这份设计要解决什么

上一期把「系列发布 / 更新 + 封面角标」做完并上线了，AI 自动封面被明确挪到下个阶段（上一期设计稿第 13 节）。这一期要解决的是运营做一条新产品线时最烦的一步：**封面图要自己找、自己裁**。

现在的情况：

- 发布 / 更新抽屉的封面只能手动上传（JPG / PNG / WebP ≤5MB），而且**不允许外链**；
- 后端其实已经有完整的 AI 生图能力（智谱 `glm-image` → 下载临时图 → 转存腾讯云 COS），但只有旧「编辑食谱」页在用；
- 设计器（产品线）没有生图入口，运营要么去翻素材，要么回旧页面绕一圈。

老板 2026-10-27 明确：**首次生成也要按钮，必须管理员手动点**，不要打开抽屉就自动生成、自动花钱。

## 2. 已确认的决定

### 2.1 老板确认（2026-10-27）

1. 首次生成和重新生成都放在封面图旁边，做成按钮；**必须管理员手动点击**才开始生成。
2. 生成后只保存到系列，**不自动改线上**；线上同步仍然只由人点「保存发布设置」触发。
3. 生图直接出 16:9 方向、再统一裁切/压缩，不要拿方图硬裁。
4. 生成按钮只在「AI 可用 + 管理员 + 系列名已定」时可用；运营不想要可以移除、可以重新生成。
5. 失败 / 超时 / 未配置 AI 都要有清楚的文案和重试入口；替换已有封面必须有「使用这张」确认。
6. 成本控制：一次点击只生成一张；不自动循环；重新生成是显式操作。
7. 上一期 A–E 五条建议均无异议（本文件第 2.2 节逐条落成规则）。

### 2.2 逐条落成规则

| 议题 | 最终规则 |
|---|---|
| A. 已上线系列保存语义 | 生图接口**从不**写 `Recipe` 行、**从不**传 `applyToLive`。**未上线**系列的空封面首生成只写系列 `coverImageUrl`；已有封面、以及**已上线系列的请求**一律按预览处理（后端即使收到 `save=true` 也不落库），落库与线上同步交给既有的「保存发布设置」。 |
| B. 比例 | 生图尺寸用智谱推荐的 `1728x960`（16:9 方向、最接近的官方档位），拿回 Buffer 后用 `ImageOptimizationService` 的 `recipe-cover` 预设统一成 750×422、≤160KB 的 JPEG，再传 COS。 |
| C. 触发 / 撤销 | **不自动生成**。封面为空显示「AI 生成图片」；已有封面显示「重新生成」。不想要：移除封面（未上线系列保存即清空）。想再来一张：重新生成。 |
| D. 失败 / 超时 / 未配置 | 未配置：按钮置灰 + 配置指引；生成中：封面框遮罩 + 按钮转圈，其它字段照常可编辑；失败 / 超时：封面下方红字原因 + 「重试」，原封面不动。 |
| E. 成本 | 一次点击 = 一次请求；请求中按钮禁用；已有封面时先弹确认（覆盖提示 + 约 0.1 元/张）；没有自动重试、没有打开即生成。 |

## 3. 目标 / 非目标 / 反目标

### 目标

1. 运营在发布 / 更新抽屉里，点一下就能得到一张和系列名、食材对得上的封面；未上线系列直接存进系列，已上线系列先预览再确认。
2. 替换已有封面必须先看预览、再确认；不确认就不覆盖。
3. 生成失败不影响已有封面，也不阻断抽屉里的其它操作。
4. 复用现有生图 / 转存 / 取食材的能力，不重写一套。
5. AI 图必须是 COS 地址，永远不把智谱临时链接存进数据库。
6. 顾客看到的比例、尺寸和手动上传的封面完全一致（16:9、750×422）。

### 非目标

1. 不做「打开抽屉自动生成」——老板 2026-10-27 明确要手动点。
2. 不改小程序代码；封面 URL 仍然由系列在发布 / 保存时写入 `Recipe` 行，小程序只读。
3. 不改封面角标：AI 图里**不烘字、不烘角标**，角标仍由前端叠加。
4. 不改发布 / 更新主流程、不改阶段发布、不改上线检查。
5. 不改旧「编辑食谱」页的单食谱 AI 封面（继续方图、继续只预览不保存）。
6. 不新增数据库字段、不做 migration。
7. 不做图片回收（被替换掉的旧 COS 文件不删）。

### 反目标（做了就算失败）

1. AI 生成或确认替换时，直接把已上线系列的门面推送线上（跳过人点保存）。
2. 生图接口写 `Recipe` 行、改配方内容、营养数据或版本号。
3. 打开抽屉就自动花钱；或失败后自动循环重试。
4. 把智谱返回的临时链接存进 `coverImageUrl`。
5. AI 图里出现文字、角标、品牌 logo。
6. 生成失败时把原来的封面冲掉。
7. 改动角标白名单 / 角标表 / 小程序展示逻辑。

## 4. 现状与证据（为什么能复用）

### 4.1 后端已有能力

| 能力 | 位置 | 现状 |
|---|---|---|
| 生图 + 转存 | `backend/src/application/recipe-designer/recipe-cover-image.service.ts` | `isAvailable()` / `generate()`；智谱 `glm-image` → 下载临时图 → COS `recipes/covers` |
| 智谱客户端 | `backend/src/application/recipe-designer/zhipu-image.ts` | 支持 `size` / `quality` / `userId`；提示词按食谱名 + 食材名拼，明确排除文字/水印 |
| 单食谱 AI 封面 | `backend/src/interfaces/controllers/recipes.controller.ts` | `GET /recipes/ai-cover-availability`、`POST /recipes/:id/ai-cover`；只返回 URL，不写库 |
| 图片压缩 | `backend/src/infrastructure/services/image-optimization.service.ts` | `recipe-cover` 预设：居中裁切为 750×422、逐档降质量到 ≤160KB |
| 系列封面字段 | `RecipeSeries.coverImageUrl` | 已有，无需新增 |
| 系列发布抽屉 | `admin-web/.../SeriesReleaseDrawer.vue` | 封面上传 / 移除、顾客预览、保存发布设置（`applyToLive=true`）、角标编辑 |

### 4.2 关键事实

1. **智谱 `glm-image` 的官方推荐尺寸**里有 `1728x960`（1.8:1，最接近 16:9 的横图档位），自定义尺寸要求 512–2048、且为 32 的整数倍。腾讯云那一步会把最终图压到 750×422，所以**不需要**为了精确 16:9 去赌自定义尺寸。
2. **方图会被裁掉近一半**：小程序封面高 392rpx、占满屏宽（750rpx），约 1.9:1；`mode="aspectFill"` 会上下裁。1280×1280 方图直接展示只剩中间一条，碗很容易被切。
3. **手动上传的最终规格是 750×422 / ≤160KB**（`recipe-cover` 预设）；AI 图走同一套预设，顾客侧加载速度和现有封面一致。
4. **生图很慢**：生产用 `glm-image`，实测约 20–40 秒/张；后端给智谱的请求超时默认 90 秒，前端留 120 秒兜底。
5. **已上线系列不能清空封面**（上一期规则），所以「空封面」基本只出现在**未上线**系列；已上线系列即使数据异常为空，也走「生成 → 预览 → 用这张 → 保存」，不直接落库（否则保存按钮不会变脏，没有入口把新封面推上线）。
6. **抽屉里的系列名可能还没保存**：名称输入框失焦 / 回车即写库（`AiNameField`）；临时名（`未命名系列 · …`）不能进提示词，否则会生成一张毫无意义的图。

## 5. 交互设计

### 5.1 入口与按钮

封面图这一项，在封面框右侧（现有的「移除封面 / 建议 16:9」那一列）新增一行按钮，**仅管理员可见**：

| 封面状态 | 按钮文案 | 点击后 |
|---|---|---|
| 空（系列未上线） | **AI 生成图片** | 直接生成，成功后**保存到系列**（不预览） |
| 空（系列已上线，数据异常） | **AI 生成图片** | 生成后**只出预览**，确认后由「保存发布设置」落库 |
| 有 | **重新生成** | 先弹确认（覆盖 + 约 0.1 元/张）→ 生成 → **只出预览** |

按钮下方按状态给一行小字提示：

- 可用（空封面、未上线）：「按系列名和最近一份草稿的食材生成，约 20–40 秒；生成后自动保存到系列。」
- 可用（空封面、已上线）：「按系列名和最近一份草稿的食材生成，约 20–40 秒；生成后先看预览。」
- 可用（有封面）：「重新生成会先出预览，点『用这张』才替换。」
- AI 未配置：「AI 自动封面未启用：到「AI 设置」添加 purpose=RECIPE_COVER_IMAGE、provider=ZHIPU 并启用。」
- 系列名还是临时名 / 还没保存：「先把系列名称改成正式名称（离开输入框自动保存），再生成封面。」
- 不是管理员：不显示按钮，也不显示这些提示（手动上传区域保持现状）。

### 5.2 首次生成（封面为空、系列未上线）

```
点「AI 生成图片」
  → 封面框遮罩「AI 正在生成封面…」+ 按钮转圈
  → 成功：封面出现，提示「AI 封面已生成并保存」
        按钮变成「重新生成」
        自动刷新一次发布检查（缺封面的阻断项消失，发布按钮变可用）
  → 失败：遮罩消失，封面仍为空，下方红字原因 + 「重试」
```

- **不弹预览**：空封面没有任何东西可丢；不满意可以「重新生成」或「移除封面」。
- 保存只写系列 `coverImageUrl`；不写 `Recipe` 行，不推线上。
- **已上线系列例外**：即使封面为空也走 5.3 的预览 + 保存，不直接落库 —— 已上线系列的门面必须经过「保存发布设置」才会同步线上，直接落库会让保存按钮不变脏、没有入口把新封面推上去。

### 5.3 重新生成（已有封面）

```
点「重新生成」
  → 确认框：「重新生成需要再调用一次 AI（约 0.1 元/张）。生成后先看预览，
     点『用这张』才会替换当前封面。继续？」
  → 继续：封面框遮罩「AI 正在生成封面…」，旧封面保持可见
  → 成功：封面下方出现预览卡（16:9 小图）+「用这张」「不要」
         + 「点『用这张』后，还要点『保存发布设置』才会生效」
  → 「不要」：预览消失，原封面不变，没有任何写库
  → 「用这张」：预览图替换抽屉里的封面（表单变脏），提示
         「封面已替换，记得点『保存发布设置』」
```

- 「用这张」**只改抽屉里的值**；落库 / 线上同步交给既有的「保存发布设置」（它本来就会 `applyToLive=true`）。
- 不点保存就关掉抽屉：系列里仍是旧封面（预览图会留在 COS，成为孤儿文件，见第 11 节）。

### 5.4 失败 / 超时 / 未配置

| 情况 | 界面 | 行为 |
|---|---|---|
| AI 未配置 | 按钮置灰 + 配置指引 | 不请求；手动上传照旧 |
| 系列名是临时名 / 未保存 | 按钮置灰 + 改名提示 | 不请求；改名保存后立即恢复可用 |
| 生成中 | 封面框遮罩 + 按钮转圈 | 禁用封面上传 / 移除 / 再次生成；**其它表单项、保存、发布按钮照常**（发布仍受缺封面门槛限制） |
| 生成失败（智谱报错 / 下载失败 / COS 失败） | 封面下方一行红字：「AI 生成失败：<后端原因>」+「重试」 | 原封面不动；不自动重试 |
| 前端 120 秒超时 | 红字「生成超时（120 秒），请点重试」+「重试」 | 原封面不动；服务端可能稍后才完成（首生成会落库），下次打开可见 |
| 关闭抽屉时还在生成 | 不提示 | 请求继续跑；回来只按当前 `seriesId` 应用结果，不串到别的系列 |

### 5.5 与保存 / 发布的关系

- 抽屉仍然只有两个出口：「保存发布设置」（门面立即对已上线阶段生效）和「发布 / 更新 N 个阶段」。
- 首生成保存到系列后，抽屉会重新拉一次发布检查：缺封面的阻断项消失；「保存发布设置」按钮保持禁用（因为表单和服务器一致，没有未保存修改）。
- 重新生成 + 「用这张」后，表单变脏，「保存发布设置」按钮变可用；点它才落库、才推线上。
- **AI 的任何一个动作都不会自己点这个保存按钮。**

### 5.6 线框（只画封面这一项）

```
发布设置
┌───────────────────────────────────────────────────────────────┐
│ 封面图 *                                                       │
│  ┌────────────────┐   [ AI 生成图片 ]  [ 移除封面 ]           │
│  │                │   按系列名和最近一份草稿的食材生成，        │
│  │   封面预览      │   约 20–40 秒；生成后自动保存到系列。      │
│  │   （16:9）      │   建议 16:9 横图，JPG / PNG / WebP ≤5MB。  │
│  └────────────────┘                                           │
│                                                               │
│  （生成中）┌────────────────┐                                  │
│           │ AI 正在生成封面… │                                  │
│           └────────────────┘                                  │
│                                                               │
│  （预览）┌──────────────┐  [ 用这张 ]  [ 不要 ]                │
│          │  新封面 16:9  │  点「用这张」后，还要点              │
│          └──────────────┘  「保存发布设置」才会生效。           │
│                                                               │
│  （失败）AI 生成失败：生图超时（90 秒没返回），请重试。 [ 重试 ] │
└───────────────────────────────────────────────────────────────┘
```

## 6. 后端设计

### 6.1 接口

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| POST | `/api/v1/admin/recipe-series/:seriesId/ai-cover` | `AuthGuard + AdminGuard` | 生成系列封面；可只预览，也可生成后直接存系列 |

请求体：

```json
{ "save": true }
```

- `save` 可选，默认 `false`（只返回 URL、不写库；与单食谱接口的语义一致）。
- 只有「封面为空 **且系列未上线**」的首生成传 `true`；其余情况（已有封面、已上线系列）都不传。
- `save` 是**请求**不是保证：后端发现系列已上线时，即使收到 `true` 也不写库，返回 `saved=false`，前端自然走预览。以响应里的 `saved` 为准。
- 忽略任何其它字段（不接收 `coverImageUrl`、`prompt` 等外部输入，提示词只由服务端拼）。

响应 `data`：

```json
{
  "url": "https://<cos>/recipes/covers/....jpg",
  "provider": "ZHIPU",
  "model": "glm-image",
  "saved": true,
  "foodNames": ["三文鱼", "南瓜", "糙米"]
}
```

- `foodNames` 是实际喂给提示词的食材（最多 5 个），便于运营/客服排查「图为什么像这个」。
- `url` 一定是 COS 地址（转存之后），不是智谱临时链接。

### 6.2 位置与依赖

- **新控制器** `backend/src/interfaces/controllers/admin-recipe-series-cover.controller.ts`
  - `@Controller('api/v1/admin/recipe-series')` + 类级 `@UseGuards(AuthGuard, AdminGuard)`；
  - 理由：不往 5000 行的 `AdminController` 里塞；也避免改它的构造函数（现有 18 处测试按位置 new）。
- **新应用服务** `backend/src/application/recipe-designer/series-cover-image.service.ts`
  - 依赖 `PrismaService`、`RecipeCoverImageService`；
  - 负责：系列校验、草稿食材查询、调用生图、按 `save` 决定是否写系列。
- 两者都在 `app.module.ts` 注册。
- 复用：`RecipeCoverImageService`、`ImageOptimizationService`、`TencentCosService`、`AgentProviderConfigService`、`zhipu-image`。

### 6.3 校验顺序（后端必须独立兜底，不能只靠按钮置灰）

1. 系列存在、`status=ACTIVE`、`deletedAt=null` → 否则 404「食谱系列不存在」。
2. `designMode=CATALOG` → 否则 400「订单定制系列不支持 AI 封面生成」。
3. 系列名非空、且不以「未命名」开头 → 否则 400「系列名称还是临时名称，先改成正式名称再生成封面」。
4. `RecipeCoverImageService.isAvailable()` → false 则 400「AI 生图还没配置：请到后台「AI 设置」里添加 purpose=RECIPE_COVER_IMAGE、provider=ZHIPU 的一条并启用」。
5. 查食材 → 调生图 → 转存 COS（失败按 `zhipu-image.ts` / `downloadTemporaryImage` 的现有文案抛出）。
6. **写库前**再判一次系列是否已上线（`businessStatus=PUBLIC` 或存在 PUBLIC 食谱行）：已上线则 `save` 强制按 `false` 处理。
7. `save=true` 且系列未上线时再写库（见 6.5）；写库失败返回 400/500，不吞错。

### 6.4 提示词素材：系列名 + 最近一份「有原料」的草稿

- **系列名**：取数据库里的 `RecipeSeries.name`（就是抽屉里保存后的最终名字），`trim()` 后使用。
- **食材名**：
  - 查该系列的 `DesignRecipe`，按 `updatedAt desc` 取最近 20 份，连同 `items` 一起取；
  - 从第一份「能取到可用食材名」的草稿里取名字，最多 5 个、去重、按 `sortOrder`；
  - 优先 `ingredient.name`；没有关联原料时退回 `nutritionFood.name`；
  - 排除 `ingredient.type = SUPPLEMENT`（补剂不是这道菜的组成部分）；
  - 一份都没有 → `foodNames: []`，**只用系列名生成，不阻断**。
- **不传生命阶段**：`generate()` 的 `lifeStageLabels` 留空（老板口径：系列封面是整条产品线的门面，不属于某个阶段）。

### 6.5 保存语义

`save=true` 时只做一件事：

```ts
prisma.recipeSeries.update({
  where: { id: seriesId },
  data: { coverImageUrl: result.url },
});
```

- **不碰** `Recipe` 行、不碰 `coverTitle` / `sellingPoint` / `targetHealthTags`、不碰角标表、不碰 `businessStatus`。
- **不传** `applyToLive`（那是「保存发布设置」和 `releaseSeries` 的事）。
- `save=false` 时一次写库都不做；返回的 URL 只用于前端预览。
- `save` 由前端按「封面为空 + 系列未上线」决定；后端**同时兜底**：系列已上线就强制不落库（第 6.3 节第 6 步），响应里 `saved=false`。
- 「是否已上线」在**写库前**再判一次（不是生成前）：生图要 20–40 秒，这期间另一个标签页可能刚好发布了这条系列。
- 这样即使前端状态过期（例如另一个标签页刚发布了这条系列），也不会出现「系列有了新封面、线上还是旧封面、保存按钮又不变脏」的死角。

### 6.6 生图与转存（复用 + 一个小扩展）

`RecipeCoverImageService.generate()` 新增可选入参：

```ts
layout?: 'SQUARE' | 'COVER_16_9' // 默认 SQUARE，旧调用零变化
```

| layout | 智谱 size | 后续处理 | COS 目录 |
|---|---|---|---|
| `SQUARE`（默认，旧入口） | `1280x1280` | 原样上传（与现在完全一致） | `recipes/covers` |
| `COVER_16_9`（本期） | `1728x960` | `optimizeForUpload(buffer, 'recipe-cover')` → 750×422、≤160KB JPEG | `recipes/covers` |

- 注入 `ImageOptimizationService`（只依赖 `sharp`，无循环依赖）。
- 仍然走「① 智谱拿临时链接 → ② 立刻下载 Buffer → ③ 传 COS」三步；**第 ②③ 步不能省**（临时链接 30 天失效）。
- 不做精确 16:9 的自定义尺寸（不赌接口行为）；`1728x960 → 750×422` 的裁切由 `fit: 'cover'` 自动完成，只裁掉约 1% 宽度。

## 7. 前端设计

### 7.1 涉及文件

| 文件 | 改动 |
|---|---|
| `admin-web/src/api/recipeDesigner.ts` | 新增 `generateSeriesAiCover(seriesId, { save })`，请求超时 **120000ms** + `timeoutErrorMessage`（超时时全局提示也是中文，不是 `timeout of 120000ms exceeded`） |
| `admin-web/src/types/recipeDesigner.ts` | 新增 `SeriesAiCoverResult` |
| `admin-web/src/utils/recipeDesigner/seriesAiCover.ts`（新） | 纯函数：按钮文案、可用性、不可用原因、请求参数、成功文案 |
| `admin-web/src/utils/recipeDesigner/__tests__/seriesAiCover.spec.ts`（新） | 纯函数单测 |
| `admin-web/src/views/RecipeDesigner/seriesAiCover.regression.spec.ts`（新） | 源码契约：路径 / 120s / 按钮文案 / 预览与确认 / 管理员可见性 |
| `admin-web/src/views/RecipeDesigner/components/SeriesReleaseDrawer.vue` | 接入按钮、生成中状态、预览、错误、重试；保存后刷新检查；临时名判定改用现有的 `isTemporarySeriesName`（现在是手写 `startsWith`） |

### 7.2 组件状态

```ts
const aiCoverAvailability = ref<boolean | null>(null); // null = 还没查 / 查失败
const aiCoverGenerating = ref(false);
const aiCoverPreviewUrl = ref('');
const aiCoverError = ref('');
/** 已成功写库的系列名；改名保存后由 AiNameField 的 saved 事件更新 */
const savedSeriesName = ref(String(props.seriesName ?? '').trim());
let aiCoverRequestSeq = 0;
```

- `isAdmin` 复用现有 `useIsAdmin()`；非管理员不渲染按钮、不查可用性。
- 打开抽屉且是管理员时查一次 `recipeApi.getAiCoverAvailability()`；查失败按不可用处理，不弹错。
- **不**放在 `loadReadiness` 里自动调用生成；打开抽屉只查可用性。
- 离开抽屉 / 切换系列时把 `aiCoverPreviewUrl`、`aiCoverError`、`aiCoverGenerating` 复位，并用序号丢弃过期响应。

### 7.3 生成流程（伪代码）

```
async handleGenerateAiCover():
  if (!canGenerate) return
  hasCover = !!form.coverImageUrl.trim()
  isLive = readiness.releaseState !== 'UNPUBLISHED'  // 已上线过（含待更新）
  save = !hasCover && !isLive
  if (hasCover): await ElMessageBox.confirm(覆盖确认) // 取消则 return
  aiCoverGenerating = true; aiCoverError = ''
  seq = ++aiCoverRequestSeq
  try:
    result = await recipeDesignerApi.generateSeriesAiCover(seriesId, { save })
    if (seq !== aiCoverRequestSeq || seriesId 变了) return
    if (result.saved):                       // 空封面首生成
      form.coverImageUrl = result.url
      baseline.coverImageUrl = result.url     // 不是「未保存修改」
      ElMessage.success('AI 封面已生成并保存')
      void loadReadiness(false)               // 刷新缺封面阻断项，不覆盖其它编辑
    else:                                    // 重新生成
      aiCoverPreviewUrl = result.url
      ElMessage.success('已生成预览，确认后才会替换')
  catch (error):
    if (seq !== aiCoverRequestSeq) return
    aiCoverError = 是超时 ? '生成超时（120 秒），请点重试'
                         : `AI 生成失败：${error.message}`
  finally:
    if (seq === aiCoverRequestSeq) aiCoverGenerating = false
```

- `save` 由「点按钮时封面是否为空 + 系列是否已上线」决定，**不是**由 AI 返回后决定。
- 「用这张」：`form.coverImageUrl = aiCoverPreviewUrl`；清空预览；提示「封面已替换，记得点『保存发布设置』」。
- 「重试」：重新走 `handleGenerateAiCover`（会再次计数、再次确认；不自动循环）。
- 生成中禁用：封面上传、移除封面、生成按钮；其它表单与保存 / 发布按钮保持现状。
- 反过来：上传中、保存中、发布中时，生成按钮也禁用（避免两个写封面的动作打架）。
- 首生成保存成功后，如果紧跟着的刷新检查失败：会走现有的「系列发布检查加载失败」面板（带「重试」）；**封面已经保存**，点重试即可恢复，不需要重新生成。

### 7.4 错误提示的显示口径

- 全局 axios 拦截器已经会弹一次后端原因（`__apiErrorToasted`）；抽屉里**不再重复弹**，只在封面下方写同一句红字，便于回看。
- 超时：请求配置带 `timeoutErrorMessage: '生成超时（120 秒），请点重试'`，全局提示和内联红字都用这句中文。
- 其它错误：内联红字用 `getApiErrorMessage(error, 'AI 生成失败')`，拿不到具体原因时退回「AI 生成失败，请点重试」。

### 7.5 页面文案（可直接抄）

- 按钮：`AI 生成图片` / `重新生成` / `生成中…`
- 空封面提示：`按系列名和最近一份草稿的食材生成，约 20–40 秒；生成后自动保存到系列。`
- 有封面提示：`重新生成会先出预览，点「用这张」才替换。`
- 覆盖确认：`重新生成需要再调用一次 AI（约 0.1 元/张）。生成后先看预览，点「用这张」才会替换当前封面。继续？`
- 未配置：`AI 自动封面未启用：到「AI 设置」添加 purpose=RECIPE_COVER_IMAGE、provider=ZHIPU 并启用。`
- 临时名：`先把系列名称改成正式名称（离开输入框自动保存），再生成封面。`
- 生成中：`AI 正在生成封面…（约 20–40 秒）`
- 成功（首生成）：`AI 封面已生成并保存`
- 成功（预览）：`已生成预览，确认后才会替换`
- 超时：`生成超时（120 秒），请点重试`
- 失败：`AI 生成失败：${原因}`
- 预览确认：`用这张` / `不要`；提示 `点「用这张」后，还要点「保存发布设置」才会生效。`

### 7.6 不改的部分

- 手动上传仍然只走 `recipeApi.uploadImage`（≤5MB、JPG/PNG/WebP），不提供外链输入。
- 「保存发布设置」的 patch 逻辑、角标保存、发布 / 更新 / 下架按钮与确认框不动。
- 顾客预览、检查结果、阶段勾选不动。
- 旧「编辑食谱」页的 AI 封面不动。

## 8. 数据

- 不新增表、不新增列、不做 migration。
- 只写 `RecipeSeries.coverImageUrl`（已有字段，`String?`）。
- `Recipe.coverImageUrl` 只在「保存发布设置」或「发布 / 更新」时按上一期的门面规则同步。
- 角标仍是独立表 `recipe_series_cover_badge`，本期不碰。

## 9. 测试计划

### 9.1 后端

- 新增 `backend/tests/application/recipe-designer/series-cover-image.service.spec.ts`
  - 系列不存在 / 已删除 / 非 ACTIVE → 404；
  - `designMode=ORDER` → 400；
  - 临时名 → 400；
  - AI 未配置 → 400，且不调 `generate`；
  - 食材：取最近一份「有可用食材」的草稿；排除补剂；去重；最多 5 个；优先 `ingredient.name`，退回 `nutritionFood.name`；
  - 没有带食材的草稿 → `foodNames=[]`，仍然生成；
  - `generate` 被调用时 `layout='COVER_16_9'` 且没有 `lifeStageLabels`；
  - `save=true`（未上线系列）→ 只 `recipeSeries.update({ coverImageUrl })`，**不调** `recipe.updateMany`；
  - `save=true`（已上线系列）→ **不写库**，返回 `saved=false`；
  - `save=false` → 不写库；
  - 生图失败 → 原样抛出，不写库。
- 新增 `backend/tests/application/recipe-designer/recipe-cover-image.service.spec.ts`
  - 默认（SQUARE）：size=`1280x1280`、直接上传原始 Buffer（旧行为不变）；
  - `COVER_16_9`：size=`1728x960`、调 `optimizeForUpload(...,'recipe-cover')`、上传压缩后的 Buffer、目录 `recipes/covers`；
  - 智谱报错 / 下载失败 / 空图 → 现有文案不回归。
- 新增 `backend/tests/interfaces/controllers/admin-recipe-series-cover.controller.spec.ts`
  - 返回 `ApiResponseDto.success` 包封；
  - `save` 默认 false、显式 true 透传；
  - 服务抛错时不被吞。
- 回归：`npm test` 全量通过。

### 9.2 admin-web

- 新增 `src/utils/recipeDesigner/__tests__/seriesAiCover.spec.ts`：按钮文案、可用性矩阵（管理员 / 可用 / 生成中 / 临时名）、`save` 参数（空封面、未上线、已上线、已有封面的四组合）、成功文案。
- 新增 `src/views/RecipeDesigner/seriesAiCover.regression.spec.ts`（沿用仓库的源码契约写法）：
  - API 路径 `'/admin/recipe-series/${seriesId}/ai-cover'`、超时 `120000`；
  - 按钮文案「AI 生成图片」「重新生成」「用这张」「不要」；
  - 只有管理员渲染按钮；
  - 生成中不禁用保存 / 发布按钮；
  - 代码里**没有**在打开抽屉时自动调用生成接口（防止以后有人「顺手优化」回去）。
- 回归：`npx vitest run` 全量通过。

### 9.3 不测的部分

- 小程序（本期 0 改动）。
- 真实智谱调用（花钱、不可重复）；用手工验收代替：上线后由管理员在一条测试系列上点一次。

## 10. 验收场景

1. 新建一条未上线产品线，名字已定、封面为空 → 打开抽屉：封面旁有「AI 生成图片」；点击后封面框显示生成中，20–40 秒后出现封面并提示已保存；关掉再打开，封面还在（已存系列）。
2. 名字还是「未命名系列 · 10-27 11:00」→ 按钮置灰并提示先改名；改名（离开输入框）后按钮立即可用。
3. AI 未配置 → 按钮置灰 + 配置指引；手动上传仍然可用。
4. 已上线系列即使封面为空 → 点「AI 生成图片」也只出预览，不直接落库（保存按钮仍要能变脏）。
5. 已有封面 → 点「重新生成」→ 弹确认（覆盖 + 约 0.1 元）→ 生成 → 预览 → 点「不要」：原封面不变、数据库不变；再点「重新生成」→「用这张」：抽屉里的封面变成新图并提示保存；不点保存直接关掉，重开还是旧封面。
6. 已上线系列 → 「用这张」后点「保存发布设置」→ 顾客侧下次打开看到新封面；配方版本号、营养数据、阶段版本都不变。
7. 生成失败 / 120 秒超时 → 原封面不变，红字原因 + 「重试」；不会自动重试。
8. 生成中抽屉其它字段可编辑、可保存；生成期间封面上传 / 移除 / 再次生成按钮禁用。
9. 生成过程中关掉抽屉再打开 → 不报错；如果服务端已经保存（首生成），打开后能看到新封面。
10. 数据库无新字段；`coverImageUrl` 是 COS 域名，不是 `open.bigmodel.cn` 的临时链接。
11. 旧「编辑食谱」页的单食谱 AI 封面：仍然方图、仍然只预览不保存，行为不变。
12. 角标不受影响：AI 图里没有文字 / 角标；角标仍由前端叠加，保存 / 发布流程不变。
13. 小程序无代码改动，封面仍从系列（发布后写到 `Recipe`）读取。

## 11. 已知问题（本期不做，记录在案）

1. **旧图不回收**：每次重新生成都会在 COS 留一张没有被引用的 JPEG；没有引用计数 / 定时清理，成本可忽略但文件会累积。
2. **多标签页并发**：两个管理员同时在两个标签页点生成，会各花一次钱；按钮防连点只作用于当前页面。
3. **AI 图不保证和配方严格一致**：它按「系列名 + 食材名」画一张看起来像这道菜的照片，不读克数、营养、工艺；运营要用预览 / 重新生成把关。
4. **前端超时与服务端完成不同步**：120 秒超时后服务端可能仍在跑；首生成若最终成功，会在下次打开时看到，但本次界面显示失败。
5. **改名的显示同步（既有问题）**：列表页打开抽屉后，如果在抽屉里改名，父组件的 `seriesName` prop 不会刷新；本期用抽屉内「已保存的系列名」本地状态规避，不改父组件（后续做名称模块时统一处理）。
6. **旧「编辑食谱」页与设计器并存**：单食谱 AI 封面仍走方图；等旧页退休再统一。

## 12. 我的决定（builder 不必再问，老板可推翻）

1. 新建独立控制器 + 独立应用服务，不动 `AdminController` 的构造函数（避免 18 处按位置构造的测试改动）。
2. 请求体 `{ save?: boolean }`，默认 `false`（只预览）；只有「空封面 + 未上线系列」的首生成传 `true`。
3. 尺寸用 `1728x960`（智谱官方推荐档位），不赌自定义精确 16:9；压缩统一走 `recipe-cover` 预设。
4. 食材取「最近 20 份草稿里第一份有可用食材的」，最多 5 个、去重、排除补剂；没有就只用系列名。
5. 生图服务新增 `layout` 可选参数，默认 `SQUARE`，旧入口零变化。
6. 生成中禁用封面上传 / 移除 / 再次生成；上传中 / 保存中 / 发布中也禁用生成。其余字段与保存 / 发布按钮不阻断。
7. 生成结果按 `seriesId` + 请求序号应用；关抽屉不取消请求。
8. 首生成成功后刷新一次发布检查，让「缺封面」阻断项立即消失。
9. 不清理 COS 旧图，列入已知问题。
10. 不改小程序、不改角标、不改发布 / 更新主流程。

## 13. 开放问题

无。老板 2026-10-27 已确认「首次生成也要管理员手动点按钮」，其余 A–E 无异议。

## 14. 留给 builder 的自由度

- 按钮的具体样式（`size="small"` + `plain` / `primary`）与图标。
- 预览卡的排版（封面下方一行还是右侧一列）。
- 后端草稿食材查询的 `take` 数量（20 是上限保护，可按测试调整）。
- 测试的组织方式（领域纯函数 + 服务单测 + 控制器单测 + 前端纯函数 + 源码契约）。
- 控制器 / 服务文件的具体命名（建议见 6.2，可改，但路径必须保持 `/admin/recipe-series/:id/ai-cover`）。

## 16. 补充（2026-10-27 晚上）：智谱配置入口

上线后在真实后台核对发现：生产环境**从来没有** `provider=ZHIPU / purpose=RECIPE_COVER_IMAGE` 这一行配置，而原「AI / Agent 配置」只支持 DeepSeek（provider 写死），无法补这一行 —— 旧的「编辑食谱」页 AI 封面也因此一直是灰的。这不是本期代码的回归，是 2026-10-18 生图功能留下的配置缺口。

因此补一个只给管理员用的配置入口（老板 2026-10-27 要求「入口做好，我自己填 Key」）：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/admin/nutrition-governance/agent-providers/zhipu-image` | 读取（只回 Key 末四位） |
| PUT | 同上 | 保存 enabled / baseUrl / model / apiKey / clearApiKey |
| POST | 同上 `/test` | 连接测试：只 ping `glm-4-flash` 文本模型，**不生成图片、不花 0.1 元** |

规则：

- Key 沿用 `agent_provider_config` 的 AES-256-GCM 加密存储，接口只回 `apiKeyLast4`，永不回明文；
- 启用（enabled=true）前必须有 Key，后端 400；
- 后台「AI / Agent 配置」新增「智谱封面图」卡片（启用 / Base URL / glm-image / API Key / 保存 / 连接测试 / 清除 Key），并提示 Key 在 bigmodel.cn 创建；
- DeepSeek 用途表不再显示 `RECIPE_COVER_IMAGE`（那一行是文本配置，不会生图），避免点错配置抽屉；
- 配好并启用后，`RecipeCoverImageService.isAvailable()` 返回 true，「发布 / 更新」抽屉的「AI 生成图片」变亮（重新打开抽屉即可）。

验证：后端新增 9 项配置服务测试 + 4 项路由契约测试；admin-web 新增 3 项纯函数测试 + 4 项入口契约测试；全量测试与构建通过。
