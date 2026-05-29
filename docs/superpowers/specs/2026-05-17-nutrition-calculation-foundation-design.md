# 营养计算前置底座设计

## 背景

SevenKitchen 正在建设类似 ADF 和 PDD 的犬食谱设计能力。当前已经完成两个关键基础：

- 原料营养数据治理已经有 `Ingredient.nutritionProfile`、`NutritionFood`、`NutritionFoodMapping` 和 USDA/CFCT 数据整理方向。
- FEDIAF 2025 犬标准已经结构化入库，覆盖核心推荐表和 Annex 7.8 汇总表，并通过后台审核。

现在还没有完整的食谱营养计算器。这个阶段不急着做配方算法，而是先把计算器将来要依赖的底座补齐：营养素映射、单位和口径归一化、原料就绪度、标准目标选择、计算输入输出契约，以及 AI Agent 约束模型。

## 目标

1. 固化 FEDIAF 犬标准营养素与现有原料营养档案字段的映射关系。
2. 建立统一单位和口径换算规则，支持后续把配方结果换算到 FEDIAF 标准口径。
3. 在后台可视化每个原料是否已经具备参与 FEDIAF 计算的营养数据。
4. 提供标准目标选择服务，按犬只生命阶段和能量口径返回可用标准目标。
5. 明确定义未来食谱营养计算器的输入输出契约。
6. 建立 AI Agent 自动设计食谱前的约束模型，让后续 Agent 只在明确边界内工作。

## 非目标

- 不在本阶段实现完整食谱配方平衡算法。
- 不在本阶段实现 AI 自动生成食谱。
- 不在本阶段开放小程序端食谱计算界面。
- 不在本阶段替代人工审核营养数据或食谱结果。
- 不在本阶段支持猫标准。
- 不重新解析 FEDIAF PDF；标准数据继续读取已入库的 FEDIAF 2025 犬标准。

## 总体架构

本阶段新增一个“营养计算基础域”，位于原料营养档案、FEDIAF 标准库和未来食谱计算器之间。

```text
Ingredient / NutritionFood
        ↓
营养素解析与字段映射
        ↓
单位与口径归一化
        ↓
原料计算就绪度评估
        ↓
标准目标选择
        ↓
计算器输入输出契约
        ↓
AI Agent 约束模型
```

这个基础域不直接改变食谱业务流程。它先提供可测试、可审计、可复用的服务和后台看板，确保未来食谱计算器读取的数据是明确的、可换算的、可解释的。

## 阶段 1：营养素字典与映射固化

### 目的

把 FEDIAF 2025 犬标准中的内部营养素代码，与 SevenKitchen 现有原料营养档案字段稳定对应。

### 输入

- `NutritionNutrientDefinition`
- `NutritionStandardEntry`
- `Ingredient.nutritionProfile`
- `NutritionFood.nutritionData`
- 现有 `nutrition-field-catalog`
- 现有 `nutrient-value-resolver.ts`

### 设计

以 `NutritionNutrientDefinition` 作为统一营养素字典，每个营养素明确：

- 内部代码，例如 `calcium`、`crudeProtein`、`epaDha`
- 原料档案字段路径，例如 `minerals.calcium`
- 标准默认单位
- 原料默认单位
- 是否直接读取
- 是否派生计算
- 派生表达式
- 是否进入 FEDIAF 合规判定

映射类型分为四类：

- 直接映射：`calcium -> minerals.calcium`
- 组合映射：`epaDha -> fattyAcids.epa + fattyAcids.dha`
- 比值映射：`calciumPhosphorusRatio -> minerals.calcium / minerals.phosphorus`
- 暂不支持映射：记录为 `UNSUPPORTED`，不静默参与计算

### 产物

- 一份完整的 FEDIAF 犬营养素映射审计结果。
- 后端服务可以返回每个标准营养素的解析状态。
- 缺字段、缺表达式、无法换算的营养素会被明确列出。

## 阶段 2：单位与口径归一化

### 目的

