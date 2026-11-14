# 补剂建档「落地配置」集中化 · 实施计划

> **For agentic workers:** 本计划按任务逐步执行，每个任务自带验收。执行时用复选框跟踪。

**Goal:** 把「商城上架、等价组、DIY 推荐、生产采购」四类配置收进补剂建档的最后一步，创建完当场给出「能不能被买、能不能被替换」的结论；再用 AI 预填能查证的字段。

**Architecture:** 不新建平行接口。第 4 步是**前端编排层**——按固定顺序调用三个已有域（补剂商品目录、原料档案、等价组），复用后端已有的「数据体检」与「上架回滚」规则。后端只在 P2 增加「抓图 / 拆品牌规格 / 推荐组」三件事。

**Tech Stack:** NestJS + Prisma（后端）、Vue 3 + Element Plus + vitest（admin-web）。

**Spec:** `docs/superpowers/specs/2026-11-14-supplement-launch-config-design.md`（下称「方案」）

**执行状态：未开始。**

## Global Constraints

- **不给补剂加 SKU 层**。补剂是单层产品，价格/采购单位/换算/渠道全在 `Ingredient` 上（方案 §1.2）。
- **不给上架加图片要求**。图片是 DIY 专属、非必填（方案 §1.2）。
- **不新写一套判定规则**。上架能否点、能不能买，一律用后端 `issues`（`GET /admin/supplement-shop/catalog` 返回）作为唯一依据。
- **上架校验以后端为准**。`PATCH catalog/:id` 已有「先落库再体检，有 ERROR 就回滚开关」的逻辑，前端不重复实现（只做即时提示）。
- **`properties` 是整体替换**。原料更新接口收到 `properties` 就整块替换，不是深合并；保存 DIY 段时必须**先取回整份 properties，合并后再提交**，否则会清掉 `add_timing` / `production_loss_rate` / 标签三项。
- **第 4 步不阻断写入**。它只在「核验并写入」成功后展开；没写成功就没有 `ingredientId`。
- **AI 建议不得静默写库**：每个 AI 值都要标「AI 建议」，可一键采用或撤销。
- 四段都必须「明确表态」，不接受沉默的默认值。

## Review Focus

1. 保存 DIY 段后，`add_timing` / `production_loss_rate` / `labels` 是否还在（properties 被整块覆盖）。
2. 上架被后端拒绝（返回 400 + issues）时，前端开关是否**回滚**到关闭，且把原因显示出来。
3. 归组到「草稿组 / 单成员组」时，是否明确提示「已归组但不参与替换」。
4. 已上架的补剂再进第 4 步，会不会被默认值误改（例如把 `procurementEnabled` 从 false 改成 true）。
5. AI 建议撤销后，字段是否回到**建议前**的值（不是清空）。

---

# Phase P1 · 集中 + 体检 + 预览（不做 AI）

**目标：** 建档一条龙。全部复用现有接口，后端零改动。

### Task 1: 落地配置的纯逻辑模块

**Files:**
- Create: `admin-web/src/views/Ingredients/ai-agent/supplement/launchConfigState.ts`
- Test: `admin-web/src/views/Ingredients/ai-agent/supplement/launchConfigState.spec.ts`

**Interfaces:**
- Produces:
  - `type LaunchLevel = 'READY' | 'WARN' | 'BLOCKED'`
  - `interface LaunchDecision { diy: boolean | null; procurement: boolean | null; retail: boolean | null; group: string | null; noSaleReason: string | null }`
  - `interface LaunchIssueLike { level: string; code: string; message: string }`
  - `function missingDecisions(d: LaunchDecision): string[]` —— 返回没表态的段（中文名）
  - `function evaluateLaunch(input: { retailEnabled: boolean; issues: LaunchIssueLike[]; hasPurchaseLink: boolean; diyEnabled: boolean; groupStatus: string | null; groupMembers: number }): { level: LaunchLevel; reasons: string[] }`
  - `function describeSheetPreview(input: { retailEnabled: boolean; hasError: boolean; hasPurchaseLink: boolean; candidateCount: number }): string`

