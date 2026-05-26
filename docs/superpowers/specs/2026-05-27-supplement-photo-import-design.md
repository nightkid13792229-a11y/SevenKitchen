# 补剂拍照识别导入设计

## 背景

SevenKitchen 已经有标准原料库、补剂原料、统一营养档案 `Ingredient.nutritionProfile`、移动端食谱设计器方向，以及 Web 管理端原料管理能力。补剂营养数据目前仍依赖人工录入，录入时需要处理品牌、规格、单位、营养素别名、每粒或每份口径、维生素特殊换算等问题，容易慢、漏、错。

本设计为小程序食谱设计器中的补剂库增加拍照识别导入能力。管理员可以用手机拍摄或从相册选择补剂标签图片，系统识别补剂产品信息和营养信息，生成可复核草稿。只有管理员确认且关键字段完整后，系统才写入正式补剂原料和营养档案。

## 已确认决策

1. 小程序不新增工作台入口，复用现有食谱设计器中的补剂库入口。
2. 只有管理员能看到并使用“拍照识别新增”能力。
3. Web 管理端新增独立“Agent 配置”入口和页面，不混入现有“全局配置”。
4. 模型接入采用 OpenAI-compatible 通用配置。
5. AI 识别结果先保存为草稿，不直接写入正式原料库。
6. 关键字段、单位换算参数或重复冲突未解决时，禁止确认入库。
7. 重复检测按原料名、品牌、产品规格强约束；疑似重复时必须选择更新或合并已有补剂，不能直接新增。

## 目标

1. 支持管理员在小程序补剂库中拍照或从相册选择图片导入补剂。
2. 识别产品名称、品牌、规格、标准单位、单个重量、添加时机、生产损耗率、备注等标准原料信息。
3. 识别标签中能精确确认的营养素、含量、单位和原始口径。
4. 在识别过程中提示照片模糊、反光、裁切、信息不全、单位缺参数、营养字段不确定等风险。
5. 提供确认页让管理员核对和补齐字段。
6. 确认后支持一键新增或更新补剂类标准原料，并写入 `Ingredient.nutritionProfile`。
7. Web 管理端可配置、修改、启用、关闭补剂识别 Agent。
8. 所有正式写入都可追溯到识别草稿、图片、模型版本和确认人。

## 非目标

1. 第一版不开放给普通客户或非管理员员工。
2. 第一版不新增小程序工作台模块。
3. 第一版不让 AI 自动绕过人工确认写入正式档案。
4. 第一版不做 Web 端上传识别和确认入库主流程。
5. 第一版不做补剂营养真实性判定，只做标签识别、字段标准化和人工确认。
6. 第一版不自动推断标签未提供的关键换算参数。
7. 第一版不把低置信度或无法匹配字典的营养项写入核心营养字段。

## 总体方案

采用“草稿治理版”。

```text
小程序食谱设计器补剂库
  -> 拍照或相册选择图片
  -> 上传图片并创建识别草稿
  -> 图片风险检测
  -> Agent OCR/视觉理解/语义抽取
  -> 字段白名单与单位标准化
  -> 重复检测
  -> 管理员确认页复核和补齐
  -> 后端强校验
  -> 新增或更新 Ingredient + nutritionProfile
```

AI Agent 负责读懂标签、OCR 纠错、中文翻译、品牌和产品语义匹配、营养素别名匹配、风险原因解释。

标准化工具负责营养字段白名单、单位归一、维生素特殊换算、关键字段校验、重复检测和正式入库写入。

## 小程序页面流程

### 补剂库入口

入口位于现有食谱设计器中的补剂库。

管理员视图显示：

- 补剂搜索
- 补剂列表
- 现有选择补剂能力
- “拍照识别新增”按钮
- 草稿待确认提示

非管理员视图不显示“拍照识别新增”，也不能调用识别创建接口。

### 图片导入页

支持两种导入方式：

