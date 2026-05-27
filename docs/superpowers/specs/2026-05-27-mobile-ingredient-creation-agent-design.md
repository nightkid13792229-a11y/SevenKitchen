# 小程序 AI 新增食材标准原料设计

## 背景

当前系统已经有标准原料、营养档案、营养来源记录和候选审核链路。用户希望在小程序员工工作台中新增一个自然语言入口：通过类似 AI chatbot 的交互，让 Agent 自动帮助新增食材类标准原料，并完成营养档案的搜寻、匹配、数据录入建议和审核报告。

这个功能应继承前期人工审核营养档案时形成的经验：语义匹配、主次档案、轻烹饪优先、字段完整性统计、字段来源追踪、FEDIAF 2025 犬用维生素 A/E 换算、补源风险中文化，以及不因字段风险阻断食谱保存或发布。

## 目标

- 在小程序员工工作台新增 `AI 新增食材` 入口。
- 用户用自然语言提交新增食材需求，例如“新增鸭胸肉，最好有生和水煮档案”。
- 后端创建异步任务，让 Agent 自动完成来源召回、候选排序、主次档案建议、字段补源、完整性统计和中文审核报告。
- 第一版只支持食材类标准原料，不支持补剂自动建档。
- Agent 只能生成待审核草稿，不能直接创建正式标准原料或正式营养档案映射。
- 用户审核确认后，系统一次性创建正式 `Ingredient`、`NutritionFood`、`NutritionFoodMapping`，并把主档案写入 `Ingredient.nutritionProfile`。
- 任务过程可追踪、可失败、可重跑；关键语义歧义可中途询问用户。

## 非目标

- 第一版不支持补剂标准原料的自然语言创建。补剂继续走现有标签识别和人工确认链路。
- 第一版不允许 Agent 绕过审核直接写入正式原料。
- 第一版不让草稿营养档案进入食谱设计器候选列表。
- 第一版不开放任意网页抓取；外部来源必须来自官方 API、本地结构化库或可信白名单。
- Agent 不得在没有来源依据的情况下发明营养数值。
- 字段风险不作为食谱保存或发布的阻断条件；风险用于透明展示和后续复核。

## 推荐方案

采用独立的 `原料创建任务 + 草稿` 链路。

Agent 的自动化动作先写入草稿域：任务状态、聊天消息、关键问题、草稿基本信息、候选来源、字段来源、补源说明、完整性报告和最终建议。正式表只在用户点击确认后由后端事务写入。

不采用“先创建临时正式原料再生成候选”的方案，因为这会在审核前污染正式 `Ingredient`。也不采用“只生成外部报告”的方案，因为它无法在小程序内形成完整工作流。

## 用户流程

1. 员工在小程序工作台点击 `AI 新增食材`。
2. 进入任务型聊天页，输入自然语言需求。
3. 后端创建 `IngredientCreationJob`，聊天区显示任务已开始。
4. Agent 解析需求，生成搜索词、别名、排除词和需要关注的语义点。
5. 系统查找本地 `NutritionSourceRecord`，必要时调用 USDA API 或可信白名单来源。
6. Agent 对候选来源做语义匹配和排序。
7. 如果存在关键语义歧义，任务进入 `WAITING_USER`，聊天页显示问题并等待用户回答。
8. Agent 生成食材标准原料草稿、主档案和次级档案建议。
9. 系统生成字段完整性统计、来源追踪、补源风险和中文审核报告。
10. 任务进入 `READY_FOR_REVIEW`，用户打开草稿审核页。
11. 用户可以要求 Agent 重新查找、编辑草稿，或确认创建正式原料。
12. 确认后系统创建正式数据，任务进入 `CONFIRMED`。

## 小程序交互

### 工作台入口

在员工工作台新增模块：

- 标题：`AI 新增食材`
- 描述：`自然语言创建标准食材与营养档案草稿`
- 权限：`STAFF` 可创建和查看自己的任务，`ADMIN` 可查看全部任务并确认正式入库。

### 聊天任务页

聊天页是任务型界面，不是泛聊天产品。