**判定口径（写死，测试要覆盖）:**
- 未上架 → `BLOCKED`，理由「未上架：制作单里会显示仅生产」。
- 已上架 + 有 ERROR → `BLOCKED`（理论上后端不会允许，防御性）。
- 已上架 + 无 ERROR + 无购买链接 → `WARN`，理由「详情里没有『去购买』」。
- 已上架 + 组为空/草稿/单成员 → `WARN`，理由「缺货时无法替换」。
- 其余 → `READY`。

**Steps（TDD）:**
- [ ] 1.1 先写测试：未表态 / 未上架 / 缺链接 / 草稿组 / 全部就绪，5 组断言。
- [ ] 1.2 运行测试确认红（模块不存在）。
- [ ] 1.3 实现最小函数体。
- [ ] 1.4 运行 `npx vitest run src/views/Ingredients/ai-agent/supplement/launchConfigState.spec.ts` 全绿。

**Verify:** 测试文件覆盖 `missingDecisions` 与 `evaluateLaunch` 的 5 种组合，`describeSheetPreview` 至少 3 种文案。

### Task 2: 可复用的「商品档案」面板

**Files:**
- Create: `admin-web/src/views/Ingredients/ai-agent/supplement/SupplementArchivePanel.vue`
- Test: 无（纯渲染，靠 Task 1 的逻辑 + 手测）

**Interfaces:**
- Props: `row`（`SupplementCatalogItem`）、`saving: boolean`
- Emits: `save(patch: UpdateSupplementCatalogItemDto)`

**说明:**
- 表单字段与上架清单**完全一致**：物理形态、原厂保质期、储存条件、内容物油性、上架开关。
- 上架开关的可用性直接调 `canToggleListing` / `showListingBlockedHint`（复用 2026-11-14 已合并的 `catalog-listing.ts`）。
- 字段旁显示后端建议值（`suggestedShelfLifeMonths` / `suggestedPhysicalForm` / `suggestedOilBased`），点一下即采用。
- 顶部显示该行的 `issues`（红/黄标签 + 悬浮原因）。

**Steps:**
- [ ] 2.1 先把 `Catalog.vue` 中「物理形态 / 保质期 / 储存 / 油性 / 上架」五段模板与保存逻辑抽成本组件。
- [ ] 2.2 `Catalog.vue` 改为使用该组件（保证两处行为一致，不复制第二套）。
- [ ] 2.3 手测：上架清单原有功能不变；新组件在缺少 `issues` 时不崩。

**Verify:** `Catalog.vue` 里不再有重复的五个控件；`npm run build` 通过。

### Task 3: 工作台第 4 步骨架

**Files:**
- Modify: `admin-web/src/views/Ingredients/ai-agent/supplement/SupplementWorkbench.vue`
- Create: `admin-web/src/views/Ingredients/ai-agent/supplement/LaunchConfigStep.vue`

**Interfaces:**
- Props: `ingredientId: string`
- 内部：加载 `GET /admin/supplement-shop/catalog` → 取本行；加载原料详情；加载等价组列表。

**说明:**
- 只在 `saved` 存在时渲染，标题「第 4 步 · 落地配置」，四段折叠（默认全展开）。
- 顶部固定一条「承诺条」：四段都表态后才能点「完成」。

**Steps:**
- [ ] 3.1 建立组件骨架与四段占位。
- [ ] 3.2 接入数据加载（catalog 行 + 原料详情 + 组列表），失败时显示重试而不是空白。
- [ ] 3.3 手测：写入前后第 4 步的显示/隐藏正确。

**Verify:** 写入成功后出现四段；刷新页面后仍按 `ingredientId` 恢复。

### Task 4: DIY 段 + 生产采购段（含 properties 合并）

**Files:**
- Modify: `LaunchConfigStep.vue`
- Create: `admin-web/src/views/Ingredients/ai-agent/supplement/mergeIngredientProperties.ts`
- Test: `.../mergeIngredientProperties.spec.ts`

**Interfaces:**
- `function mergeIngredientProperties(existing: Record<string, unknown> | null, patch: Record<string, unknown>): Record<string, unknown>`

**说明:**
- 保存时提交 `{ diyEnabled, procurementEnabled, properties: merge(existing, { purchase_link, image_url }) }`。
- **禁止**只传 `properties: { image_url }`（会把 `add_timing` 等整块清掉）。
- DIY 关闭时链接/图片字段隐藏但**不清空**（保留历史值）。

