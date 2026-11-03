# 营养档案数据结构审查

日期：2026-05-11

## 审查结论

这件事有必要先做。当前 `NutritionProfileV2` 的方向是正确的：它不直接照搬 USDA、AAFCO、FEDIAF 或 NRC 的表格，而是建立了一个内部营养档案结构，再由来源导入和配方合规层去做映射与换算。

但当前结构还不适合立刻批量确认 USDA 候选并写入 `Ingredient.nutritionProfile`。主要原因不是已有数据过不了格式校验，而是字段命名、单位语义、来源类型、标准版本和补剂剂量基准还没有形成一个足够稳定的“营养数据契约”。如果现在直接入库，后续接 CFCT、其他国家数据库、产品标签 OCR、AAFCO/FEDIAF/NRC 合规计算时，很可能要回头重洗数据。

建议下一步先做一个小的“营养数据契约收敛”改造，再开始确认 50 条高置信 USDA 候选。

## 本次审查范围

本地代码：

- `backend/src/domain/ingredient/types.ts`
- `backend/src/domain/ingredient/nutrition-field-catalog.ts`
- `backend/src/domain/nutrition-governance/usda-nutrient-map.ts`
- `backend/src/domain/nutrition-governance/nutrition-profile-contract.ts`
- `backend/src/domain/nutrition-governance/nutrition-governance.types.ts`
- `backend/src/application/nutrition-food/nutrition-food.service.ts`
- `backend/src/domain/ingredient/supplement-targets.ts`
- `backend/prisma/schema.prisma`
- `backend/prisma/seed-nutrition-standards.ts`
- `admin-web/src/constants/ingredientNutrition.ts`
- `admin-web/src/utils/ingredientNutrition.ts`
- `admin-web/src/utils/ingredientNutritionUnits.ts`
- `admin-web/src/types/ingredient.ts`
- `miniapp/src/utils/supplement-nutrients.ts`

外部参照：

- USDA FoodData Central 下载与数据说明：`https://fdc.nal.usda.gov/download-datasets/`、`https://fdc.nal.usda.gov/data-documentation/`
- USDA Foundation Foods 文档：`https://fdc.nal.usda.gov/Foundation_Foods_Documentation/`
- FEDIAF Nutritional Guidelines 2025：`https://www.europeanpetfood.org/wp-content/uploads/2025/09/FEDIAF-Nutritional-Guidelines_2025.pdf`
- FEDIAF 2025 发布说明：`https://europeanpetfood.org/_/news/fediaf-publishes-2025-nutritional-guidelines-for-cats-and-dogs/`
- FDA 对 AAFCO Nutrient Profiles 的说明：`https://www.fda.gov/animal-veterinary/animal-health-literacy/complete-and-balanced-pet-food`
- AAFCO calorie / dry matter 说明：`https://www.aafco.org/resources/startups/calorie-content/`
- NRC 2006：`https://www.nationalacademies.org/publications/10668`

## 关键判断

### 1. 原料入库结构不应采用 USDA、AAFCO、FEDIAF 或 NRC 的原始结构

USDA/CFCT/其他食物成分表是“来源数据库”；AAFCO/FEDIAF/NRC 是“配方评价标准”。它们的单位、表结构和目标不同：

- USDA FoodData Central 是食物成分数据源，下载数据以食物、营养素、单位和来源元数据组织，Foundation Foods 并不保证每个食物都有所有营养素。
- AAFCO/FEDIAF/NRC 主要用于判断完整配方是否满足犬猫生命阶段需求，常见表达是干物质基础、每 1000 kcal ME、每 MJ ME、最小值、最大值、合法上限或营养上限。
- 原料库需要保存“原料原样/as-fed、每 100g 可食部或补剂每份/每 g”的可计算数据；标准层再把配方总量换算成每 1000 kcal ME 或 dry matter。

因此，内部标准应是项目自己的 `NutritionProfileV2`，但它必须有明确字段契约、单位契约和来源契约。