页面元素：

- 当前任务状态。
- 阶段进度，例如“正在查找 USDA/MEXT/CFCT 来源”。
- 用户消息。
- Agent 进度消息。
- Agent 关键问题。
- 底部输入框，用于补充要求或回答问题。
- 任务完成后的 `查看草稿` 按钮。

聊天消息类型：

- `USER`: 用户输入。
- `AGENT`: Agent 普通回复。
- `PROGRESS`: 阶段性进度。
- `QUESTION`: 关键语义问题。
- `SYSTEM`: 任务状态和错误提示。

### 草稿审核页

草稿审核页展示三组内容：

- 标准原料基本信息：名称、类型、单位、采购策略、是否建议启用食谱设计器、备注。
- 营养档案建议：主档案、次级档案、英文原名、中文显示名、来源、可食部、加工状态、完整性统计。
- Agent 审核报告：匹配理由、字段补源说明、非零/零值/空值统计、风险中文说明、最终建议。

页面动作：

- `要求 Agent 重新查找`
- `编辑草稿`
- `确认创建正式原料`
- `放弃草稿`

确认正式入库第一版仅允许 `ADMIN`。

## 后端数据模型

### IngredientCreationJob

异步任务主表。

核心字段：

- `id`
- `createdBy`
- `status`
- `requestText`
- `currentStage`
- `progress`
- `waitingQuestion`
- `errorMessage`
- `agentProvider`
- `agentModel`
- `createdAt`
- `updatedAt`
- `completedAt`

建议状态：

- `DRAFTING`
- `SEARCHING_SOURCES`
- `WAITING_USER`
- `BUILDING_REPORT`
- `READY_FOR_REVIEW`
- `CONFIRMED`
- `FAILED`
- `CANCELED`

### IngredientCreationMessage

聊天和任务日志表。

核心字段：

- `id`
- `jobId`
- `role`: `USER`、`AGENT`、`PROGRESS`、`QUESTION`、`SYSTEM`
- `content`
- `payload`
- `createdAt`

### IngredientCreationDraft

标准原料草稿表。

核心字段：

- `id`
- `jobId`
- `status`: `DRAFT`、`READY_FOR_REVIEW`、`CONFIRMED`、`REJECTED`
- `suggestedName`
- `aliases`
- `type`: 固定为 `FOOD`
- `baseUnit`
- `unitDisplayLabel`
- `procurementStrategy`
- `diyEnabled`
- `procurementEnabled`
- `notes`
- `agentSummary`
- `reviewReport`
- `confirmedIngredientId`
- `confirmedBy`
- `confirmedAt`

### IngredientCreationDraftProfile

营养档案草稿表。

核心字段：

- `id`
- `draftId`
- `role`: `PRIMARY` 或 `SECONDARY`
- `sourceRecordId`
- `sourceType`
- `sourceKey`
- `sourceFoodName`
- `sourceFoodNameEn`
- `suggestedDisplayNameZh`
- `preparationState`
- `preparationStateLabel`
- `ediblePortionLabel`
- `processingLabel`
- `nutritionData`: `NutritionProfileV2`
- `completenessSummary`
- `fieldSourceSummary`
- `supplementRiskSummary`
- `agentRationale`
- `sortOrder`

## API 设计

接口建议放在：

`/api/v1/admin/ingredient-creation`

核心接口：

- `POST /jobs`: 创建新增食材任务。
- `GET /jobs`: 获取任务列表。
- `GET /jobs/:id`: 获取任务详情、消息、草稿和档案。
- `POST /jobs/:id/messages`: 追加用户补充要求。
- `POST /jobs/:id/answer`: 回答 Agent 关键问题并继续任务。
- `POST /drafts/:id/rerun`: 按补充要求重新搜索或重新生成草稿。
- `PATCH /drafts/:id`: 人工编辑草稿基本信息。
- `PATCH /draft-profiles/:id`: 人工编辑档案中文名、角色、标签或备注。
- `POST /drafts/:id/confirm`: 确认正式创建标准原料和营养档案。
- `POST /drafts/:id/reject`: 放弃草稿。