**Steps（TDD）:**
- [ ] 4.1 先写合并函数测试：保留 `add_timing` / `production_loss_rate` / `labels`；新增 `image_url`；`purchase_link` 传 null 时删除该键而不是保留旧值。
- [ ] 4.2 跑测试看红 → 实现 → 全绿。
- [ ] 4.3 接入两个段的表单与保存。
- [ ] 4.4 手测：保存后重新打开，`add_timing` 仍在。

**Verify:** 单测覆盖三种合并情况；手测记录在 PR 描述里。

### Task 5: 等价组段

**Files:**
- Modify: `LaunchConfigStep.vue`
- 复用: `admin-web/src/api/supplementEquivalence.ts`

**说明:**
- 列出组时显示：组名、状态（已审核/草稿）、成员数、营养素与单位。
- 已归组时显示当前组与「更换 / 移出」。
- 「暂不归组」需要勾选确认才能保存。
- 归组调用 `assign` 接口；成功后刷新本段状态。
- 加入草稿组/单成员组时，段内固定黄条：「已归组，但组未审核/只有 1 个成员，暂不参与替换」。

**Steps:**
- [ ] 5.1 组列表 + 当前组展示。
- [ ] 5.2 加入/更换/移出三条路径。
- [ ] 5.3 草稿组与单成员组的提示。
- [ ] 5.4 手测：分别加入已审核组、草稿组、暂不归组，观察提示与制作单预览。

**Verify:** 三种情况提示正确；归组后上架清单的「等价组」列同步变化。

### Task 6: 结论卡 + 制作单预览

**Files:**
- Modify: `LaunchConfigStep.vue`（或拆 `LaunchVerdictCard.vue`）
- 复用: Task 1 的 `evaluateLaunch` / `describeSheetPreview`

**说明:**
- 结论卡三档：✅ 能买 / ⚠️ 能买但缺展示 / ❌ 不能买；每个 ❌/⚠️ 后面跟「去补」按钮（滚动到对应段）。
- 制作单预览：一个静态卡片，按 `describeSheetPreview` 显示「仅生产，不可购买」或「查看商品 〉」。
- 保存任意一段后自动重算结论（用 catalog 最新返回的 issues，不自己算）。

**Steps:**
- [ ] 6.1 结论卡渲染与状态映射。
- [ ] 6.2 预览卡片与三种文案。
- [ ] 6.3 「去补」锚点与高亮。

**Verify:** 上架失败时结论卡同步变红并显示后端原因。

### Task 7: P1 回归

- [ ] 7.1 `cd admin-web && npx vitest run`（全量）
- [ ] 7.2 `cd admin-web && npm run build`（含 vue-tsc）
- [ ] 7.3 手测路径：新建补剂 → 第 4 步 → 只开 DIY → 结论卡 ⚠️ → 上架 → 结论卡 ✅ → 制作单预览变化
- [ ] 7.4 回归：上架清单、等价组页面行为不变

---

# Phase P2 · AI 预填

**目标：** 减少手填。原则：AI 只填能查证的，且可撤销。

### Task 8: 商品页抓主图

**Files:**
- Modify: `backend/src/application/ingredient-creation/supplement-link-preview.service.ts`
- Test: `backend/src/application/ingredient-creation/supplement-link-preview.spec.ts`（如不存在则新建）

**Interfaces:**
- `SupplementLinkPreview` 增加 `imageUrl: string | null`

**说明:**
- 从抓回的页面里取 `og:image`，取不到返回 null（不猜）。
- 只允许白名单站点的图片（沿用现有 `ALLOWED_HOSTS`）。
- 前端「产品图片」旁显示「从链接抓取」，抓不到提示手动上传。

**Steps（TDD）:**
- [ ] 8.1 用假 HTML 写解析测试：有 og:image / 无 og:image / 图片域名不在白名单。
- [ ] 8.2 跑红 → 实现 → 全绿。
- [ ] 8.3 真实链接抽测 3 个（iHerb 2 个、淘宝 1 个），把成功率写进文档。

**Verify:** 单测 3 条；真实链接成功率记录在方案 §5.2。

### Task 9: 商品页拆品牌 / 规格

**Files:**
- Modify: 同 Task 8
- 前端：`LaunchConfigStep.vue` 显示 AI 建议