把原料营养数据统一换算成未来食谱计算器和 FEDIAF 判定都能使用的口径。

### 基础假设

食材和补剂的正式营养档案优先保留来源原始口径，但参与计算时必须归一化。食材常见为每 100g，补剂可能是每粒、每片、每勺或每份。

### 支持单位

第一阶段覆盖：

- 质量：`g`、`mg`、`ug`
- 能量：`kcal`、`kJ`、`MJ`
- 维生素效价：`IU`
- 比值：`ratio`

维生素 A、D、E 的 IU 换算沿用已有规则，但必须在字段定义中明确营养素类型，避免跨营养素误换算。

### 支持口径

第一阶段覆盖：

- 每 100g 原样食物
- 每 100g 干物质
- 每 1000 kcal ME
- 每 MJ ME

### 换算规则

原料营养档案先统一到“每 100g 原样食物”。未来食谱计算时，按用量汇总出配方总量，再基于配方总能量和总干物质换算到 FEDIAF 口径。

干物质换算依赖水分字段：

```text
dryMatterG = totalWeightG - moistureG
valuePer100gDM = nutrientTotal / dryMatterG * 100
```

能量口径换算依赖配方 ME：

```text
valuePer1000Kcal = nutrientTotal / totalEnergyKcal * 1000
valuePerMJ = nutrientTotal / (totalEnergyKcal * 4.184 / 1000)
```

如果缺少水分或能量，相关口径返回 `MISSING_BASIS`，不使用猜测值。

### 产物

- 单位换算服务。
- 口径换算服务。
- 换算失败原因枚举：缺字段、缺能量、缺水分、单位不支持、表达式不支持。

## 阶段 3：原料营养档案完整度看板

### 目的

让后台能够看到每个原料是否已经准备好参与 FEDIAF 计算，缺哪些关键数据。

### 判断维度

每个原料按以下维度评估：

- 是否有正式 `nutritionProfile`
- 是否有关联 `NutritionFood`
- FEDIAF 营养素覆盖率
- 宏量营养素覆盖率
- 矿物质覆盖率
- 维生素覆盖率
- 脂肪酸覆盖率
- 氨基酸覆盖率
- 是否有能量
- 是否有水分
- 是否有数据来源和确认记录

### 就绪等级

原料就绪度分为四级：

- `READY_FULL`：可以参与完整 FEDIAF 判定。
- `READY_BASIC`：可以参与能量、宏量和部分矿物质计算，但微量营养不完整。
- `PARTIAL`：有部分营养数据，但不足以支撑标准判定。
- `NOT_READY`：没有可计算营养档案。

补剂允许采用不同权重。补剂可能只提供一个或几个活性营养素，只要其活性成分字段清晰、单位和每份重量可换算，就可标记为补剂计算就绪。

### 后台页面

在现有营养治理或原料管理下新增一个“计算就绪度”视图，展示：

- 总原料数
- 完整就绪数
- 基础就绪数
- 部分就绪数
- 未就绪数
- 高频缺失营养素排行
- 原料列表和缺失明细

点击原料可查看：

- 已解析营养素
- 缺失营养素
- 单位换算结果
- 来源字段路径
- 是否影响 FEDIAF 判定

### 产物

- 后端就绪度评估接口。
- Web 管理端只读看板。
- 可导出的缺失清单，供后续补数据。

## 阶段 4：标准目标选择器

### 目的

在没有完整计算器之前，先提供一个稳定服务：根据犬只阶段和能量假设，返回应该使用哪一组 FEDIAF 标准目标。

### 输入

第一阶段输入为显式参数：

- 物种：固定 `DOG`
- 标准版本：默认 `FEDIAF_2025_DOG`
- 生命阶段：
  - `ADULT`
  - `EARLY_GROWTH_UNDER_14_WEEKS`
  - `LATE_GROWTH_FROM_14_WEEKS`
  - `REPRODUCTION`
- 成年犬 MER 口径：
  - `ADULT_MER_95`
  - `ADULT_MER_110`
