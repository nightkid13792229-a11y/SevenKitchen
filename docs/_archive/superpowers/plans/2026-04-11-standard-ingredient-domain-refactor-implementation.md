# 标准原料 / DIY SKU / 采购SKU 解耦与统一营养数据实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 来按任务执行本计划。步骤统一使用 `- [ ]` 复选框格式追踪。

**Goal:** 在现有“半解耦”基础上，完成标准原料、DIY SKU、采购SKU三类对象的职责收口，并为食材/补剂共用的统一营养数据打底；同时让采购与库存逐步从“标准原料持有”迁移到“采购SKU持有”，但不在本轮展开人工原料清洗和订单页 SKU 交互。

**Architecture:** 保留 `ingredient` 作为逻辑原料与营养建模对象，继续使用 `recommended_product` 承载 DIY 推荐商品、使用 `procurement_sku` 承载采购执行商品；通过增量 schema 迁移补齐 `ingredient.nutritionProfile`、丰富 `procurement_sku` 的采购/库存字段，并以“兼容读写 -> 消费端切换 -> 清理旧字段”的顺序完成迁移，避免一次性硬切。

**Tech Stack:** NestJS + Prisma + Jest、Vue 3 + Element Plus admin-web、uni-app Vue 3 miniapp

---

## 本计划覆盖范围

- 标准原料字段归属重构
- DIY SKU 与采购SKU字段归属重构
- 食材/补剂统一营养数据结构落地
- 管理端编辑页与类型定义更新
- 员工端采购/库存接口逐步切到采购SKU口径
- 兼容历史数据的自动迁移与双读策略

## 本计划明确不覆盖

- 订单页“用户如何选择 SKU”的交互设计
- SKU 方案能力
- 厨房生产任务中“实际扣减到哪一个采购SKU”的交互分配
- 现有生产端原料的人工合并、重录、归档执行

## 当前现状判断

- `procurement_sku`、`recommended_product` 已经存在，但仍只是第一轮拆分，字段和消费链路都不完整。
- `ingredient` 仍保留大量采购字段：品牌、规格、渠道、采购单位、换算倍数、采购单价、安全库存、补货点、目标库存等。
- 标准原料编辑页虽然已经出现“DIY 推荐商品”和“生产采购 SKU”区块，但标准原料主表单仍在维护采购信息。
- 采购与库存链路仍然高度依赖 `ingredient`，尤其是 `purchasing.service.ts`、`inventory.service.ts`、`prisma-inventory.repository.ts` 仍以 `ingredientId` 和 `deltaG` 为核心。
- 补剂营养信息仍是 `properties.active_nutrients` 这套专用结构，尚未升级为所有原料共用的统一营养模型。
- 小程序员工端采购/库存 API 已经开始兼容 `procurementSku`，但仍保留大量从 `ingredient` 兜底的旧逻辑。

## 迁移原则

1. 先增量建模，再切换消费，再清理旧字段。
2. 只做机器可安全迁移的数据搬运，不做人工判断型的数据清洗。
3. 历史采购记录、库存流水、采购单快照必须保留可追溯信息，不能因为解耦而丢失历史展示能力。
4. 标准原料的“总库存”只作为汇总视图，不再成为库存账的真实归属。
5. 统一营养数据以标准原料为宿主；DIY SKU 上的营养信息仅作展示用途，不再作为营养计算主来源。

---

## 文件结构

### Backend: schema、domain、service、repository

- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<timestamp>_ingredient_domain_foundation/migration.sql`
- Create: `backend/prisma/migrations/<timestamp>_procurement_sku_inventory_refactor/migration.sql`
- Create: `backend/prisma/backfill-ingredient-domain-foundation.ts`
- Modify: `backend/src/domain/ingredient/types.ts`
- Modify: `backend/src/domain/ingredient/ingredient.entity.ts`
- Modify: `backend/src/application/ingredient/ingredient.service.ts`
- Modify: `backend/src/application/ingredient/recommended-product.service.ts`
- Modify: `backend/src/application/ingredient/procurement-sku.service.ts`
- Modify: `backend/src/infrastructure/repositories/prisma-ingredient.repository.ts`
- Modify: `backend/src/application/purchasing/purchasing.service.ts`
- Modify: `backend/src/domain/purchasing/purchase-item.entity.ts`
- Modify: `backend/src/domain/purchasing/purchase-record.entity.ts`
- Modify: `backend/src/infrastructure/repositories/prisma-purchase-list.repository.ts`
- Modify: `backend/src/infrastructure/repositories/prisma-purchase-record.repository.ts`
- Modify: `backend/src/domain/inventory/inventory-ledger-entry.entity.ts`
- Modify: `backend/src/domain/inventory/inventory-adjustment.entity.ts`
- Modify: `backend/src/domain/inventory/inventory-stocktake.entity.ts`
- Modify: `backend/src/domain/inventory/inventory.repository.ts`
- Modify: `backend/src/application/inventory/inventory.service.ts`
- Modify: `backend/src/infrastructure/repositories/prisma-inventory.repository.ts`
- Modify: `backend/src/interfaces/controllers/recommended-product.controller.ts`
- Modify: `backend/src/interfaces/controllers/procurement-sku.controller.ts`
- Modify: `backend/src/interfaces/controllers/staff-purchasing.controller.ts`
- Modify: `backend/src/interfaces/controllers/staff-inventory.controller.ts`

### Backend tests

- Create: `backend/tests/application/ingredient/ingredient-domain-refactor.spec.ts`
- Modify: `backend/tests/application/ingredient/recommended-product.service.spec.ts`
- Modify: `backend/tests/application/ingredient/procurement-sku.service.spec.ts`
- Create: `backend/tests/application/purchasing/purchasing-procurement-sku.spec.ts`
- Create: `backend/tests/application/inventory/inventory-procurement-sku.spec.ts`
- Modify: `backend/tests/interfaces/controllers/recommended-product.controller.spec.ts`
- Modify: `backend/tests/interfaces/controllers/procurement-sku.controller.spec.ts`

### Admin web

- Modify: `admin-web/src/types/ingredient.ts`
- Modify: `admin-web/src/api/ingredients.ts`
- Modify: `admin-web/src/views/Ingredients/IngredientForm.vue`
- Modify: `admin-web/src/views/Ingredients/index.vue`

### Miniapp

- Modify: `miniapp/src/api/purchasing.ts`
- Modify: `miniapp/src/api/inventory.ts`
- Modify: `miniapp/src/pages/staff-purchasing/preview.vue`
- Modify: `miniapp/src/pages/staff-purchasing/detail.vue`
- Modify: `miniapp/src/pages/staff-purchasing/stock-create.vue`
- Modify: `miniapp/src/pages/staff-purchasing/record-form.vue`
- Modify: `miniapp/src/pages/staff-inventory/index.vue`
- Modify: `miniapp/src/pages/staff-inventory/stocktake-create.vue`

---

## Task 1: 建立新的标准原料领域模型，并保留兼容读写

**Files:**

- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<timestamp>_ingredient_domain_foundation/migration.sql`
- Create: `backend/prisma/backfill-ingredient-domain-foundation.ts`
- Modify: `backend/src/domain/ingredient/types.ts`
- Modify: `backend/src/domain/ingredient/ingredient.entity.ts`
- Modify: `backend/src/application/ingredient/ingredient.service.ts`
- Modify: `backend/src/infrastructure/repositories/prisma-ingredient.repository.ts`
- Create: `backend/tests/application/ingredient/ingredient-domain-refactor.spec.ts`

- [ ] **Step 1: 先写新的领域契约测试，锁定标准原料字段边界**

  覆盖以下断言：

  - `Ingredient` 创建/更新时不再要求采购字段必填。
  - `Ingredient` 暴露 `baseUnit` 与可选的 `baseUnitDisplayName`，不再把 `袋 / 包 / 盒 / 斤` 这类采购包装当作标准单位展示名。
  - `nutritionProfile` 成为标准原料的统一营养主结构。
  - `properties` 只保留类型专属属性，不再塞补剂专用的 `active_nutrients` 主逻辑。