**说明:**
- 从商品标题拆 `brand` 与 `productModel`；拆不出返回 null。
- 只为「AI 建议」，采用后才写入；不覆盖用户已填。

**Steps:**
- [ ] 9.1 测试：`NOW Foods Zinc Picolinate 50 mg 100 Tablets` → brand=`NOW Foods`, model=`100 Tablets`。
- [ ] 9.2 跑红 → 实现 → 全绿。
- [ ] 9.3 前端一键采用 + 撤销。

**Verify:** 用三种标题格式测（品牌前置/后置/无品牌）。

### Task 10: 推荐等价组

**Files:**
- Create: `backend/src/application/supplement-shop/supplement-equivalence-recommend.service.ts`
- Modify: `admin-web/src/api/supplementEquivalence.ts`、`LaunchConfigStep.vue`
- Test: 新建 spec

**Interfaces:**
- `GET /admin/supplement-equivalence/recommend?ingredientId=` → `{ candidates: Array<{ groupId, name, status, memberCount, sameUnit, reason }> }`

**说明:**
- 匹配口径：组 `nutrientKey` 与原料 `nutritionProfile` 中可解析的营养素一致；单位一致时优先。
- 只返回**建议**，不写库；空结果时前端退化为「手动选组 / 暂不归组」。

**Steps（TDD）:**
- [ ] 10.1 测试：碘原料 → 命中 IODINE_NATURAL；单位不一致 → 候选里标注 `sameUnit=false`；无匹配 → 空数组。
- [ ] 10.2 实现 → 全绿 → 前端接入。

**Verify:** 用生产 4 条碘类补剂（海藻粉/海带片/海带粉胶囊/碘钾片）验证推荐结果与人工判断一致。

### Task 11: AI 建议 UI 规范

- [ ] 11.1 所有 AI 产生的值统一显示「AI 建议」标签 + 采用/撤销。
- [ ] 11.2 撤销回到采用前的值（不是清空）。
- [ ] 11.3 测试：撤销逻辑抽成纯函数并单测。

### Task 12: P2 回归

- [ ] 12.1 后台全量测试 + 构建
- [ ] 12.2 真实链接抽测（3 个站点各 1 条）
- [ ] 12.3 成功率与降级路径写回方案文档

---

# Phase P3 · 兜底与增值

### Task 13: 待补清单角标
- [ ] 补剂列表 / 上架清单显示「新建 7 天未上架 / 未归组」数量角标。
- [ ] 点击跳转到筛选后的列表。

### Task 14: 售价预览（可选）
- [ ] 用 `quote-preview` 对单行试算，展示「一份约多少钱」，标注「最终价以下单页为准」。

---

## 风险与回滚

| 风险 | 应对 |
|---|---|
| properties 被整块覆盖（丢 `add_timing`） | Task 4 的合并函数 + 单测；上线前人工验一条 |
| 第 4 步让建档变慢 | 四段默认展开但可折叠；只对「新建」出现，编辑走原页面 |
| 上架被后端拒绝后前端状态不一致 | 以 PATCH 返回的 item 为准刷新整行（现有 `save()` 已这么做，复用） |
| 抓图成功率低造成新的挫败 | P2 只上 iHerb；其他站点保留手动上传并明说 |
| 组推荐误导（剂型/单位不一致） | 只推荐不自动加；提示必须写清「单位不一致，加入也不参与替换」 |

## 验收清单

- [ ] 新建补剂后，第 4 步能一次看到并修改四类配置。
- [ ] 四个开关都有显式值，没有「看不见的默认」。
- [ ] 缺保质期时上架开关被禁用并给出原因；补上后可上架。
- [ ] 「暂不归组」可保存，结论卡提示「缺货无法替换」。
- [ ] 加入草稿组时提示「已归组但不参与替换」。
- [ ] 保存 DIY 段后 `add_timing` / `production_loss_rate` / 标签不丢。
- [ ] 结论卡与上架清单、制作单预览三处口径一致。
- [ ] 后台全量测试与构建通过。
- [ ] 不新增 SKU 层、不新增图片要求（Review 时逐条对照方案 §1.2）。

---

## 执行记录

### P1 · 集中 + 体检 + 预览（2026-11-14）

**已完成：** Task 1 / 3 / 4 / 5 / 6 / 7。