- 实时拍照
- 从相册选择

支持多张图片。推荐管理员上传：

- 产品正面
- 营养成分表或 Supplement Facts
- 产品规格或净含量
- 用量说明或每份口径说明

图片上传后，系统先创建识别草稿并记录图片 URL。轻度风险允许继续识别但展示提示；严重风险提示重拍或补图。

### 风险提示

图片风险包括：

- 图片模糊
- 强反光
- 文字过小
- 关键区域被裁切
- 只拍正面但缺少营养表
- 缺少产品规格或每份口径
- 缺少单位或含量数字
- 多张图片疑似来自不同产品

风险分级：

- `INFO`：提示管理员复核，不阻断。
- `WARNING`：允许生成草稿，但确认页突出显示。
- `BLOCKING`：不能确认入库，必须补图、重拍或手工补齐关键字段。

### 草稿确认页

确认页包含三块。

标准原料信息：

- 原料名称
- 原料类型，固定为 `SUPPLEMENT`
- 备注说明
- 基准单位
- 标准单位展示名
- 单个重量，识别不到时可留空，但如果基准单位或换算需要则必须补齐
- 产品品牌
- 产品规格
- 添加时机：制作中或随餐
- 生产损耗率

营养档案：

- 原始口径：每 100g、每 100ml、每 1g、每 1ml、每份
- 单份重量或单粒重量
- 样品状态
- 来源类型，固定为品牌商品标签
- 营养素列表
- 原始标签值
- 原始单位
- 标准化值
- 标准单位
- 字段置信度
- 字段风险说明

入库检查：

- 关键字段是否完整
- 单位换算是否完整
- 是否存在重复候选
- 是否存在低置信度核心字段
- 是否存在不能写入核心营养字段的识别项

确认按钮规则：

- 所有关键字段完整才可点击。
- 单位换算缺参数时不可点击。
- 重复候选未处理时不可点击。
- Agent 低置信度字段可以删除或改为备注，但不能直接写入核心营养字段。

## Web 管理端 Agent 配置

新增独立菜单项：`Agent 配置`。

第一版提供一个配置卡片：`补剂识别 Agent`。

配置字段：

- 启用状态
- Provider，第一版固定为 OpenAI-compatible
- Base URL
- API Key
- 视觉模型
- 文本模型
- 温度
- 超时时间
- 最大重试次数
- 提示词版本
- 识别字段模板版本

页面能力：

- 保存配置
- 测试连接
- 启用
- 关闭
- 查看最后更新时间和最后更新人

安全规则：

- API Key 后端加密保存。
- 前端读取配置时只返回是否已配置，不返回明文。
- 更新配置时，只有提交新 Key 才覆盖旧 Key。
- 接口只允许管理员访问。

启停规则：

- Agent 关闭后，小程序不能创建新的识别草稿。
- 历史草稿仍可查看。
- 已完整草稿仍可确认入库，因为确认入库不依赖再次调用模型。

## 后端数据模型

### AgentConfig

保存补剂识别 Agent 配置。

核心字段：

- `id`
- `agentType`：`SUPPLEMENT_IMPORT`
- `enabled`
- `provider`：`OPENAI_COMPATIBLE`
- `baseUrl`
- `apiKeyEncrypted`
- `visionModel`
- `textModel`
- `temperature`
- `timeoutMs`
- `maxRetries`
- `promptVersion`
- `schemaVersion`
- `lastTestStatus`
- `lastTestMessage`
- `updatedBy`
- `createdAt`
- `updatedAt`

### SupplementImportDraft

保存补剂识别草稿。

状态：

- `CREATED`
- `IMAGE_RISK_DETECTED`
- `RECOGNIZING`
- `NEEDS_REVIEW`
- `READY_TO_CONFIRM`
- `CONFIRMED`
- `FAILED`
- `CANCELLED`

核心字段：

