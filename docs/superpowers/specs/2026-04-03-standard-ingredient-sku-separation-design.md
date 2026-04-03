# 标准原料下拆分生产采购 SKU 与家庭 DIY 推荐 SKU 设计

## 背景

当前项目已经形成了以下主链路：

- 食谱中的 `RecipeItem` 直接关联标准原料 `Ingredient`
- DIY 制作单页面会按原料批量查询 `recommended_product` 并向用户展示推荐商品
- 采购清单生成与库存补货建议也会复用 `recommended_product` 为采购项补充“建议商品”

现状的问题是，DIY 推荐商品和生产采购商品被放在同一套数据模型里，导致：

- 面向员工采购的字段和面向用户推荐的字段混杂
- 采购侧与用户侧会共享一组排序、启停和默认匹配逻辑
- 同一标准原料下无法清晰维护两套不同用途的 SKU

业务上已经明确：

- 食谱里录入的是标准原料，不直接录入 SKU
- 员工采购时可选择的是适用于采购/生产的 SKU 级商品
- 用户在 DIY 制作单中看到的推荐商品是适用于个人家庭制作的 SKU 级商品
- 现有 `recommended_product` 老数据默认视为家庭 DIY 推荐 SKU 数据

## 目标

1. 保持“食谱只关联标准原料”的建模不变
2. 在同一个标准原料下，分别维护两套独立 SKU 列表：
   - 生产采购 SKU
   - 家庭 DIY 推荐 SKU
3. 采购清单生成、库存补货建议、采购记录录入只使用生产采购 SKU
4. DIY 制作单推荐商品只使用家庭 DIY 推荐 SKU
5. 现有 `recommended_product` 数据不迁移表结构，直接保留给 DIY 使用
6. 兼容历史采购单和历史采购记录展示，不要求回填新 SKU

## 非目标

- 不改变食谱与标准原料的关系
- 不在本次改造中实现“同一物理 SKU 同时复用到两个场景”的共享建模
- 不强制重命名现有 `recommended_product` 数据表
- 不要求一次性清理所有现有命名中的 `suggestedProduct` 历史包袱；本次优先修正采购链路中的核心命名和数据来源

## 现状分析

### 标准原料与食谱

- `RecipeItem.ingredientId -> Ingredient.id`
- 食谱编辑与保存逻辑已经围绕标准原料运作
- 这部分关系满足业务预期，无需改变

### 家庭 DIY 推荐商品

- `RecommendedProduct` 当前已经支持图片、购买链接、展示单位、有效成分等用户侧展示字段
- 小程序 DIY 页 `/recommended-products` 当前按原料查询该表
- 这套结构天然更接近“家庭 DIY 推荐 SKU”

### 采购侧建议商品

- `PurchasingService.enrichRequirementsWithRecommendedProducts()` 当前会从 `RecommendedProductService.batchFindActive()` 中选商品
- `PurchaseItem` 当前只保存：
  - `suggestedProductId`
  - `suggestedProductName`
  - `purchaseChannel`
  - `productModel`
- 员工录采购记录时仍然以原料为核心，只是借用了上面的建议商品名称和渠道/型号

这意味着采购侧目前没有真正独立的 SKU 模型，只是把 DIY 推荐商品“借来当采购建议”。

## 总体方案

采用“同一标准原料下维护两套独立 SKU 列表”的方案：

- 保留 `Ingredient` 作为唯一标准原料实体
- 保留 `RecommendedProduct`，但业务语义明确为“家庭 DIY 推荐 SKU”
- 新增 `ProcurementSku` 模型，专门服务生产采购场景
- 采购链路中的建议商品、默认渠道、默认型号、默认参考价格从 `ProcurementSku` 获取
- DIY 链路中的推荐商品只从 `RecommendedProduct` 获取

最终关系如下：

- `Ingredient -> RecipeItem`
- `Ingredient -> RecommendedProduct (家庭 DIY 推荐 SKU)`
- `Ingredient -> ProcurementSku (生产采购 SKU)`
- `ProcurementSku -> PurchaseItem/PurchaseRecord` 通过快照字段保留关联痕迹

## 数据模型设计

### 1. 保留现有 DIY 推荐 SKU

保留 Prisma 模型：

- `RecommendedProduct`

业务语义改为：

- 仅用于家庭 DIY 推荐商品
- 管理端原料页将其展示为“家庭 DIY 推荐 SKU”
- 用户侧 `/recommended-products` 查询结果只返回该模型

本次不改表名 `recommended_product`，避免引入不必要迁移风险。

### 2. 新增生产采购 SKU 模型

新增 Prisma 模型：

- `ProcurementSku`

建议字段：