**调整（Task 2）：** 原计划让上架清单改用新面板组件。实际执行时发现两者布局不同
（列表是表格单元格、第 4 步是表单），把表格单元格塞进表单组件会给现网页面引入回归风险。
改为：**复用规则、不共用布局**——
- `admin-web/src/views/SupplementShop/catalog-listing.ts` 的 `canToggleListing` / `showListingBlockedHint`
  同时被上架清单与新面板使用（同一份判定）；
- 新面板 `SupplementArchivePanel.vue` 只服务第 4 步，字段与接口和上架清单完全一致。

**新增文件：**
- `admin-web/src/views/Ingredients/ai-agent/supplement/launchConfigState.ts`（+ spec，16 条）
- `admin-web/src/views/Ingredients/ai-agent/supplement/mergeIngredientProperties.ts`（+ spec，5 条）
- `admin-web/src/views/Ingredients/ai-agent/supplement/SupplementArchivePanel.vue`
- `admin-web/src/views/Ingredients/ai-agent/supplement/LaunchConfigStep.vue`

**修改文件：**
- `SupplementWorkbench.vue`（写入成功后渲染第 4 步）

**自检：** `npx vitest run` 110 个文件 / 1176 条全过；`npm run build`（含 vue-tsc）通过。

**未覆盖：** 真实浏览器点击验收（需老板或后续审查环节覆盖）。

### P2 · AI 预填（2026-11-14）

**已完成：** Task 8 / 9 / 10 / 11。

**实现说明：**
- **主图**：抓取通道返回的是 markdown（不是 HTML），拿不到 `og:image`。改为从 markdown 图片里取
  「像商品图的」那一张：命中 `images-iherb|cloudinary|product` 才用，logo/icon/banner 一律跳过，
  取不到就返回 `null`（不猜、不拿 banner 凑数）。
- **品牌 / 规格**：从商品标题开头匹配已知品牌；规格取标题里最后一个「数量 + 单位」。
  两者都只作为建议值回显，**不自动写库**。
- **等价组推荐**：新增 `GET /admin/supplement-equivalence/recommend?ingredientId=`，
  判定复用 `resolveConcentration`（与补剂候选同一口径），只推荐不写库；
  排序把「能真正参与替换」的放最前，并给出原因（草稿组 / 单成员 / 单位不一致都写明）。
- **前端**：DIY 段加「从链接抓取」（失败不影响手填）；等价组段显示 AI 推荐 + 一键采用。

**注：** 截图识别（采购商品那套）**不能**产出商品图，只能出文本字段，因此没有接进来；
主图只有两个来源：从链接抓、人工上传。

**自检：**
- 后端新增 3 个测试文件/用例全过；相关域 53 个套件通过。
- `supplement-order.service.spec.ts` 有 8 条失败，已在干净 main 上复现（基线红，非本次引入）。
- `npx tsc --noEmit` 本文件无新增错误（仓库基线本身有 544 行历史类型错误）。
- admin-web：110 个测试文件 / 1176 条全过；`npm run build` 通过。

### P1 复审修复（2026-11-14）

独立审查（只读）提出 2 Critical / 7 Important / 6 Minor，本轮修复如下：

**Critical**
- C1 **布局**：第 4 步原先塞在固定高度 + `overflow:hidden` 的右栏里，会被裁掉、并把档案栏压扁。
  已移到三栏之外、`grid-column: 1 / -1` 占满整行；容器在有第 4 步时改为 `height:auto`，
  三栏各自保留原高度（≤1280px 时全部自动高）。
- C2 **数据安全**：加载失败时 `ingredient` 为 null，点 DIY 保存会用空对象合并、把 `properties` 清空。
  已加 `dataReady`（档案 + 原料详情都到齐）作为三个保存按钮的 disabled 条件，保存函数内再加一道守卫。

**Important**
- I1 四段状态改为按**已落库真实值**回填（不再永远显示 0/4）。
- I2 「不上架原因」现在落库到 `properties.no_sale_reason`（schema 无独立列），选完即保存。
- I3 加入「已审核」的组会二次确认，并提示会把组打回待审核；下拉过滤已停用组、显示营养素。
- I4 结论卡只读后端 `issues`（`EQUIVALENCE_*` WARN），删除前端自判组是否生效的第二套规则。
- I5 结论卡用**已保存**的链接/开关，不再读输入框里的未保存值。
- I6 制作单预览改为四态（不出现在制作单 / 仅生产 / 查看商品 / 换一个），不再推算候选数；
  组是否生效由 `issues` + 商城总开关决定。
