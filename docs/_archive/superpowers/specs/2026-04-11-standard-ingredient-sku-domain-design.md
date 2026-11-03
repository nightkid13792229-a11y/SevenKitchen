# 标准原料与 DIY SKU / 采购SKU 解耦及统一营养数据设计

## 背景

当前项目中的原料主数据仍然残留了较多“采购商品信息”和“用户推荐商品信息”，导致以下问题：

- 标准原料、DIY 推荐商品、采购执行商品三种对象的职责混杂
- 食谱、营养、采购、库存、生产执行难以各自对齐到稳定的数据对象
- 之前补剂类原料的营养信息使用了一套单独结构，不利于后续扩展到食材类原料

业务上已经明确，本轮只先解决主数据结构和录入口径，不展开订单页 SKU 选择交互设计。

## 本轮目标

1. 明确标准原料、DIY SKU、采购SKU三类对象的职责边界
2. 明确三类对象各自应录入哪些信息、放在哪个编辑板块
3. 设计一套食材与补剂共用的统一营养数据结构
4. 为后续食谱设计、采购执行、库存拆分和 SKU 方案能力预留扩展空间

## 本轮非目标

- 不展开订单页“用户如何选 SKU”的交互细节
- 不展开 SKU 方案的配置流程
- 不在本轮细化生产批次、效期批次、批号库存
- 不在本轮处理现有生产端原料数据的清理执行顺序

## 核心结论

### 1. 标准原料的定位

标准原料是“逻辑原料定义”和“营养建模对象”，不是采购对象，也不是库存对象。

标准原料负责：

- 定义这是什么原料，例如猪里脊、海藻粉、鱼油
- 作为食谱中 `RecipeItem` 的关联对象
- 持有统一营养数据，用于后续食谱设计、营养计算、配方平衡
- 持有原料级基础属性，例如类型、标准计量单位、标签、业务备注

标准原料不负责：

- 采购渠道
- 品牌
- 商品规格
- 购买链接
- 实际采购成本
- 实际库存数量
- 实际生产领用落点
- 配方比例

备注：配方比例属于食谱中的 `RecipeItem`，不属于标准原料。

### 2. DIY SKU 的定位

DIY SKU 是“用户侧推荐商品”。

DIY SKU 负责：

- 面向微信小程序用户展示推荐购买商品
- 维护商品展示名、品牌、零售规格、图片、购买链接、排序、启停
- 可维护展示用途的营养卖点或商品说明

DIY SKU 不负责：

- 实际采购执行
- 实际库存
- 内部采购成本

### 3. 采购SKU 的定位

采购SKU 是“采购、库存、生产执行对象”。

采购SKU 负责：

- 内部实际采购商品定义
- 品牌、渠道、规格、采购单位、换算关系
- 当前采购成本或参考采购成本
- 真实库存
- 采购记录
- 后续生产领用与库存扣减

### 4. 标准原料与采购SKU的关系

一个标准原料下面可以挂多个采购SKU。

例如：

- 标准原料：猪里脊
- 采购SKU A：山姆猪里脊
- 采购SKU B：盒马猪里脊

库存层面：

- 山姆猪里脊库存单独记录
- 盒马猪里脊库存单独记录
- 标准原料“猪里脊总库存”只能作为自动汇总视图，不单独记账

价格层面：

- 采购SKU是采购成本来源
- 标准原料不是采购成本录入对象

### 5. 标准原料与统一营养数据的关系

食材类原料和补剂类原料共用同一套营养数据结构。

原因：

- 后续希望支持类似 ADF / PDD 的食谱设计能力
- 食谱设计的核心对象应是标准原料，而不是采购SKU
- 如果食材和补剂使用两套完全不同的营养结构，后续食谱设计和营养平衡会变复杂

因此，标准原料应成为统一营养数据的宿主对象。

## 数据对象设计

### 一、标准原料

建议标准原料保留以下字段：

- `id`
- `name`
- `type`
  - `FOOD`
  - `SUPPLEMENT`
  - `PACKAGING`
- `baseUnit`
  - `G`
  - `ML`
  - `PCS`
- `baseUnitDisplayName` 可选
- `tags`
- `notes`
- `nutritionProfile`
- `typeSpecificProperties`

说明：

- `baseUnit` 是营养建模与食谱计算的标准计量单位
- `baseUnitDisplayName` 仅用于标准单位展示别名，不用于采购包装单位表达
- `baseUnitDisplayName` 典型适用场景是 `PCS -> 粒 / 片 / 勺`
- `baseUnitDisplayName` 不得用于表达 `袋 / 包 / 盒 / 斤 / 桶` 这类采购包装概念
- `nutritionProfile` 对 `FOOD` 和 `SUPPLEMENT` 开放，对 `PACKAGING` 默认不录入

建议从标准原料中移出以下字段：

- `brand`
- `productModel`
- `purchaseChannel`
- `purchaseUnit`
- `purchaseToBaseRatio`
- `currentPricePerPurchaseUnit`
- `effectivePricePerPurchaseUnit`
- 任何购买链接信息

### 二、DIY SKU

建议 DIY SKU 包含以下字段：