- `id: String @id @default(uuid())`
- `ingredientId: String`
- `name: String`
- `brand: String?`
- `productModel: String?`
- `purchaseChannel: String?`
- `referencePricePerPurchaseUnit: Decimal?`
- `displayUnit: String?`
- `notes: String?`
- `isActive: Boolean @default(true)`
- `sortOrder: Int @default(0)`
- `createdAt: DateTime`
- `updatedAt: DateTime`

关系：

- `ingredientId -> Ingredient.id`
- `Ingredient.procurementSkus: ProcurementSku[]`

字段语义：

- `name`：采购侧商品名称
- `brand`：品牌
- `productModel`：型号/规格文本
- `purchaseChannel`：推荐采购渠道
- `referencePricePerPurchaseUnit`：参考采购单价，用于采购端默认展示和后续估算扩展
- `displayUnit`：采购端展示单位标签，优先用于 UI 展示，不替代原料的基础换算逻辑
- `notes`：采购备注

### 3. 采购清单与采购记录快照字段

#### `PurchaseItem`

新增字段：

- `procurementSkuId: String?`
- `procurementSkuName: String?`

保留现有字段：

- `purchaseChannel`
- `productModel`
- `displayUnit`

设计原因：

- 采购单需要保留“当时建议的是哪条生产采购 SKU”
- 同时继续快照保存渠道、型号、显示单位，避免 SKU 后续被修改后影响历史单据展示

#### `PurchaseRecord`

新增字段：

- `procurementSkuId: String?`
- `procurementSkuName: String?`

保留现有字段：

- `purchaseChannel`
- `productModel`
- `actualCost`
- 数量归一化字段

设计原因：

- 员工实际采购记录需要能够指向所选生产采购 SKU
- 但实际采购金额、渠道、规格仍然以实际录入值为准

## 后端服务与查询逻辑

### 1. DIY 链路

保留现有用户侧接口：

- `GET /api/v1/recommended-products`

规则：

- 只查询 `RecommendedProduct`
- 只返回启用中的家庭 DIY 推荐 SKU
- 不参与采购建议逻辑

`RecommendedProductService` 的职责重新收口为：

- 家庭 DIY 推荐 SKU CRUD
- 家庭 DIY 推荐 SKU 批量查询

### 2. 采购链路

新增 `ProcurementSkuService`，负责：

- 按原料查询启用中的生产采购 SKU
- 管理端 CRUD
- 为采购服务提供批量查询能力

将 `PurchasingService.enrichRequirementsWithRecommendedProducts()` 重构为基于 `ProcurementSku` 的逻辑，建议命名为：

- `enrichRequirementsWithProcurementSkus()`

规则：

- 生成采购需求时，只从当前原料的启用中生产采购 SKU 中选默认项
- 默认项仍沿用当前“优先匹配渠道、型号，再按排序”的策略
- 如果该原料没有启用的生产采购 SKU，则回退到原料自身：
  - `ingredient.purchaseChannel`
  - `ingredient.productModel`
  - `ingredient.unitDisplayLabel / ingredient.purchaseUnit`
- 回退时 `procurementSkuId` 和 `procurementSkuName` 为空

### 3. 采购记录录入

采购详情页和采购记录新增/编辑接口需要支持：

- 默认展示 `PurchaseItem.procurementSkuId / procurementSkuName`
- 员工可在同原料下改选另一条生产采购 SKU

写入规则：

- 如果员工选择了生产采购 SKU，则写入 `PurchaseRecord.procurementSkuId / procurementSkuName`
- 同时以所选 SKU 的默认渠道/型号初始化表单
- 但员工最终提交的 `purchaseChannel / productModel / actualCost` 以实际输入为准

## 管理端设计

原料编辑页拆成两个独立区块：

### 1. 家庭 DIY 推荐 SKU

沿用现有推荐商品管理区块，名称改为：

- `家庭 DIY 推荐 SKU`

字段保留：

- 名称
- 品牌
- 规格展示/型号
- 推荐链接
- 图片
- `displayUnit`
- 有效成分展示
- 启停
- 排序

数据源：

- `RecommendedProduct`

### 2. 生产采购 SKU

新增并列区块：

- `生产采购 SKU`

字段：

- 名称
- 品牌
- 型号规格
- 采购渠道
- 参考采购单价
- 展示单位
- 备注
- 启停
- 排序

数据源：

- `ProcurementSku`

交互要求：

- 两套列表各自独立新增、编辑、停用、排序
- 两套列表互不联动
- 管理员在同一个标准原料页内即可同时维护两边数据

## 接口设计

### 1. 家庭 DIY 推荐 SKU

保留：

- `GET /admin/ingredients/:ingredientId/recommended-products`
- `POST /admin/ingredients/:ingredientId/recommended-products`
- `PUT /admin/ingredients/:ingredientId/recommended-products/:id`
- `DELETE /admin/ingredients/:ingredientId/recommended-products/:id`