- I7 失败提示统一走 `toastApiError`（不重复弹），上架失败后重新加载并把四段状态回填。

**Minor**
- M1 `SupplementCatalogItem` 补上 `equivalenceGroup` 字段；去掉本地扩展类型。
- M2 面板对 `issues` 缺失做了兜底。
- M3 加了卸载守卫，晚到的响应不再写状态/弹提示。
- M4 组下拉过滤 `DISABLED`，选项里显示营养素。

**仍然留着（已记录，不在本轮）**
- 四段折叠、统一保存入口与「N 项未保存」汇总、组内排序、每个问题后的「去补」锚点。
- 刷新页面后第 4 步消失（`saved` 只存在组件内存里）；目前需回到上架清单/等价组页面继续。
- 两个保存按钮各自 `PUT` 整行，极端并发下可能互相覆盖（窗口很窄）。

### P3 · 兜底与增值（2026-11-14）

**已完成：** Task 13（新建待补角标）、Task 14（参考售价）。

- 后端：`GET /admin/supplement-shop/catalog` 每条补剂多返回 `createdAt`（ISO）。
- 上架清单：新增汇总卡「新建 7 天未配好」+ 筛选项「新建 7 天未配好」+ 行内「新建待配」标签。
  口径：建档 7 天内，且（未上架 或 未归等价组）。
- 第 4 步：显示「参考售价 = 单位成本 × 加价倍率」，并写明不含运费/服务费、最终价以下单页为准。
  不做整单试算（`quote-preview` 需要整单上下文，容易给出误导性数字）。

**自检：** 后端 supplement-shop 套件 20/21 通过（唯一失败是 `supplement-order.service.spec.ts`
的 8 条历史基线红，已在干净 main 复现）；admin-web 110 文件 / 1176 条全过；构建通过。

### P2 复审修复（2026-11-14）

独立复审：无 Critical，7 Important / 9 Minor。本轮修复：

**Important**
- I1 推荐文案不再说「可以直接用」：加入/移出成员会把已审核组打回 DRAFT，
  文案改为「加入后会把组打回待审核，需要重新审核」；接口额外返回 `equivalenceEnabled`，
  总开关关着时前端按不可用展示（默认 false，不再假设开）。
- I2 排序改为「单位一致 + 已审核」优先（单成员组同档，加入即凑够 2 人），
  「单位不一致」排最后；对应文案改为「加入后就是 2 个成员，但组要审核通过才参与替换」。
- I3 抓到的图**不再静默覆盖**：先给「采用 / 忽略」，采用时下载→转存到自有 COS
  （复用 `uploadIngredientDiyImage`）→ 写入表单，并保留「撤销上次采用的主图」。
- I4 品牌/规格给出「采用 / 忽略」，采用后直接写入档案（带失败提示）。
- I5 主图白名单收紧：只收 https + `images-iherb.com` / `cloudinary.com` /
  `img.sevenkitchen.cloud`，路径含 review/user/logo/banner 一律跳过。
- I6 外链图在「采用」时转存自有图床，避免小程序真机空白图与绕过 1:1 裁切。
- I7 「从链接抓取」仅在 iHerb 平台可用，其他平台直接写明「目前只支持 iHerb」。

**Minor**
- M1 规格：计数单位优先；重量单位必须 ≥10 才算规格（避免 `1 g` 被当规格）。
- M2 品牌加词边界（Kalaya 不再命中 KAL），返回规范写法（`NOW Foods`）。
- M3 单位不一致按具体原因分文案（改单位 / 缺换算依据 / 缺每份克重）。
- M4 采用推荐组前校验它确实在可选列表里。
- M6 商城配置读不到时按「总开关关」处理，不高估「能换」。
- M7 推荐只读未停用组、`take 200`、稳定排序。
- M8 非补剂原料的报错文案分开。

**未修（记录在案）**
- M9 `assertProxyDelivered` 仍是历史遗留未调用（P2 之前就存在）。贸然接上会改变
  线上链接预览的失败面，留作单独任务。
- M5 抓取失败的提示由请求拦截器与行内各出现一次，暂无法在不改拦截器的前提下合并。