- [ ] **Step 2: 在 Prisma 层为标准原料补齐新字段，但暂不删除旧采购字段**

  推荐采用“增量列 + 延后清理”的方式：

  - 为 `ingredient` 增加 `nutrition_profile`（JSON）
  - 如需命名统一，可保留数据库列 `unit_display_label`，但在 TypeScript 契约中映射为 `baseUnitDisplayName`
  - 保留现有采购字段若干版本作为兼容字段，避免一次性切断采购/库存链路

  这里不要在第一步 migration 中直接 drop 以下列：

  - `brand`
  - `product_model`
  - `purchase_channel`
  - `purchase_unit`
  - `purchase_to_base_ratio`
  - `current_price_per_purchase_unit`
  - `effective_price_per_purchase_unit`
  - `safety_stock`
  - `reorder_point`
  - `target_stock`

- [ ] **Step 3: 把补剂旧营养结构平滑映射到统一营养结构**

  新的统一营养结构至少包含：

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

  自动迁移只做“可安全推导”的部分：

  - 将 `properties.active_nutrients` 转成 `nutritionProfile.items`
  - 补剂的 `category_type`、`add_timing`、`production_loss_rate` 保留在类型专属属性
  - 食材保留 `cfct_class`、`edible_yield_rate`、`density_g_per_ml`、`main_nutrients_desc`

- [ ] **Step 4: 改造 Ingredient service / repository 的输入输出契约**

  目标是：

  - 管理端提交标准原料时只传基础信息、统一营养数据、类型专属属性
  - 仓储层对外返回新结构
  - 若数据库中旧采购字段仍存在，仅作为兼容读取，不再作为标准原料编辑入口主数据

- [ ] **Step 5: 提供一次性 backfill 脚本，迁移机器可判定的数据**

  这个脚本只做低风险搬运：

  - `unit_display_label -> baseUnitDisplayName`
  - `properties.active_nutrients -> nutritionProfile`
  - 为缺失 `nutritionProfile` 的补剂生成基础营养档案骨架

  不在脚本中做：

  - 合并重名原料
  - 判断两个原料是否应共用一个标准原料
  - 重新录入品牌/渠道/规格

---

## Task 2: 对齐 DIY SKU 与采购SKU的字段归属

**Files:**

- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/src/application/ingredient/recommended-product.service.ts`
- Modify: `backend/src/application/ingredient/procurement-sku.service.ts`
- Modify: `backend/src/interfaces/controllers/recommended-product.controller.ts`
- Modify: `backend/src/interfaces/controllers/procurement-sku.controller.ts`
- Modify: `backend/tests/application/ingredient/recommended-product.service.spec.ts`
- Modify: `backend/tests/application/ingredient/procurement-sku.service.spec.ts`
- Modify: `backend/tests/interfaces/controllers/recommended-product.controller.spec.ts`
- Modify: `backend/tests/interfaces/controllers/procurement-sku.controller.spec.ts`

- [ ] **Step 1: 先用测试锁定两类 SKU 的职责**

  需要覆盖：

  - DIY SKU 只承载用户推荐商品字段
  - 采购SKU 承载采购与库存策略字段
  - 创建/更新采购SKU时，应显式支持 `purchaseUnit`、`purchaseToBaseRatio`、`currentPurchasePrice`、`referencePurchasePrice`、`isDefault`
  - DIY SKU 不再把 `activeNutrients` 当作营养主数据来源

- [ ] **Step 2: 丰富 procurement_sku 模型，真正承接采购字段**

  建议新增或调整以下字段：

  - `supplierName`
  - `purchaseUnit`
  - `purchaseToBaseRatio`
  - `currentPurchasePrice`
  - `referencePurchasePrice`
  - `isDefault`
  - `stockPolicy` 或等价字段组
    - `safetyStock`
    - `reorderPoint`
    - `targetStock`

  注意：

  - `currentStock` 不建议做冗余手填列，优先继续由库存流水汇总计算
  - 真实库存归属应转移到采购SKU，但“当前库存数值”仍由 ledger 聚合得出

- [ ] **Step 3: 推荐商品结构改成展示导向**

  推荐将 `recommended_product.active_nutrients` 平滑升级为更中性的展示字段，例如：

  - `marketingNutritionHighlights`

  实施上可分两步：

  - 第一版先在 service 层同时兼容 `activeNutrients` 与 `marketingNutritionHighlights`
  - 第二版再清理旧命名

- [ ] **Step 4: 补充标准原料页所需的只读汇总信息**

  后端接口应支持返回：

  - 当前标准原料下的 DIY SKU 列表
  - 当前标准原料下的采购SKU 列表
  - 汇总总库存（只读）
  - 是否存在有效 DIY SKU
  - 是否存在有效采购SKU

  这些只读指标由 SKU 层聚合，不回填到 `ingredient` 表内。

---

## Task 3: 将采购与库存逐步切换到采购SKU口径

**Files:**

- Create: `backend/prisma/migrations/<timestamp>_procurement_sku_inventory_refactor/migration.sql`
- Modify: `backend/src/application/purchasing/purchasing.service.ts`
- Modify: `backend/src/domain/purchasing/purchase-item.entity.ts`
- Modify: `backend/src/domain/purchasing/purchase-record.entity.ts`
- Modify: `backend/src/infrastructure/repositories/prisma-purchase-list.repository.ts`
- Modify: `backend/src/infrastructure/repositories/prisma-purchase-record.repository.ts`
- Modify: `backend/src/domain/inventory/inventory-ledger-entry.entity.ts`
- Modify: `backend/src/domain/inventory/inventory-adjustment.entity.ts`
- Modify: `backend/src/domain/inventory/inventory-stocktake.entity.ts`
- Modify: `backend/src/domain/inventory/inventory.repository.ts`
- Modify: `backend/src/application/inventory/inventory.service.ts`
- Modify: `backend/src/infrastructure/repositories/prisma-inventory.repository.ts`
- Modify: `backend/src/interfaces/controllers/staff-purchasing.controller.ts`
- Modify: `backend/src/interfaces/controllers/staff-inventory.controller.ts`
- Create: `backend/tests/application/purchasing/purchasing-procurement-sku.spec.ts`
- Create: `backend/tests/application/inventory/inventory-procurement-sku.spec.ts`

- [ ] **Step 1: 先把“库存数量”的语义从 g 扩展为标准单位数量**

  当前 `deltaG`、`quantityBeforeG`、`countedQuantityG` 这些命名默认假设所有库存都是克，这与未来 `ML / PCS` 原料不匹配。

  需要把库存语义改成“标准原料 baseUnit 对应的数量”，例如：

  - `deltaBaseQuantity`
  - `quantityBeforeBase`
  - `quantityAfterBase`
  - `expectedBaseQuantity`
  - `countedBaseQuantity`

  如果第一版不想立即改数据库列名，至少要先在 service / DTO / 前端类型层改成中性命名，并在仓储层做映射。

- [ ] **Step 2: 为采购与库存对象补充 procurementSkuId**

  重点迁移对象：

  - `purchase_item`
  - `purchase_record`
  - `inventory_ledger_entry`
  - `inventory_adjustment`
  - `inventory_stocktake_line`

  原则：

  - 真实库存账以 `procurementSkuId` 为主键归属
  - 历史展示仍保留 `ingredientId`、`ingredientName` 等快照或冗余字段
  - 旧数据允许没有 `procurementSkuId`，新数据必须尽量补齐

- [ ] **Step 3: 重写补货建议与库存总览的聚合口径**

  目标行为：

  - 员工端库存列表按采购SKU展示真实库存
  - 标准原料维度总库存作为聚合视图返回
  - 补货建议按采购SKU的库存策略与价格计算

  需要特别处理：

  - 默认采购SKU优先展示
  - 同一标准原料下多采购SKU时，聚合层需要返回 `ingredientTotalStock`
  - 历史上只存在 ingredient 采购字段、没有 procurementSku 的原料，需要兼容兜底，直到数据补录完成

- [ ] **Step 4: 改造采购单与采购记录快照**

  后续采购单/记录必须稳定保存以下信息：

  - `procurementSkuId`
  - `procurementSkuName`
  - `ingredientId`
  - `ingredientName`
  - `purchaseUnit`
  - `purchaseToBaseRatio`
  - `purchaseChannel`
  - `productModel`
  - `purchasePrice`

  这样即使之后 SKU 被改名、停用、删除，也不会影响历史记录回显。

- [ ] **Step 5: 明确生产扣库的阶段边界**

  本轮不强行把厨房完成任务的扣库改成“按采购SKU精确落点”，原因是生产端目前还没有“选择具体使用哪一个采购SKU”的输入来源。

  本任务只做两件事：

  - 为未来按采购SKU扣库预留 schema / DTO / service 扩展位
  - 保持现有厨房扣库逻辑兼容运行，不在本轮引入半成品的错误自动扣减

  这部分需要在计划中明确标记为下一阶段任务，避免执行时误判为本轮必须完成。

---

## Task 4: 重构管理端标准原料编辑页

**Files:**

- Modify: `admin-web/src/types/ingredient.ts`
- Modify: `admin-web/src/api/ingredients.ts`
- Modify: `admin-web/src/views/Ingredients/IngredientForm.vue`
- Modify: `admin-web/src/views/Ingredients/index.vue`

- [ ] **Step 1: 先整理前端类型定义**

  需要拆清三类对象：

  - `Ingredient`
  - `RecommendedProduct` / `DiySku`
  - `ProcurementSku`

  并新增：

  - `NutritionProfile`
  - `NutritionItem`
  - `FoodTypeSpecificProperties`
  - `SupplementTypeSpecificProperties`
  - `PackagingTypeSpecificProperties`

- [ ] **Step 2: 标准原料主表单只保留标准原料字段**

  从主表单移出：

  - 品牌
  - 规格
  - 渠道
  - 采购单位
  - 换算倍数
  - 采购单价
  - 安全库存
  - 补货点
  - 目标库存

  主表单保留：

  - 名称
  - 类型
  - 标准计量单位
  - 标准单位展示名（可选）
  - 标签
  - 统一营养数据
  - 类型专属属性
  - 备注

- [ ] **Step 3: 新增统一营养数据编辑区**

  这个区块应同时支持：

  - 食材类原料
  - 补剂类原料

  且要能明确编辑：

  - 营养素
  - 数值
  - 单位
  - 计量基准
  - 来源
  - 置信度
  - 是否重点展示

- [ ] **Step 4: 保留类型专属区块，但只维护类型差异字段**

  - 食材：`cfctClass`、`edibleYieldRate`、`densityGPerMl`、`mainNutrientsDesc`
  - 补剂：`supplementCategory`、`addTiming`、`productionLossRate`
  - 包材：`isConsumable`、`linkedItemId`

- [ ] **Step 5: DIY SKU 与采购SKU列表分别独立维护**

  管理端需要做到：

  - DIY SKU 列表维护用户推荐商品
  - 采购SKU 列表维护采购渠道、规格、价格、库存策略
  - 两个区块互不复用主表单字段

- [ ] **Step 6: 列表页的“缺少有效 SKU”提示改成双维度**

  当前只基于 `hasActiveRecommendedProduct` 的判断已经不够。

  应拆成：

  - 缺少有效 DIY SKU
  - 缺少有效采购SKU

  或至少在管理端可分别识别用户侧和生产侧缺口。

---

## Task 5: 调整员工端采购与库存消费层

**Files:**

- Modify: `miniapp/src/api/purchasing.ts`
- Modify: `miniapp/src/api/inventory.ts`
- Modify: `miniapp/src/pages/staff-purchasing/preview.vue`
- Modify: `miniapp/src/pages/staff-purchasing/detail.vue`
- Modify: `miniapp/src/pages/staff-purchasing/stock-create.vue`
- Modify: `miniapp/src/pages/staff-purchasing/record-form.vue`
- Modify: `miniapp/src/pages/staff-inventory/index.vue`
- Modify: `miniapp/src/pages/staff-inventory/stocktake-create.vue`

- [ ] **Step 1: API 类型先改成 procurement SKU 优先**

  小程序 API 类型应显式区分：

  - `ingredient`
  - `procurementSku`
  - `ingredientAggregate`

  旧字段兜底可以保留在 `normalize*` 方法内，但不能继续作为主口径。

- [ ] **Step 2: 采购单页面优先展示采购SKU信息**

  页面展示重点调整为：

  - 采购SKU名称
  - 所属标准原料
  - 渠道
  - 规格
  - 采购单位
  - 价格
  - 预计采购数量

  只在必要时额外展示标准原料聚合信息。

- [ ] **Step 3: 库存页面切成“采购SKU真实库存 + 标准原料聚合视图”**

  具体建议：

  - 主列表按采购SKU展示
  - 卡片内附带所属标准原料
  - 如需要，可在明细或分组标题中显示该标准原料的总库存

- [ ] **Step 4: 盘点与手工入库接口跟随 procurementSkuId**

  新建盘点、手工建单、录采购记录时，应优先传：

  - `procurementSkuId`
  - `baseQuantity`
  - `purchaseUnitQuantity`

  若仍需兼容旧原料口径，应在 API 层明确只做过渡，不继续扩散到页面状态管理中。

---

## Task 6: 验证、发布与后续清理

**Files:**

- Modify as needed across the above files

- [ ] **Step 1: 分阶段验证**

  Backend：

  - `cd backend && npm test -- backend/tests/application/ingredient/ingredient-domain-refactor.spec.ts --runInBand`
  - `cd backend && npm test -- backend/tests/application/ingredient/recommended-product.service.spec.ts --runInBand`
  - `cd backend && npm test -- backend/tests/application/ingredient/procurement-sku.service.spec.ts --runInBand`
  - `cd backend && npm test -- backend/tests/application/purchasing/purchasing-procurement-sku.spec.ts --runInBand`
  - `cd backend && npm test -- backend/tests/application/inventory/inventory-procurement-sku.spec.ts --runInBand`
  - `cd backend && npm run build`

  Admin：

  - `cd admin-web && npm run build`

  Miniapp：

  - `cd miniapp && npm test`
  - `cd miniapp && npm run build:mp-weixin`

- [ ] **Step 2: 按“增量上线”而不是“一次性清空旧字段”发布**

  推荐发布节奏：

  1. 上线 schema 增量变更与兼容读写
  2. 上线管理端标准原料编辑页新结构
  3. 上线员工端采购/库存新口径
  4. 补录采购SKU、验证库存与采购链路稳定
  5. 单独立项清理 `ingredient` 上的旧采购字段

- [ ] **Step 3: 将人工数据清洗列为后续独立计划**

  本计划结束后，再单独处理：

  - 哪些标准原料应合并
  - 哪些原料应重录
  - 哪些闲置原料应归档
  - 哪些在用原料必须优先补采购SKU

  这样可以避免在结构未稳定前就开始清数据，减少返工风险。

---

## 执行建议

推荐拆成两个实施里程碑：

### Milestone A：结构基础落地

- Task 1
- Task 2
- Task 4

交付结果：

- 标准原料、DIY SKU、采购SKU 字段边界清晰
- 统一营养数据可录入
- 管理端编辑页完成重构

### Milestone B：采购/库存口径迁移

- Task 3
- Task 5
- Task 6

交付结果：

- 采购SKU成为采购与库存主对象
- 员工端采购/库存消费改为 procurement SKU 优先
- 为后续生产执行和人工数据清理打好基础

## 风险提示

- 当前库存领域对象大量使用 `G` 命名，若不先中性化，会继续把 `ML / PCS` 原料错误地挤进“克库存”模型里。
- 若直接删除 `ingredient` 采购字段而不做兼容层，现有采购、库存、管理端页面会大面积回归。
- 厨房任务按采购SKU扣库需要上游“选择实际使用哪个采购SKU”的输入，本轮不应假装已经具备。
- 补剂营养结构迁移时，必须区分“统一营养数据”和“类型专属属性”，不能简单把旧 JSON 原样平移后继续混用。
