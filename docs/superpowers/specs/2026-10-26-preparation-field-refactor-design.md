# 原料「部位 / 状态 / 预处理」字段重构设计

- 日期：2026-10-26
- 状态：已实施（Phase 1–3，2026-10-26）；剩余未决见文末
- 范围：Web 后台（食谱设计器、食谱编辑页）、小程序展示层、后端领域/接口/数据迁移
- 原不在本次范围：订单「打碎 / 切丁」口感模块；已于 2026-10-26 作为独立任务下线

## 1. 背景与目标

目前原料上的 `preparationMethod` 字段在中文界面里叫「制备方法」或「预处理」。它承载的是单个原料在进入制作前需要说明的信息，例如「牛里脊 / 生 / 去油」。但实际使用中存在三个问题：

1. 名称不统一：后台叫「预处理」，食谱编辑页和小程序叫「制备方法」，容易和整份食谱的「制作步骤」混淆。
2. 内容不统一：有的存中文文本，有的存制备方法字典的 ID；AI 读到 ID 后无法翻译，复制到别的草稿会变成裸 ID 或近似猜测。
3. 编辑体验不统一：设计器只能从字典选/手填，缺少「这个原料上次是怎么写的」；上线检查又不区分食材和调味料，盐、油、补剂也被要求填写。

本次重构要把这个字段明确定义为：

> **部位 / 状态 / 预处理**：针对单个原料，说明用哪个部位、以什么状态（生/熟/干）称重、以及进入制作前怎么处理。

它只回答「原料进入制作前是什么、怎么处理」，不回答火候、时间、顺序——后者属于整份食谱的「制作步骤」。小程序食谱详情页的食材清单展示本字段；DIY 制作单展示完整的「制作步骤」。

## 2. 术语表（唯一口径）

| 中文名 | 英文/代码名 | 用在哪里 | 说明 |
|---|---|---|---|
| 部位 / 状态 / 预处理 | `preparationMethod`（保留现有字段名） | 单个原料 | 本次重构对象，例如「牛里脊/生/去油」 |
| 制作步骤 | `productionSteps` | 整份食谱 | 完整的加工、烹饪、混合顺序；不在本次改动 |
| 制作方式 / 口感 | 订单 `preparationMethod`（枚举 CHOPPED/DICED） | 订单口感 | 打碎/切丁；当前未使用、入口隐藏，本次不碰，后续单独删除 |

约束：

- 对用户展示时不再使用「制备方法」指代原料字段。
- 订单口感模块不得改名为「部位/状态/预处理」；后续下线时单独处理。
- 数据库列名 `preparation_method` 保持不变，避免牵动快照、接口和历史数据；只统一中文展示与数据格式。

## 3. 字段定义

### 3.1 格式

- 单一自由文本，不拆成三个输入框。
- 推荐写法：`部位/状态/预处理`，例如：
  - `牛里脊/生/去油`
  - `鸡胸/生/去皮切块`
  - `燕麦/干/磨粉`
  - `苹果/生/去核带皮`
- 状态段推荐写「生 / 熟 / 干」；兼容历史写法「生重 / 熟重 / 干重」。
- 不做强制三段校验；只做示例提示和空值检查。原因是历史文案、简单原料（如「全蛋」）不应该被硬卡。
- 长度上限 100 字（与 `DesignRecipeItem.preparationMethod` 的 `VarChar(100)` 一致）；编辑器和接口都做长度校验。
- 营养计算仍以所选营养档案的 `preparationState` 和营养数据为准；本字段只做展示和人工/AI 复核，不参与计算。

### 3.2 状态与称重口径

- 保留「黄字提示」：当字段里的状态（生/熟/干）与所选营养档案不一致时，编辑器提示，但**不自动改写**。
- 取消后端所有自动改写称重口径的逻辑（自动带出、发布兜底都不再调用 `alignPreparationMethodBasis`）。
- 提示文案示例：`营养档案是「生」，预处理写的是「熟」；建议改成「生」。`
- 状态解析要同时识别「生/熟/干」和「生重/熟重/干重」。

