# 领域模型与算法

> 状态：2026-11-03 重整。本文是**领域地图 + 不变量清单**，不是字段/公式大全。
> 字段以 `backend/prisma/schema.prisma` 为准；算法实现以 `backend/src/domain` 和对应 service 为准。
> 旧版 600+ 行详细领域文档已归档到 `docs/_archive/legacy/04_Domain_Model_and_Algorithms.pre-2026-11-03.md`。

---

## 1. 领域划分

| 领域 | 主要代码 | 负责什么 |
|---|---|---|
| Dog / Health | `backend/src/domain/dog`、`domain/health` | 犬只档案、体重/体况、生命阶段、疫苗、过敏、健康记录 |
| Recipe / Nutrition | `backend/src/domain/recipe`、`domain/nutrition-governance`、`application/nutrition-*` | 食谱、营养计算、营养档案、标准、治理 |
| Order / Payment | `backend/src/domain/order`、`application/order*`、`payments` | 下单、支付、订单状态、售后 |
| Production | `backend/src/domain/production` | 排产、生产批次、厨房任务 |
| Purchasing / Inventory | `backend/src/domain/purchasing`、`domain/inventory` | 采购单、收货、库存流水、SKU |
| Shipping / Address | `backend/src/domain/shipping` | 地址、运费、发货、物流模板 |
| Supplement | `backend/src/application/supplement-shop`、`interfaces/controllers/supplement-*` | 补剂商品、订单、售后、等价组 |
| Custom Recipe | `backend/src/application/custom-recipe` | 定制需求、报价、订单、交付、退款 |
| Knowledge | `knowledge-source`、`docs/knowledge-base` | 原文层、来源、证据政策、引用锚点 |
| Finance | `backend/src/application/finance` | 报销、账单、财务报表、预警 |

> 领域边界不是按页面分的，是按“谁拥有这条业务规则”分的。

---

## 2. 核心聚合与不变量

### 2.1 Dog / Health

- 犬只档案必须属于某个 owner；跨用户读写要在接口层做归属校验。
- 体重、体况、生命阶段是**计算结果的关键输入**，不能只存在前端。
- 营养计算必须带“标准/版本/换算口径”，不能把公式散落在页面。
- 疫苗、过敏、健康记录各自有状态；不要把不同板块的状态混成一个字段。

### 2.2 Recipe / Nutrition

- 食谱是可编辑聚合；发布/下单使用的必须是**不可变快照**。
- 营养档案有“待验证/已验证”等状态；未验证数据不能伪装成已验证。
- 营养标准/换算口径要版本化；改口径不能悄悄改历史报告。
- 食材和补剂是不同子类型，采购 SKU 规则不同（补剂不挂采购 SKU）。

### 2.3 Order / Payment

- 订单状态机在 domain 层；不要在 controller 里直接 `update status`。
- 订单项引用下单时的食谱快照，不引用“当前食谱”。
- 支付、退款、售后各自有状态；金额变更必须可追溯。
- 订单取消/退款/售后不能靠删记录实现。

### 2.4 Production

- 生产批次/任务按订单快照展开；排产结果要可回读。
- 生产完成、损耗、称重等会进入成本/库存；不能只改展示字段。
- 厨房任务状态与订单状态不是同一个状态机，跨域要显式转换。

### 2.5 Purchasing / Inventory

- 库存用**流水/台账**表达，不直接改“剩余数量”一个字段。
- 采购单、收货、入库、出库要能对应到流水。
- 采购 SKU 与原料本体分离：品牌/渠道/规格/价格属于 SKU，不属于原料本体。
- 任何库存调整都要有原因和操作人。

### 2.6 Shipping / Address

- 订单保存地址/运费快照；地址后续修改不影响历史订单。
- 运费计算是领域服务，不在页面里拼。
- 发货/物流状态与订单状态解耦，但要有明确映射。

### 2.7 Supplement / Custom Recipe

- 补剂、定制食谱是独立子域，有自己的订单/定价/交付/售后。
- 不要把补剂或定制订单硬塞进普通鲜食订单状态机。
- 定制报价/定金/尾款/退款必须可追溯；不要只改一个金额字段。

### 2.8 Knowledge

- 知识库内容必须有来源/证据等级；AI 不能凭记忆补营养/医学结论。
- 引用要能回到原文/锚点；证据政策变化要可追溯。

---

## 3. 关键算法（只指路，不抄公式）

| 算法 | 入口 | 说明 |
|---|---|---|
| 犬只能量/营养计算 | `backend/src/domain/dog`、`DogCalcService` | RER/DER、生命阶段、活动量、体况、体重目标 |
| 食谱营养计算 | `backend/src/domain/recipe`、`RecipeNutritionService` | 按食材/补剂用量汇总营养，处理生熟/水分/单位 |
| 食谱快照 | `RecipeSnapshotService` | 下单/发布时冻结食谱，保证历史可复现 |
| 排产 | `application/scheduler`、`domain/production` | 按订单/产能/交期生成生产任务 |
| 运费 | `domain/shipping`、`ShippingFeeService` | 按地址/重量/模板计算 |
| 补剂/定制报价 | `domain/supplement`、`application/custom-recipe` | 独立定价与优惠/抵扣规则 |

> 公式/系数会随营养标准和业务规则变化；**不要从旧文档抄数字**，以代码和测试为准。

---

## 4. 状态机

主要状态机在 domain 层：

- 订单 / 订单项
- 生产批次 / 生产任务
- 采购单 / 收货
- 库存流水
- 补剂订单 / 售后
- 定制食谱订单 / 交付 / 退款

规则：

- 状态值用 schema/domain 里的 enum，不要临时加字符串。
- 状态转换必须集中在一个地方；不要在多个 controller 里各写一套。
- 新增状态要同时考虑：迁移、历史数据、前端展示、通知、报表。

---

## 5. 跨域规则

1. **订单只认快照**：下单后食谱/价格/地址变化，不改历史订单。
2. **生产只认订单快照**：不要回头读“当前食谱”。
3. **库存只认流水**：任何数量变化都要有来源单据。
4. **营养只认标准版本**：算法升级要能解释历史差异。
5. **权限按端隔离**：CUSTOMER / STAFF / ADMIN 不共用同一套可见范围。
6. **钱和时间的口径统一**：金额用 Decimal；时间按项目时区规范处理。

---

## 6. 改领域代码的顺序

1. 先读对应 domain service + 现有测试。
2. 写清“行为不变”还是“行为变更”；行为变更先找用户确认。
3. 先补 characterization test，再改结构。
4. 数据库变更走 Prisma migration。
5. 跑该模块测试 + 相关跨模块测试。
6. 更新本文的“地图/不变量”，不要抄字段清单。

---

## 7. 相关文档

- [核心架构](07_Core_Architecture.md)：分层与模块入口。
- [API 文档](05_API_Specs.md)：接口与 Swagger。
- [数据库命名规范](DATABASE_NAMING_CONVENTIONS.md)：字段真源。
- [知识库证据政策](knowledge-base/evidence-policy.md)：营养/医学证据边界。