### 2. 当前 `NutritionProfileV2` 方向正确，但来源类型没有统一

后端 `NutritionMeta.sourceType` 允许 `LAB_REPORT`、`LABEL`、`LITERATURE`、`SUPPLIER`、`MANUAL_ESTIMATE`、`USDA`、`CFCT`、`SUPPLEMENT_LABEL`、`MANUAL`。这是比较合理的方向。

问题是治理表的 Prisma 枚举只有：

- `USDA`
- `CFCT`
- `SUPPLEMENT_LABEL`
- `MANUAL`

管理端表单又只有：

- `CFCT`
- `USDA`
- `LABEL`
- `LAB_REPORT`
- `LITERATURE`
- `MANUAL_ESTIMATE`

这会造成三个后果：

- 接 Canadian Nutrient File、AUSNUT、日本食品标准成分表等来源时，要改枚举或塞进 `MANUAL`。
- 同一个概念在不同层叫法不同：`LABEL` 与 `SUPPLEMENT_LABEL`，`MANUAL` 与 `MANUAL_ESTIMATE`。
- 前端手工录入时无法完整保存 `sourceTitle`、`sourceProvider`、`confidenceLevel`，因为编辑器没有入口，payload 也没有带这些字段。

建议改成来源注册模型：

- `sourceKind`：`FOOD_DATABASE`、`PRODUCT_LABEL`、`LAB_REPORT`、`SUPPLIER_SPEC`、`LITERATURE`、`MANUAL_ESTIMATE`
- `sourceCode`：`USDA_FDC`、`CFCT`、`CNF`、`AUSNUT`、`NEVO`、`JP_FOOD_TABLE`、`SUPPLEMENT_LABEL`
- `sourceVersion`：例如 `USDA_FDC_2026_04`、`FEDIAF_2025`
- `sourceProvider`：例如 `USDA FoodData Central`
- `externalId`：来源库主键，例如 USDA FDC ID

Prisma 层不应该每新增一个国家数据库就改 enum。更稳的是保留少量 `sourceKind` enum，把具体数据库放在 `sourceCode` 字符串或来源注册表里。

### 3. 维生素 A/D/E 目前可以录入，但“活性单位”的语义要收紧

当前字段目录使用：

- `vitamins.vitaminA`：`IU`
- `vitamins.vitaminD`：`IU`
- `vitamins.vitaminE`：`IU`

这与 FEDIAF/AAFCO 的配方标准比较友好，因为这些标准表常使用 IU 表达 A/D/E。但这三个字段不能只写“普通 IU”，必须明确转换语义。

现状：

- 管理端已经对维生素 A 区分视黄醇、乙酸酯、丙酸酯、棕榈酸酯、犬 β-胡萝卜素。
- 管理端已经对维生素 E 区分天然 d-alpha-tocopherol 与合成 dl-alpha-tocopheryl acetate。
- USDA 导入把 `Vitamin D (D2 + D3)` 的 `µg` 乘以 40 转成 IU。
- USDA 导入把 `Vitamin E (alpha-tocopherol)` 的 mg 乘以 `1 / 0.67` 转成 IU。

需要补齐的地方：

- 禁止保存含糊的 `IU_GENERIC`。录入界面可以显示 IU，但转换时必须知道化学形式。
- 对 USDA 来源的维生素 E，记录这是 `alpha-tocopherol mg -> natural vitamin E IU` 的换算，不要只留下一个 IU 数值。
- 对产品标签，保存原始标签单位、原始化学形式和转换说明。OCR 识别出来的值必须能追溯到“包装写的是 mg 乙酸酯，系统换算成多少 IU”。
- 对维生素 A，可以继续以 `vitaminA` 存 `IU vitamin A activity`，但建议新增字段元数据 `canonicalUnitBasis`，例如 `vitamin_a_activity_iu`，避免把 RAE、retinol mg、beta-carotene mg 混成一个无来源的 IU。