## 4. 数据来源与历史

### 4.1 自动带出

新增原料时，系统自动带出该原料**最近一次使用过的历史文案**：

- 来源一：橱窗已发布正式食谱（`Recipe.status = PUBLIC` 且 `isCustomRecipe = false`）。
- 来源二：已交付定制食谱（存在 `CustomRecipeDelivery` 交付记录，且为当前有效交付：`revokedAt = null`、`replacedByDeliveryId = null`）。
- 不包含：当前草稿、其他设计草稿、未交付/已撤销/已被替换的定制食谱。
- 排序：按最近使用时间倒序。橱窗取 `Recipe.createdAt`（发布版本创建时间），定制取有效交付的 `deliveredAt`。
- 同文去重；最多返回 3 条。
- 自动带出取第 1 条；没有历史就留空。
- 不做状态自动改写；如果和历史状态不一致，只显示黄字提示。

### 4.2 下拉建议

- 输入框提供下拉，展示最近 3 条**不同**历史文案。
- 不标注「橱窗 / 定制」来源；定制与橱窗同等可信。
- 允许自由输入；历史只是建议。
- 按原料缓存，避免每行重复请求。
- 现有 `/admin/ingredients/:id/preparation-method-history` 接口扩展为上述合并口径，并支持 `limit`；设计器取 3 条，食谱编辑页可继续展示完整历史。

### 4.3 历史接口的数据口径

- 目录：`RecipeItem` 关联 `Recipe`，筛选 `status = PUBLIC`、`isCustomRecipe = false`。
- 定制：`RecipeItem` 关联 `Recipe`，筛选 `isCustomRecipe = true`，且关联的 `CustomRecipeDelivery` 存在当前有效交付。
- 每条记录计算 `lastUsedAt`：
  - 目录：`Recipe.createdAt`
  - 定制：当前有效交付的 `deliveredAt`
- 说明：`Recipe` 目前没有独立的 `publishedAt` 字段；设计器发布时会新建版本行，`createdAt` 接近发布时刻。若后续需要精确到「发布时间」，Phase 2 可增加 `publishedAt`（本期不强制）。
- 用 `resolvePreparationMethodText` 把历史字典 ID 解析成中文后再去重。
- 返回 `{ text, usageCount, lastUsedAt }`；不返回客户/狗/订单信息。

## 5. 编辑体验（Web 设计器）

### 5.1 展示

- 行内名称由「预处理」改为「部位 / 状态 / 预处理」。
- 输入框宽度从 138px 增加到 220–260px；标签过长时允许换行或放到输入框上方。
- 占位提示：`牛里脊/生/去油`。
- 去掉「管理」按钮和「人工/自动」来源标签。
- 保留非阻塞黄字提示（状态不一致时）。

### 5.2 历史下拉

- 复用现有 `PreparationMethodField` 的可编辑输入框，但数据源从「字典选项」改为「该原料的历史文案」。
- 聚焦或输入时加载最近 3 条；缓存；允许自由输入。
- 选中建议只替换输入框内容；保存仍走现有 `updateItem`。
- 输入框失焦/回车保存的行为保持不变。

### 5.3 字典与来源

- 删除 `PreparationMethodManagerDialog` 入口和「管理」按钮。
- 移除 `preparationSource`（人工/自动）标签；数据库字段保留，后续清理阶段再决定是否删除。
- 设计器不再使用 `preparationMethodOptions` 字典选项；后端可暂时保留该字段供老前端回退，Phase 2 再移除。
- 旧字典表 `preparation_method` 转为**只读 legacy 解析表**，不再提供新增/编辑/删除；等所有可编辑数据和快照都不再依赖 ID 后再考虑下线。

## 6. 上线检查

### 6.1 必填范围

按食材分类判断，不再「每条原料都卡」：