- `id`
- `ingredientId`
- `name`
- `brand`
- `productModel`
- `displayUnit`
- `imageUrl`
- `purchaseLink`
- `marketingNutritionHighlights` 可选
- `isActive`
- `sortOrder`
- `notes`

说明：

- DIY SKU 的营养信息是展示用途，不是食谱设计的营养主数据
- 如果同一标准原料没有适合用户自购的商品，可以没有 DIY SKU

### 三、采购SKU

建议采购SKU包含以下字段：

- `id`
- `ingredientId`
- `name`
- `brand`
- `purchaseChannel`
- `supplierName` 可选
- `productModel`
- `purchaseUnit`
- `purchaseToBaseRatio`
- `currentPurchasePrice`
- `referencePurchasePrice` 可选
- `isDefault`
- `isActive`
- `notes`

库存相关建议挂在采购SKU或采购SKU库存子对象上：

- `currentStock`
- `stockUnit`
- `safetyStock` 可选
- `reorderPoint` 可选
- `targetStock` 可选

备注：

- 本轮只确定库存归属到采购SKU
- 真实库存账应落在采购SKU
- 标准原料页上展示的总库存只做只读汇总

### 四、统一营养数据

统一营养数据挂在标准原料下。

建议结构为“营养素明细列表”：

- `nutrientCode`
- `nutrientName`
- `value`
- `unit`
- `basisType`
- `basisQuantity`
- `sourceType`
- `sourceName`
- `confidenceLevel`
- `isKeyNutrient`
- `notes`

其中：

- `basisType` 用于描述数值的计量基准
  - `PER_100_G`
  - `PER_100_ML`
  - `PER_1_G`
  - `PER_1_ML`
  - `PER_1_PCS`
- `basisQuantity` 固定由 `basisType` 推导，不单独人工录入
  - `PER_100_G` / `PER_100_ML` -> `100`
  - `PER_1_G` / `PER_1_ML` / `PER_1_PCS` -> `1`

适配方式：

- 食材类原料通常使用 `PER_100_G` 或 `PER_100_ML`
- 补剂类原料通常使用 `PER_1_G`、`PER_1_ML` 或 `PER_1_PCS`

这意味着原先补剂中的“有效成分”不再单独作为孤立结构存在，而是并入统一营养数据。

## 类型专属属性

统一营养数据共用，但类型专属属性仍然保留。

### 食材类专属属性

- `cfctClass`
- `edibleYieldRate`
- `densityGPerMl`
- `mainNutrientsDesc`

### 补剂类专属属性

- `supplementCategory`
- `addTiming`
- `productionLossRate`

### 包材类专属属性

- `isConsumable`
- `linkedItemId`

说明：

- 类型专属属性是业务属性，不是营养素明细
- 食材和补剂共用营养结构，不代表所有业务字段也完全相同

## 编辑板块方案

建议将原料编辑页重构为以下板块：

### 1. 标准原料基础信息

录入：

- 原料名称
- 类型
- 标签
- 标准计量单位
- 标准单位展示别名
- 备注

### 2. 统一营养数据

录入：

- 营养素明细列表
- 计量基准
- 数据来源
- 重点展示标记

适用：

- 食材
- 补剂

### 3. 类型专属属性

根据类型显示不同字段：

- 食材属性
- 补剂属性
- 包材属性

### 4. DIY SKU 列表

录入和维护：

- 用户侧推荐商品
- 图片
- 链接
- 排序
- 启停

### 5. 采购SKU 列表

录入和维护：

- 品牌
- 渠道
- 规格
- 采购单位
- 换算关系
- 成本
- 默认项
- 启停
- 内部备注

### 6. 汇总视图

只读展示：

- 采购SKU数量
- 启用中的采购SKU数量
- 总库存汇总

这些是展示视图，不是录入板块。

## 结构判断原则

后续判断“是否能挂在同一个标准原料下面”，使用以下原则：

- 如果多个商品在营养意义上是同一种原料，可以作为同一标准原料下的多个采购SKU
- 如果多个商品在营养意义上已经不是同一种原料，就必须拆成不同标准原料

例如：

- 山姆猪里脊 / 盒马猪里脊：可以挂在同一标准原料 `猪里脊` 下
- 两种 EPA / DHA 浓度明显不同的鱼油：不建议挂在同一标准原料 `鱼油` 下

这是后续支持食谱设计功能的前提。

## 实施顺序建议

本轮先做结构，不先清理存量数据。

建议顺序：

1. 先确认三类对象的字段归属
2. 先确认统一营养数据结构
3. 先重构后台编辑板块
4. 再进入存量标准原料、DIY SKU、采购SKU的数据整理

## 最终结论

本轮主数据结构应收口为：

- 标准原料：逻辑原料定义 + 统一营养数据
- DIY SKU：用户侧推荐商品
- 采购SKU：采购、库存、生产执行对象

并且：

- 配方比例属于食谱项，不属于标准原料
- 采购成本属于采购SKU，不属于标准原料
- 真实库存属于采购SKU，不属于标准原料
- 标准原料总库存只作为自动汇总视图
- 食材与补剂共用一套营养数据结构