短期可以保留 A/D/E 的 canonical unit 为 IU；不要马上改成 USDA 的 RAE 或 mg alpha-tocopherol。真正需要做的是把 conversion basis 和 provenance 保存下来。

### 4. 字段目录是好的开端，但还不够承担“标准匹配”

当前字段目录覆盖宏量、矿物质、维生素、脂肪酸和氨基酸。它适合做后台录入，但还不够直接做 FEDIAF/AAFCO/NRC 合规匹配。

具体问题：

- `macros.fiber` 目前接 USDA `Fiber, total dietary`，但宠物标准和标签中常见的是 `crude fiber`。膳食纤维和粗纤维不能长期混用。
- `macros.crudeProtein` 接 USDA `Protein`。USDA protein 是食品成分口径，宠物标准/标签常写 crude protein，需要明确这是可用于计算的近似映射，还是要拆成 `protein` 与 `crudeProtein`。
- `fattyAcids.epa`、`dpa`、`dha` 后端单位是 mg，但管理端把 `EPA+DHA` 合并后写成 unit `g`，值却没有除以 1000，这是一个明确的单位风险。
- `methionine + cystine`、`phenylalanine + tyrosine`、`EPA + DHA`、`Ca/P ratio` 是标准中的派生项，不应该直接作为普通入库字段，但标准计算器必须支持派生公式。
- USDA 映射目前只映射了 `leucine` 一个氨基酸。如果要对 NRC/FEDIAF/AAFCO 做完整氨基酸评价，USDA 氨基酸映射需要扩展。
- 氯、碘、维生素 K、维生素 C、花生四烯酸、EPA/DHA 等字段需要逐一决定是否从 USDA/CFCT 主动映射，或是否只允许标签/检测来源补齐。

建议把字段目录升级为唯一字段契约，字段定义至少包含：

- `fieldPath`
- 中文名、英文名
- canonical unit
- quantity kind：mass、energy、activity IU、ratio
- canonical basis：默认 `PER_100_G_AS_FED_EDIBLE_PORTION`
- source aliases：USDA nutrient ID、CFCT 字段名、标签同义词
- allowed display units
- conversion policy
- whether derived：是否派生项
- derived formula：派生项公式
- standard applicability：是否用于 AAFCO/FEDIAF/NRC

### 5. 旧 `NutritionFood` 路线和新治理路线存在“双口径”

当前有两套营养数据路线：

- 新路线：`NutritionSourceRecord.normalizedNutrition`、`IngredientNutritionCandidate.normalizedNutrition`、`Ingredient.nutritionProfile` 使用 `NutritionProfileV2`。
- 旧路线：`NutritionFood.nutritionData` 是自由 JSON，`NutritionFoodService.parseUSDANutrients()` 生成 `protein_g`、`vitamin_a_iu` 这类扁平字段。

旧路线中还发现了 USDA nutrient ID 风险：

- `1102` 实际是 `Molybdenum, Mo`，不是 manganese。
- `1106` 实际是 `Vitamin A, RAE`，不是 selenium。
- `1103` 实际是 selenium，不是 iodine。
- `1213` 实际是 leucine，不是 folate。
- 本地 USDA JSON 中 iodine 是 `1100 Iodine, I µg`。

这说明旧 `parseUSDANutrients()` 不应再作为后续入库或配方设计的数据入口。否则同一个 USDA 食物可能在 `NutritionProfileV2` 与 `NutritionFood.nutritionData` 中得到不同营养值。

建议：

- 停止新增旧扁平 `nutritionData`。
- 让 `NutritionFood.nutritionData` 也迁移/约束为 `NutritionProfileV2`，或让 `NutritionFood` 指向已确认的 `NutritionSourceRecord`。
- 设计配方 `DesignRecipeItem.nutritionFoodId` 如果继续依赖 `NutritionFood`，必须保证它读到的是同一个 canonical profile。

### 6. 补剂剂量计算还没有处理 raw basis