语义更新为：

- 仅维护家庭 DIY 推荐 SKU

### 2. 生产采购 SKU

新增：

- `GET /admin/ingredients/:ingredientId/procurement-skus`
- `POST /admin/ingredients/:ingredientId/procurement-skus`
- `PUT /admin/ingredients/:ingredientId/procurement-skus/:id`
- `DELETE /admin/ingredients/:ingredientId/procurement-skus/:id`

### 3. 采购端接口返回

采购相关接口的响应中新增或切换为采购 SKU 快照字段：

- `procurementSkuId`
- `procurementSkuName`

保留历史兼容字段一段时间：

- `suggestedProductId`
- `suggestedProductName`

兼容策略：

- 后端在过渡期内可同时返回两套字段，其中旧字段值与新字段保持一致
- 采购端前端完成切换后，再移除旧字段

## 前端与小程序行为

### 1. 食谱

- 继续只选择标准原料
- 不暴露任何 SKU 选择能力

### 2. DIY 制作单

- 继续按原料 ID 批量加载推荐商品
- 但接口只返回家庭 DIY 推荐 SKU
- 页面购买入口继续使用推荐链接与用户侧展示字段

### 3. 采购清单预览与详情

- “建议商品”展示改为生产采购 SKU 名称
- 默认渠道/型号来自生产采购 SKU
- 若未配置生产采购 SKU，则回退到原料自身渠道/型号

### 4. 库存补货页

- 当前“推荐商品”展示改为生产采购 SKU
- 补货单创建时写入采购 SKU 快照

### 5. 采购记录表单

- 表单默认带出采购项绑定的生产采购 SKU
- 允许在同原料的生产采购 SKU 列表内切换
- 提交时保存实际采购渠道、规格、金额，同时记录选中的采购 SKU 快照

## 迁移与兼容策略

### 1. 老数据归类

- 现有 `recommended_product` 全部默认归入“家庭 DIY 推荐 SKU”
- 不自动生成任何生产采购 SKU

### 2. 历史采购数据

- 历史 `PurchaseItem` 和 `PurchaseRecord` 不做强制回填
- 旧单继续按已有快照字段展示
- 新生成采购单与新采购记录开始写入采购 SKU 快照字段

### 3. 平滑上线

按以下原则兼容：

- DIY 查询只读 `recommended_product`
- 采购查询只读 `procurement_sku`
- 未配置生产采购 SKU 的原料仍可继续采购，不阻断业务

## 测试策略

### 后端

- `RecommendedProductService` 仅返回家庭 DIY 推荐 SKU
- `ProcurementSkuService` 正常 CRUD 与批量查询
- `PurchasingService` 只会从 `ProcurementSku` 选择采购建议
- 当没有生产采购 SKU 时，采购需求会正确回退到原料默认渠道/型号
- `PurchaseItem` 与 `PurchaseRecord` 能正确写入采购 SKU 快照

### 控制器

- 用户侧 `/recommended-products` 不返回生产采购 SKU
- 管理端 `/procurement-skus` CRUD 行为正确
- 采购清单详情、补货建议、采购记录接口能返回采购 SKU 快照

### 前端/小程序

- 原料编辑页可分别维护两套 SKU
- DIY 制作单只展示家庭 DIY 推荐 SKU
- 采购清单、库存补货、采购记录表单只使用生产采购 SKU
- 历史采购单在未回填情况下仍可正常显示

## 风险与控制

### 风险 1：采购端与 DIY 端混用旧字段名

控制：

- 采购链路明确引入 `procurementSkuId/procurementSkuName`
- 过渡期保留旧字段镜像值，减少一次性切换风险

### 风险 2：部分原料尚未配置生产采购 SKU

控制：

- 明确保留原料自身渠道/型号回退逻辑
- 管理端后续可通过运营逐步补全采购 SKU

### 风险 3：管理端改造面较大

控制：

- 家庭 DIY 推荐 SKU 区块尽量复用现有推荐商品管理代码
- 新增生产采购 SKU 区块时只引入采购侧需要的字段和接口

## 最终决策

本次采用以下明确方案：

- 标准原料继续作为食谱唯一原料实体
- 现有 `recommended_product` 保留并重新定义为家庭 DIY 推荐 SKU
- 新增 `procurement_sku` 作为生产采购 SKU 数据源
- 管理端在同一标准原料下维护两个独立区块
- 采购单与采购记录新增采购 SKU 快照字段
- 老的 `recommended_product` 数据全部默认归入家庭 DIY 推荐 SKU
- 历史采购数据不做强制回填，新数据开始使用采购 SKU