- 优先标准来源：
  - 默认优先 `ANNEX_7_8`
  - 可回退到核心推荐表

### 输出

目标选择器返回：

- 标准版本
- 匹配的 source table
- life stage
- basis
- 每个营养素的 min、max、recommended
- 单位
- PDF 页码
- footnotes
- 是否已审核

### 规则

Annex 7.8 是未来食谱设计器优先使用的目标表，因为它已经按生命阶段和成年犬 MER 场景整理。核心推荐表用于溯源、复核和缺失时回退。

如果请求成年犬但未传 MER 口径，默认不自动选择，返回 `AMBIGUOUS_TARGET`，要求调用方显式选择 MER 95 或 MER 110。

### 产物

- 标准目标选择后端服务。
- 可测试的目标选择矩阵。
- 后台标准页面可复用该服务展示“实际计算目标”。

## 阶段 5：计算器输入输出契约

### 目的

在实现完整食谱营养计算器前，先固化接口契约，让后续前端、后端、Agent 和测试都围绕同一结构工作。

### 计算请求

未来食谱计算器的输入建议为：

```json
{
  "species": "DOG",
  "standardVersionCode": "FEDIAF_2025_DOG",
  "targetProfile": {
    "lifeStage": "ADULT_MER_110"
  },
  "items": [
    {
      "ingredientId": "ingredient-id",
      "amountG": 100,
      "asFed": true,
      "processingYield": 1
    }
  ],
  "options": {
    "includeIncompleteNutrients": true,
    "basis": ["PER_100G_DRY_MATTER", "PER_1000_KCAL_ME"]
  }
}
```

### 计算响应

输出建议为：

```json
{
  "summary": {
    "totalWeightG": 1000,
    "dryMatterG": 350,
    "totalEnergyKcal": 1250,
    "energyDensityKcalPerKg": 1250
  },
  "nutrients": [
    {
      "code": "calcium",
      "value": 1.2,
      "unit": "g",
      "basisValues": {
        "PER_100G_DRY_MATTER": 0.34,
        "PER_1000_KCAL_ME": 0.96
      },
      "status": "RESOLVED",
      "sourceIngredientIds": ["ingredient-id"]
    }
  ],
  "standardAssessment": [
    {
      "nutrientCode": "calcium",
      "status": "PASS",
      "actualValue": 0.96,
      "minValue": 0.5,
      "maxValue": 2.5,
      "unit": "g",
      "basis": "PER_1000_KCAL_ME",
      "sourceTable": "VII-17c",
      "pdfPage": 75
    }
  ],
  "issues": [
    {
      "code": "MISSING_NUTRIENT",
      "nutrientCode": "iodine",
      "severity": "WARNING"
    }
  ]
}
```

### 状态枚举

营养素解析状态：

- `RESOLVED`
- `MISSING_INPUT`
- `MISSING_BASIS`
- `UNSUPPORTED_UNIT`
- `UNSUPPORTED_EXPRESSION`

标准判定状态：

- `PASS`
- `BELOW_MIN`
- `ABOVE_MAX`
- `NO_STANDARD`
- `NOT_ASSESSABLE`

### 产物

- TypeScript DTO 或接口定义。
- 后端契约测试。
- 后续计算器实现必须满足该契约。

## 阶段 6：AI Agent 约束模型

### 目的

为未来 AI Agent 自动设计食谱定义边界。Agent 不直接“自由发挥”，而是围绕明确的约束、输入、可用动作和验证结果迭代。

### 约束类型

第一阶段定义以下约束：

- 营养标准约束：必须满足 FEDIAF 目标标准。
- 原料可用性约束：只使用计算就绪或允许部分计算的原料。
- 补剂策略约束：哪些营养素允许通过补剂修正。
- 禁用原料约束：过敏、偏好、疾病禁忌。
- 成本约束：总成本或单日成本上限。
- 库存约束：只能使用可采购或有库存原料。
- 工艺约束：加工损耗、出肉率、包装规格。
- 人工审核约束：Agent 只能生成草稿，不能直接发布正式食谱。