## Agent 编排

新增 `IngredientCreationAgentService`，负责把一个任务推进为草稿。

服务步骤：

1. 解析自然语言需求，得到名称、别名、采购语境、生熟偏好、来源偏好和排除项。
2. 调用现有 Agent search plan 能力生成搜索词。
3. 查找本地 `NutritionSourceRecord`。
4. 必要时导入 USDA 或可信白名单来源。
5. 生成候选来源池。
6. 调用现有候选 review/rank provider 进行语义排序。
7. 选择建议主档案和次级档案。
8. 对每个档案生成 `NutritionProfileV2`。
9. 执行字段完整性统计和来源核对。
10. 执行必要补源，并写入字段级来源元数据。
11. 生成中文审核报告。
12. 保存 `IngredientCreationDraft` 和 `IngredientCreationDraftProfile`。

Agent 只在关键语义歧义时中断并提问。普通字段缺失、来源新旧、补源风险进入最终报告。

关键语义歧义示例：

- “娃娃菜”是否接受大白菜近似。
- “山药”按中国淮山、日式长芋还是其他品种理解。
- 标准原料名和候选来源在物种或部位上存在明显冲突。
- 找不到轻烹饪档案，只找到干烤、油炸或罐装档案。

## 来源和候选策略

候选来源优先使用可信数据库：

- USDA FoodData Central
- MEXT
- CFCT
- AFCD
- NEVO
- NZFCD
- 其他经白名单批准的官方或专业营养数据库

来源选择不是固定排序，而是结合语义：

- 中国大陆常见采购语境下，MEXT、CFCT 或 AFCD 可能比 USDA 更贴近。
- USDA Foundation 优先于旧 SR Legacy，但语义不匹配时不能强行替代。
- 熟制次级档案优先水煮、蒸、炖等轻烹饪，不使用干烤、油炸、罐装强行替代。
- 找不到合适次级档案时，可以只生成主档案，并在报告说明原因。

## 营养档案审核规则

### 档案匹配

每个档案都需要评估：

- 物种匹配。
- 部位匹配。
- 生熟状态匹配。
- 可食部匹配。
- 加工状态匹配。
- 地域和饮食语境匹配。
- 数据库版本和来源新鲜度。
- 颗粒度是否与标准原料对齐。

### 完整性统计

不使用抽象评分。

每个档案报告必须显示：

- 评估字段分母。
- 非零数值字段数量。
- 零值字段数量。
- 空值字段数量。
- 缺失字段清单。
- 已填字段来源摘要。

0 值算有效数据，但必须单独统计。

### 字段来源和换算

每个非空字段都应尽量保留：

- 原始来源。
- 原始字段名。
- 原始值和原始单位。
- 内部标准值和标准单位。
- 单位换算说明。
- 来源兼容性。
- 中文风险说明。

USDA 来源应尽量逐字段核对原始值和单位换算。其他来源如果第一版不能完全机器核对，必须标注“需要来源复核”。

### 补源原则

补源优先级：

1. 同来源同食物更完整档案。
2. 同食物不同状态，按含水率和正常烹饪变化判断。
3. 同物种相近部位。
4. 同类食材近似来源。

补源字段必须写入 `meta.sourceForms`、`meta.fieldSources` 和 `meta.conversionNotes`。报告中必须中文说明风险。

### 犬用营养口径

- 维生素 A 使用 FEDIAF 2025 犬用活性口径。能用视黄醇和 β-胡萝卜素分项时，用分项重算；缺少分项时才使用来源总 IU fallback。
- 维生素 E 使用已固化的 FEDIAF 2025 犬用生育酚活性口径。能用 α/β/γ/δ 分项时，用分项重算；缺少分项时按来源定义和保守 fallback 处理。
- 能量使用系统既有犬用 Atwater 口径。

## 正式确认入库

`POST /drafts/:id/confirm` 必须在事务中完成：