后端 `calculateSupplementDose()` 从 `nutritionProfile` 读取某个 field 的 concentration，然后直接用：

```text
requiredAmount = totalNutrientNeeded / concentration * lossRate
```

但它没有读取 `meta.rawBasisType`、`servingWeightG` 或 `PER_100_G/PER_1_G/PER_SERVING`。这意味着：

- 如果补剂录的是“每份 200 IU”，计算结果可以理解成份数。
- 如果补剂录的是“每 100g 200 IU”，计算结果就不是克数，也不是份数。
- 如果补剂录的是“每 1g 200 IU”，计算结果才是克数。

小程序侧也有类似风险：它读取 `nutritionProfile` 中的数值作为 concentration，但不理解 raw basis。

建议：

- 补剂确认时强制把目标营养浓度规范化为 `PER_1_G` 或 `PER_SERVING + servingWeightG`，并在剂量计算中显式换算。
- `SupplementTarget.unit` 只表达营养单位，例如 IU/mg/µg；剂量单位应来自 profile basis 或 display unit。
- OCR 标签解析必须识别 serving size、servings per container、每份含量、每粒含量、每 100g 含量，并在确认前换算到 canonical basis。

### 7. FEDIAF/AAFCO/NRC 标准表需要独立建模，不能继续只有 `NutritionStandardFediaf`

当前项目有：

- `NutritionStandard` enum：`NRC_2006`、`FEDIAF_2021`、`FEDIAF_2024`、`AAFCO_2022`
- `NutritionStandardFediaf` 表：只建模 FEDIAF，且字段是 `nutrientKey`、`unit`、`basis`、adult/puppy min/max。
- `seed-nutrition-standards.ts` 注释写 FEDIAF 2024，但 FEDIAF 官网当前已经发布 2025 版。

结构问题：

- `basis = DM` 与 `unit = g/1000kcal` 同时存在时语义不清。`g/1000kcal ME` 本身不是 dry matter percentage。
- `nutrientKey = protein`、`vitamin_d3` 与 `NutritionProfileV2` 的 `macros.crudeProtein`、`vitamins.vitaminD` 没有显式映射。
- FEDIAF 有不同 MER 假设和不同表：adult dog 95/110 kcal ME/kg^0.75、growth/reproduction、per 100g DM、per 1000 kcal ME、per MJ ME。
- AAFCO 以 dry matter 与 per 1000 kcal ME 口径表达 nutrient profiles；NRC 2006 是更基础的需求来源，不应硬塞进 FEDIAF 表。

建议新建统一标准模型：

- `NutritionStandardSet`：`standardCode`、`version`、`species`、`sourceUrl`、`effectiveDate`
- `NutritionRequirement`：`standardSetId`、`lifeStage`、`energyModel`、`nutrientExpressionKey`、`fieldPath` 或 `formulaKey`、`unit`、`basisType`、`minValue`、`maxValue`、`maxType`、`notes`
- `NutritionRequirementExpression`：处理 `Ca/P ratio`、`methionine+cystine`、`EPA+DHA`、dry matter、per 1000 kcal ME 等派生计算

这样 AAFCO、FEDIAF、NRC 可以共用一套标准层，而不是每个标准建一张表。

## 是否可以批量写入 50 条 USDA 高置信候选？

不建议现在写入 `Ingredient.nutritionProfile`。

可以先做两步安全动作：

1. 把 50 条保持在 `IngredientNutritionCandidate.CONFIRMED_PENDING_CONTRACT` 或等价状态，不写最终 `Ingredient.nutritionProfile`。
2. 先完成“营养数据契约收敛”改造，然后用同一份候选数据重新生成 normalized profile，再写入 `Ingredient.nutritionProfile`。

如果当前状态枚举不想新增，也可以继续让这些候选保持 `CANDIDATE`，只在审查 CSV 中标记“业务审核通过，等待结构契约升级”。

## 建议实施顺序

### 第一步：字段契约收敛