| 类别 | 是否要求填写 |
|---|---|
| 主蛋白 PROTEIN | 必须 |
| 内脏 ORGAN | 必须 |
| 水产 AQUATIC | 必须 |
| 蛋 EGG | 必须 |
| 碳水/谷物 CARB | 必须 |
| 蔬菜 VEGETABLE | 必须 |
| 菌藻 MUSHROOM | 必须 |
| 坚果种子 NUT_SEED | 必须 |
| 豆 LEGUME | 必须 |
| 水果 FRUIT | 必须 |
| 补剂 SUPPLEMENT | 不要求 |
| 油脂 FAT | 不要求 |
| 调味 SEASONING | 不要求 |
| 乳制品 DAIRY | 不要求 |
| 未分类 UNCLASSIFIED | 不要求 |

### 6.2 校验内容

- 只检查「是否为空」，不检查生/熟/干口径。
- 标签改为「部位/状态/预处理完整」。
- 后端 `buildDraftLaunchReadiness` 增加逐项 `preparationRequired`，由服务层按分类计算后传入域函数。
- AI 的 `check_ready` / `check-tools` 使用同一套类别规则，避免 AI 说通过、后台拦截。

## 7. 各端文案替换清单

### 7.1 Web 后台

- `RecipeDesigner/Editor.vue`：行内标签、管理按钮、来源标签、历史下拉。
- `RecipeDesigner/components/PreparationMethodField.vue`：历史建议、宽度、占位提示。
- `RecipeDesigner/components/PreparationMethodManagerDialog.vue`：下线。
- `Recipes/RecipeForm.vue`：表头、表单 label、历史标题、占位提示、空状态。
- `RecipeDesigner/components/RecipeAgentDrawer.vue`：工具结果的「预处理」标签。
- `utils/recipeDesigner/launchReadiness.ts`：「原料预处理完整」。
- `utils/preparationBasis.ts`：状态提示文案；保留提示逻辑。
- `api/preparationMethods.ts`：管理 API 下线或标记 legacy。

### 7.2 小程序

- `pages/recipe-detail/index.vue`：食材/补剂表头。
- `pages/diy-sheet/index.vue`：食材表头、打印表头。
- `components/recipe/RecipeIngredientUsageTable.vue`：表头。
- `pages/staff-production/detail.vue`、`pages/staff-production/print-task.vue`、`utils/canvas-printer.ts`：打印/详情列名。
- `pages/staff-purchasing/preview.vue`：采购预览列名；补剂「添加时机」保持不变。
- 只改展示，不改接口字段和业务逻辑。

### 7.3 后端

- `domain/recipe-designer/launch-readiness.ts`：必填分类、标签、消息。
- `application/recipe-designer/recipe-designer.service.ts`：历史/自动带出、移除自动改写、上线检查分类。
- `application/recipe/recipe.service.ts`：历史查询合并口径、`limit`。
- `domain/recipe-designer/preparation-basis.ts`：移除 `alignPreparationMethodBasis` 及相关调用；状态解析移到前端提示或轻量工具。
- `agent/check-tools.ts`：必填分类与标签。
- `agent/tool-registry.ts`、`agent/recipe-agent-run.service.ts`：工具描述、prompt 用新术语。
- DTO/接口注释：`diy-sheets.dto.ts`、`domain/recipe/types.ts`、`pricing.service.ts` 等。
- `interfaces/controllers/admin.controller.ts`：历史接口 `limit`。

### 7.4 术语统一

- 新增/维护一个共享文案常量：
  - 后台：`PREPARATION_FIELD_LABEL = '部位 / 状态 / 预处理'`
  - 小程序：同一个中文常量（各端各自维护，注释指向本设计文档）
- 不再出现「制备方法」指代原料字段；订单口感模块除外（本次不碰）。
- 窄列（生产打印、采购预览）优先用全称；如果排版过挤，允许用短名「原料处理」，但表单/详情/DIY 必须用全称。

## 8. 数据与迁移

### 8.1 回填旧字典 ID