- `id`
- `status`
- `imageUrls`
- `riskFlags`
- `rawOcrText`
- `aiExtractedData`
- `normalizedDraft`
- `duplicateCandidates`
- `validationErrors`
- `agentConfigSnapshot`
- `modelUsage`
- `confirmedIngredientId`
- `confirmedBy`
- `confirmedAt`
- `createdBy`
- `createdAt`
- `updatedAt`

`normalizedDraft` 保存确认页可编辑结构，包含标准原料信息、营养档案、字段置信度和换算结果。

## 后端接口

### Web 管理端

`GET /api/v1/admin/agent-configs/supplement-import`

返回脱敏后的补剂识别 Agent 配置。

`PUT /api/v1/admin/agent-configs/supplement-import`

保存配置。只有提交新 API Key 时才更新密钥。

`POST /api/v1/admin/agent-configs/supplement-import/test`

测试当前配置能否连通模型服务。

### 小程序食谱设计器补剂库

`POST /api/v1/recipe-designer/supplement-import-drafts`

创建草稿并发起识别。请求包含图片 URL 列表。后端校验管理员权限和 Agent 启用状态。

`GET /api/v1/recipe-designer/supplement-import-drafts/:id`

读取草稿详情。

`PUT /api/v1/recipe-designer/supplement-import-drafts/:id`

保存管理员在确认页上的修正。

`POST /api/v1/recipe-designer/supplement-import-drafts/:id/confirm`

确认入库。后端执行完整校验，通过后新增或更新 `Ingredient`。

## 正式入库规则

确认入库写入现有 `Ingredient`。

固定字段：

- `type = SUPPLEMENT`
- `name`
- `notes`
- `baseUnit`
- `unitDisplayLabel`
- `weightG`
- `brand`
- `productModel`
- `procurementStrategy`
- `diyEnabled`
- `procurementEnabled`
- `purchaseUnit`
- `purchaseToBaseRatio`
- `currentPricePerPurchaseUnit`
- `properties.category_type`
- `properties.add_timing`
- `properties.production_loss_rate`
- `nutritionProfile`

`nutritionProfile` 使用现有结构：

- `meta.rawBasisType`
- `meta.sampleState`
- `meta.servingWeightG`
- `meta.densityGPerMl`
- `meta.sourceType = LABEL`
- `meta.sourceTitle`
- `meta.sourceProvider`
- `meta.attachments`
- `meta.confidenceLevel`
- `meta.versionNote`
- `macros`
- `minerals`
- `vitamins`
- `fattyAcids`
- `aminoAcids`
- `customItems`

只写入能精确识别、能匹配系统营养字段、单位可标准化的营养素。不能确认的识别项不写核心字段。

## 字段标准化规则

营养字段必须匹配系统字段字典：

- 宏量
- 矿物质
- 维生素
- 脂肪酸
- 氨基酸

AI 可以识别别名，例如 `Ca` 到钙、`DHA` 到 DHA、`Vitamin D3` 到维生素 D，但最终必须落到系统字段路径，例如 `minerals.calcium`、`fattyAcids.dha`、`vitamins.vitaminD`。

无法稳定匹配的成分不进入核心营养字段。管理员可以选择：

- 删除该项
- 放入自定义营养项
- 仅保留在备注和 OCR 原文中

## 单位换算规则

系统保留原始口径，同时生成标准化值。

支持原始口径：

- 每 100g
- 每 100ml
- 每 1g
- 每 1ml
- 每份
- 每粒、每片、每勺这类口径归入每份，并通过标准单位展示名表达

支持单位：

- `g`
- `mg`
- `μg`
- `IU`
- `kcal`
- `kJ`
- `%`

维生素 A、D、E 使用现有维生素特殊换算规则。无法明确形态的维生素换算必须提示管理员复核，不自动假设。

缺少换算必需参数时：

- 可以保存草稿
- 可以展示识别结果
- 不能确认入库

## 重复检测规则

重复检测至少使用：