把后端 `nutrition-field-catalog.ts` 升级为唯一字段契约，并让 admin-web、小程序共享或由它生成字段常量。

必须先解决：

- `fiber` 是 dietary fiber 还是 crude fiber。
- `EPA/DHA/EPA+DHA` 的 canonical unit，建议统一 mg。
- A/D/E 的 canonical unit basis 和转换说明。
- 标准派生项不入普通字段，但要有公式。

### 第二步：来源契约收敛

统一 source model：

- 用 `sourceKind + sourceCode + sourceVersion` 取代过窄的 `NutritionGovernanceSourceType`。
- `USDA` 改为 `USDA_FDC` sourceCode，版本记录 `2026-04`。
- `CFCT` 记录具体版本。
- 产品标签与补剂 OCR 使用 `PRODUCT_LABEL` kind，而不是和食物数据库同一个 enum。

### 第三步：USDA 映射修正与扩展

保留新的 `USDA_NUTRIENT_MAP`，停止使用旧 `NutritionFoodService.parseUSDANutrients()`。

修正/扩展：

- 添加 iodine `1100`。
- 添加更多氨基酸映射。
- 添加可用的维生素 K/C、脂肪酸、花生四烯酸、EPA、DHA 映射。
- 为每个映射保存 source nutrient name/unit 与 conversion note。

### 第四步：补剂 OCR/剂量基准

先做数据结构，不急着做完整 OCR：

- 保存 OCR 原文、图片引用、识别字段、原始单位、原始 basis、置信度。
- 确认前把补剂浓度规范化为 `PER_1_G` 或 `PER_SERVING + servingWeightG`。
- 修改剂量计算，让它按 raw basis 换算出克/份/粒。

### 第五步：标准层重建

建立统一的 AAFCO/FEDIAF/NRC 标准模型与计算器：

- 原料 profile：每 100g as-fed/edible portion。
- 配方汇总：按实际用量加权。
- 计算 dry matter、ME、per 1000 kcal ME、ratio、组合项。
- 再与标准表比较。

### 第六步：再写入 50 条 USDA 候选

在字段、来源、USDA 映射、标准层基础结构稳定后，再确认写入：

- `Ingredient.nutritionProfile` 作为当前确认档案快照。
- `NutritionSourceRecord` 保存来源原文和 normalized profile。
- `IngredientNutritionCandidate.confirmationSnapshot` 保存人工确认证据。

## 最小改造清单

若只做防返工的最小版本，建议至少完成：

1. 明确 `NUTRITION_FIELD_CATALOG` 的 canonical unit 和 conversion policy。
2. 修复 `EPA+DHA` 合并单位错误。
3. 禁止旧 USDA 扁平解析继续新增数据。
4. 为来源增加 `sourceCode/sourceVersion/sourceProvider/externalId`，不要让 `USDA/CFCT` enum 承担所有未来来源。
5. 将补剂浓度确认到 `PER_1_G` 或 `PER_SERVING + servingWeightG`。
6. 把 FEDIAF 当前版本更新策略写入标准层，不把 `FEDIAF_2024` 当作永久默认。

## 可以保留的现有设计

- `NutritionProfileV2` 分组结构可以保留。
- `Ingredient.nutritionProfile` 可以作为当前确认营养档案快照保留。
- `NutritionSourceRecord`、`IngredientNutritionCandidate` 的治理流程方向正确。
- `fieldDisplayUnits` 可以保留，但只能用于录入和展示，不能替代 canonical unit。
- `customItems` 可以保留，用于菌株、功能性成分、品牌自定义指标；但不能承载 AAFCO/FEDIAF/NRC 必须计算的核心营养素。

## 结论

当前阶段应先做数据契约，而不是继续逐条确认更多 USDA 候选。最值得先改的是“字段单位契约 + 来源契约 + 补剂 basis + 旧 USDA 扁平路径收口”。做完这些以后，再把已审核通过的 50 条 USDA 候选批量写入正式营养档案，会稳很多。