1. 校验用户有确认权限。
2. 校验草稿处于 `READY_FOR_REVIEW`。
3. 校验不存在同名同品牌同规格正式原料冲突。
4. 创建正式 `Ingredient`。
5. 将草稿档案 upsert 为 `NutritionFood`，状态为 `VERIFIED`。
6. 创建主次 `NutritionFoodMapping`。
7. 主档案写入 `Ingredient.nutritionProfile`。
8. 草稿状态改为 `CONFIRMED`，记录 `confirmedBy`、`confirmedAt` 和 `confirmedIngredientId`。

确认前，任何草稿档案都不能进入食谱设计器候选列表。

## 权限

- `STAFF` 可以创建任务、查看自己创建的任务、补充要求和回答 Agent 问题。
- `ADMIN` 可以查看全部任务、编辑草稿、确认正式入库或拒绝草稿。
- 第一版建议仅 `ADMIN` 可以调用确认接口。
- 所有正式确认动作必须记录操作者和时间。

## 错误处理

- Agent 未配置：创建任务失败并提示去 Agent 设置配置。
- 本地来源不足：任务继续尝试可信白名单来源；如果仍不足，生成“无可用来源”报告。
- 在线来源失败：保留本地结果，报告标注在线来源未完成。
- Agent JSON 输出失败：自动重试；多次失败后进入 `FAILED`。
- 任务失败：保留已完成阶段、错误信息和重跑入口。
- 同名原料已存在：不创建草稿，提示可能重复，并允许用户选择是否继续研究。
- 关键语义不清：进入 `WAITING_USER`，等待用户回答后继续。

## 测试重点

后端测试：

- 创建任务不会创建正式 `Ingredient`。
- `STAFF` 和 `ADMIN` 权限边界正确。
- 任务状态机可从运行、等待用户、失败、完成进入正确状态。
- 关键问题回答后任务能继续。
- 草稿确认事务能创建 `Ingredient`、`NutritionFood`、`NutritionFoodMapping`。
- 重复确认不会重复创建正式记录。
- 草稿档案不出现在食谱设计器候选列表。
- 完整性统计正确区分非零、零值和空值。
- 字段补源保留 `sourceForms`、`fieldSources` 和 `conversionNotes`。
- 维生素 A/E 使用犬用口径重算。

小程序测试：

- 工作台出现 `AI 新增食材` 入口。
- 能创建任务并进入聊天任务页。
- 任务进度、Agent 消息和等待用户问题能展示。
- 能回答关键问题。
- 能打开草稿审核页。
- 能编辑草稿中文名和档案标签。
- 非管理员不能确认正式入库。
- 失败任务能显示错误并提供重跑入口。

## 分阶段实施建议

第一阶段：

- 建表和后端基础 API。
- 小程序工作台入口、任务列表、聊天任务页骨架。
- 创建任务后保存消息和状态，不先接入完整 Agent 搜索。

第二阶段：

- 接入 Agent 编排和现有营养治理来源召回能力。
- 生成草稿原料和主次档案建议。
- 输出完整性统计和审核报告。

第三阶段：

- 草稿审核页。
- 管理员确认正式入库事务。
- 完整权限、错误处理和回归测试。

第四阶段：

- 强化来源白名单、MEXT/AFCD/NEVO/CFCT 的逐字段核对能力。
- 增加更细的重跑选项，例如只重跑熟制档案、只补脂肪酸、只重译中文名。

## 自查

- 设计明确限制第一版只支持食材类标准原料。
- 设计明确禁止 Agent 在确认前写正式 `Ingredient`、`NutritionFoodMapping` 或 `Ingredient.nutritionProfile`。
- 草稿、任务、消息、档案四类数据边界清楚。
- UI 入口、聊天任务页和草稿审核页都有明确职责。
- API 覆盖创建任务、补充消息、回答问题、重跑、编辑、确认和拒绝。
- 营养审核规则覆盖语义匹配、字段完整性、来源核对、补源原则和犬用维生素 A/E 口径。
- 错误处理覆盖 Agent 未配置、来源不足、在线失败、输出失败、重复原料和关键语义歧义。
- 测试范围覆盖后端状态机、确认事务、权限、营养完整性和小程序回归。