### Agent 可用动作

Agent 后续只允许通过结构化动作调整食谱：

- 添加原料
- 移除原料
- 调整克重
- 替换原料
- 添加补剂
- 放弃并输出差距报告

每次动作后必须重新调用计算器契约，读取标准判定结果，再决定下一步。

### 输出

Agent 输出必须包含：

- 食谱草稿
- 营养判定摘要
- 未达标项
- 调整日志
- 使用的标准版本
- 需要人工确认的问题

### 产物

- Agent 约束 DTO。
- Agent 草稿结果 DTO。
- 后续自动设计流程的边界说明。

## 数据流

```text
后台原料营养档案
  -> 字段解析
  -> 单位归一化
  -> 原料就绪度
  -> 未来食谱计算请求
  -> 配方营养汇总
  -> 标准目标选择
  -> FEDIAF 达标判定
  -> 报告和 Agent 反馈
```

本阶段只实现到“字段解析、归一化、就绪度、目标选择、契约和约束定义”。配方营养汇总和自动调整属于下一阶段。

## 错误处理

所有计算前置服务必须显式返回错误原因，不能静默使用默认值。

关键错误包括：

- 缺少营养档案
- 缺少字段映射
- 缺少水分，无法换算干物质
- 缺少能量，无法换算每 1000 kcal ME
- 单位不支持
- 维生素 IU 换算缺少营养素类型
- 成年犬目标缺少 MER 选择
- 标准条目未审核

错误不一定阻止页面展示，但必须阻止系统把结果标记为“完整达标”。

## 后台体验

本阶段后台不做完整食谱设计器，只补两个管理视图：

1. 原料计算就绪度
   展示原料是否可计算、缺失字段、覆盖率和来源。

2. FEDIAF 目标预览
   根据生命阶段和 MER 口径预览实际会使用的标准目标。

这两个页面服务于人工审核和补数据，不面向小程序用户。

## 测试策略

后端测试覆盖：

- FEDIAF 46 个营养素映射完整性。
- 直接映射、组合映射、比值映射。
- g/mg/ug/kcal/MJ/IU 单位换算。
- 缺水分和缺能量时的错误返回。
- 原料就绪度分级。
- 成年犬 MER 95/110 目标选择。
- 未审核标准不能被标记为完整可用。
- 计算器契约样例可以被类型和 schema 校验。

前端测试覆盖：

- 原料就绪度看板可加载。
- 缺失字段展示正确。
- 筛选 READY/PARTIAL/NOT_READY 正常。
- FEDIAF 目标预览切换生命阶段和 MER 口径正常。

验收测试覆盖：

- 至少选择 3 个食材原料和 2 个补剂原料做就绪度样例。
- 至少验证成年犬 MER 95、成年犬 MER 110、早期生长、晚期生长和繁殖 5 类目标。
- 后台能导出缺失营养素清单。

## 实施顺序

1. 后端补齐营养素映射审计服务。
2. 后端补齐单位和口径归一化服务。
3. 后端实现原料就绪度评估。
4. Web 管理端增加原料就绪度只读看板。
5. 后端实现 FEDIAF 目标选择器。
6. Web 管理端增加 FEDIAF 目标预览。
7. 定义计算器输入输出 DTO 和 schema。
8. 定义 Agent 约束 DTO 和草稿输出 DTO。
9. 增加测试和验收文档。

## 成功标准

- FEDIAF 2025 犬标准中的所有已审核营养素都能给出映射状态。
- 原料营养档案可以被批量评估计算就绪度。
- 后台可以清楚看到哪些原料已经可用于 FEDIAF 计算，哪些还缺数据。
- 目标选择器能稳定返回 Annex 7.8 中对应生命周期和 MER 口径的标准目标。
- 未来食谱计算器的请求和响应契约明确，后续可以在此基础上实现计算器。
- AI Agent 的输入、动作和输出边界明确，后续不会绕过营养计算和人工审核。