- 只回填**可编辑**的 `design_recipe_item.preparation_method` 和 `recipe_item.preparation_method`。
- 值等于 `preparation_method.id` 的，替换为对应 `name`。
- 混合了多个 ID/文本的复杂值，用一次性脚本解析；先 dry-run 输出待改数量，再执行。
- **不修改**历史 JSON 快照（订单/交付/生产快照）；读取时继续用 legacy resolver 解析。
- 迁移后保留字典表只读，`resolvePreparationMethodText` 继续兼容老 ID。

### 8.2 字段与兼容

- 数据库列 `preparation_method` 不改名。
- `preparationSource` 保留但不再展示；新数据是否继续写 AUTO/MANUAL 由实现决定，建议保留作审计，Phase 3 再清理。
- `preparationNote` 保留但不再展示；Phase 3 再决定删除。
- `preparationMethodOptions` 在 Phase 1 可暂时保留给老前端；Phase 2 移除。

## 9. 分阶段实施

### Phase 1：不改表，先把定义和体验做对

- 设计器：新标签、去管理/来源标签、加宽、历史下拉、自动带出。
- 后台食谱编辑页：文案和历史。
- 小程序：文案替换。
- 后端：历史合并口径、自动带出、移除自动改写、上线检查分类、AI 同步。
- 保留黄字提示；保留 legacy 字典解析。
- 测试：历史口径、自动带出、警告、上线分类、各端文案。

### Phase 2：数据清理

- 回填可编辑原料项的字典 ID。
- 下线管理弹窗/API；字典表转只读。
- 移除 `preparationMethodOptions` 的前端使用。
- 历史 JSON 快照不改，读取时解析。

### Phase 3：可选清理（已于 2026-10-26 执行）

- 停用/删除 `preparationSource`、`preparationNote`。
- 确认无 ID 后，字典表可下线。
- 订单口感模块单独做下线清理（停写入 → 停展示 → 删字段）。

## 10. 验收标准

1. 新增原料时，自动带出该原料最近一条历史（橱窗或当前有效交付定制），不自动改写状态。
2. 输入框下拉最多 3 条不同历史，无来源标签；可自由输入。
3. 设计器不再出现「管理」按钮和「人工/自动」标签；输入框明显加宽。
4. 状态与营养档案不一致时出现黄字提示，但保存内容不被改动。
5. 上线检查只对 10 类食材要求非空；补剂/油脂/调味/乳制品/未分类不拦；AI `check_ready` 同口径。
6. 小程序食谱详情、DIY 制作单、打印/采购列名统一为新术语；数据/接口键不变。
7. 旧字典 ID 在可编辑原料项中回填为中文；历史快照仍能正常显示。
8. 订单口感模块代码/数据不在本次变更中。

## 11. 风险与待定

- **风险**：取消自动改写后，文案状态与营养档案可能不一致；黄字提示依赖人工/AI 复核。
- **风险**：已交付定制历史的判定要严格使用交付记录，避免把未交付/撤销版本带进来。
- **风险**：自由文本会造成格式差异；历史建议 + 黄字提示缓解，不做硬校验。
- **待定**：窄列（生产打印/采购）最终用全称还是「原料处理」；建议先用全称，排版过挤再调整。
- **待定**：`preparationSource` / `preparationNote` / 字典表的最终删除时间。
- **后续独立任务**：订单「打碎/切丁」口感模块下线。


## 12. 实施记录（2026-10-26）

- Phase 1：字段、历史自动带出、3 条下拉、黄字提示、上线检查分类、AI 同口径、全端文案已上线。
- Phase 2：36 条纯 ID 回填 + 2 条混合旧值清理；管理 API 下线；158 份历史快照未改写；字典表只读。
- Phase 3：`preparationSource` / `preparationNote` 列删除；`preparationMethodOptions` 移除；订单口感模块独立下线。
- 历史订单的口感值 308 条（全部 CHOPPED）已备份后删除列。
- 剩余：字典表最终下线（受 158 份快照阻塞）、窄列命名、订单手工回归。