- 标准化原料名称
- 品牌
- 产品规格

匹配结果分级：

- `EXACT`：名称、品牌、规格一致，必须更新已有补剂。
- `LIKELY`：名称或翻译接近，品牌和规格接近，必须管理员选择合并、更新或取消。
- `POSSIBLE`：相似但证据不足，必须管理员确认后才允许继续。

第一版不允许在存在 `EXACT` 或未处理 `LIKELY` 候选时直接新增。

## 权限规则

小程序：

- 管理员：创建草稿、识别、编辑草稿、确认入库。
- 非管理员：不能看到识别入口，不能调用识别和确认接口。

Web 管理端：

- 管理员：查看和修改 Agent 配置。
- 非管理员：不能访问 Agent 配置接口。

后端必须做权限校验，不能只依赖前端隐藏按钮。

## 错误处理

图片问题：

- 轻度风险提示复核。
- 严重风险阻止确认入库。
- 支持补图后重新识别。

Agent 问题：

- Agent 未启用时拒绝新建识别草稿。
- 模型调用失败时草稿状态为 `FAILED`，保存错误摘要。
- 结构化失败时保留 OCR 原文和模型原始返回，允许重试。

入库问题：

- 关键字段缺失时拒绝。
- 单位换算参数缺失时拒绝。
- 重复候选未处理时拒绝。
- 营养字段不在白名单时拒绝写核心字段。

## 测试与验收

后端测试：

- Agent 配置保存、读取脱敏、启停和测试连接。
- API Key 不从读取接口明文返回。
- 非管理员不能访问 Agent 配置。
- 非管理员不能创建或确认补剂识别草稿。
- Agent 关闭时不能新建草稿。
- 识别草稿保存图片、风险、AI 原文、标准化草稿和重复候选。
- 关键字段缺失时确认入库失败。
- 单位换算参数缺失时确认入库失败。
- 重复候选未处理时确认入库失败。
- 完整草稿确认后写入 `Ingredient` 和 `nutritionProfile`。

小程序测试：

- 食谱设计器补剂库显示管理员识别入口。
- 非管理员不显示识别入口。
- 支持拍照和相册选择。
- 风险提示能在上传后和确认页展示。
- 确认页能编辑标准原料信息和营养档案。
- 入库检查未通过时确认按钮不可用。
- 完整草稿可确认入库并返回补剂库。

Web 管理端测试：

- 侧边栏新增 Agent 配置入口。
- 能保存 OpenAI-compatible 配置。
- 读取时 API Key 脱敏。
- 可启用和关闭补剂识别 Agent。
- 测试连接能展示成功或失败结果。

手工验收场景：

1. 管理员进入食谱设计器补剂库。
2. 拍摄补剂正面、营养表、规格信息。
3. 系统生成草稿并展示风险提示。
4. 管理员补齐缺失字段。
5. 如果识别到重复补剂，管理员选择更新已有补剂。
6. 管理员确认入库。
7. 后台原料库出现补剂原料，营养档案写入 `nutritionProfile`。
8. 该补剂可以继续被食谱设计器补剂库使用。

## 发布与回滚

建议分阶段发布：

1. 上线 Agent 配置页面和后端配置接口。
2. 上线草稿创建、读取、保存接口。
3. 上线小程序补剂库识别入口和确认页。
4. 上线确认入库能力。

回滚策略：

- Agent 可随时关闭，关闭后不再产生新识别草稿。
- 草稿表独立于正式原料表，关闭识别不会影响已有补剂。
- 已确认写入的正式原料按现有原料管理流程编辑或删除。

## 后续扩展

后续可以增加：

- Web 端草稿审核列表。
- 多 Agent 配置。
- 识别调用成本和成功率报表。
- 标签图片自动裁切和质量评分。
- 常见品牌/产品模板库。
- 营养档案版本对比。
- 与独立 `NutritionFood` 库的确认映射。
