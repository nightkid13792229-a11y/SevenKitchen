# 2026-03-31 财务流程现状分析与设计方案

## 1. 目标

围绕微信小程序端，建设覆盖以下场景的完整财务闭环：

- 原料采购记录
- 行政采购记录
- 房租、水电等固定费用记录
- 报销申请
- 审核流转
- 财务统计与经营分析
- 原料价格实时更新
- 订单价格实时计算

本文先基于当前仓库做现状分析，再给出建议的业务架构、数据模型和分阶段落地方案。


## 2. 项目现状

### 2.1 已具备的基础能力

当前仓库不是从零开始，已经具备较好的采购与成本基础设施：

- `miniapp` 已有员工采购、采购记录、报销提交/详情/列表页面。
- `backend` 已有原料、采购清单、采购记录、报销单、订单定价快照等核心模型。
- `admin-web` 已有报销审核、采购历史、采购统计、原料价格维护等页面。

### 2.2 当前已经打通的业务链

现有代码实际上已经形成了一个“轻量采购闭环”：

1. 原料主数据维护
2. 订单定价时生成原料成本快照
3. 基于订单快照自动生成采购清单
4. 采购员记录实际采购金额与数量
5. 员工提交报销
6. 管理端审核报销

这条链路的优势是：

- 采购需求不是手填，而是直接复用订单定价快照中的 `ingredientDetails`
- 原料基础价格、包装成本、人工成本、间接成本、运费模板都已有落点
- 报销单已支持“采购清单金额 + 平台运费 + 平台打包费 + 自定义费用”

### 2.3 现有模块映射

#### A. 原料与成本基础

- 原料主数据里已经有采购单位、采购渠道、当前采购单价、换算比例等字段
- 位置：`backend/prisma/schema.prisma`
- 关键模型：`Ingredient`

这说明“原料价格驱动订单成本”这一层已经具备。

#### B. 订单成本与价格快照

- 后端已有订单价格预览接口
- 订单创建时会保存 `PricingBreakdownSnapshot`
- 快照中包含原料成本、包材成本、人工成本、间接成本、总成本、商品价、运费、总价等

这说明系统已经具备“订单价格可解释”和“下单时价格留痕”的基础。

#### C. 采购与报销

- 采购清单：`PurchaseList`
- 采购明细：`PurchaseItem`
- 采购记录：`PurchaseRecord`
- 报销单：`Reimbursement`

当前报销单已能承载：

- 关联采购清单
- 实际总金额
- 预估总金额
- 发票/支付凭证
- 平台运费
- 平台打包费
- 自定义费用

#### D. 管理端

管理端已经有：

- 报销审核列表
- 报销详情
- 采购历史
- 采购统计
- 原料价格维护

因此，现阶段更像是“采购报销子系统已完成 50%-60%”，但“完整财务系统”还没有落地。


## 3. 当前结构性缺口

### 3.1 财务对象还不完整

当前数据库中已有：

- `Ingredient`
- `PurchaseList`
- `PurchaseItem`
- `PurchaseRecord`
- `Reimbursement`
- `GlobalConfig`

但还没有独立的：

- 费用分类
- 费用单据
- 供应商/收款方
- 成本中心
- 审批流实例
- 支付单/结算单
- 财务台账
- 原料价格历史表
- 预算表

也就是说，现有系统偏“采购/报销功能”，还不是“财务域模型”。

### 3.2 角色模型还过粗

当前角色只有：

- `CUSTOMER`
- `STAFF`
- `ADMIN`

缺少更贴合财务流程的角色或权限组，例如：

- 采购员
- 部门负责人
- 财务审核
- 出纳/付款
- 老板/终审

这会导致后续审批流只能依赖“员工/管理员”二分法，不利于扩展。

### 3.3 库存闭环没有真正打通

文档定义里明确要求：

- 采购完成后原料入库
- 库存满足后厨房解锁生产

但当前库存服务主要实现的是“厨房生产完成后的扣减”，没有看到“采购入库”这一侧的标准化入账流程。

这意味着现在的采购完成，并不会自动形成规范的原料库存增加流水。

### 3.4 采购与财务审核被耦合

当前报销审核通过后，会触发相关订单从 `PAID` 进入 `PURCHASING` 的解锁逻辑。

这在业务上有明显耦合问题：

- 采购执行和生产解锁，应该受“是否已采购完成/是否已入库”控制
- 财务报销审核，应该属于费用合规与付款结算控制

推荐在新方案里把“生产解锁”和“财务审核”彻底拆开。

### 3.5 原料价格只有当前值，没有历史版本

当前原料表只有 `currentPricePerPurchaseUnit`，说明系统现在保存的是“当前价格”。

问题在于：

- 无法回答“某一天的原料价格是多少”
- 无法做价格波动分析
- 无法做按版本重算
- 无法解释采购价和下单价为何不一致

虽然订单快照里预留了 `ingredientPriceVersionHash`，但当前创建快照时仍是 `null`，说明价格版本化还没有真正落地。

### 3.6 小程序端的财务入口还比较分散

当前小程序员工工作台已经有采购管理、报销管理入口，但“今日概览”还是 UI 占位。

这说明：

- 采购作业页已存在
- 财务分析页还没有真正建设
- 审核中心也主要集中在 `admin-web`

如果目标是“微信小程序端实现记录、报销、审核”，还需要把审批中心与财务工作台补上。

### 3.7 当前还存在一些接口/状态命名不一致

现有采购管理代码里有若干实现层面的不一致，说明模块还需要先做一次稳定化整理，例如：

- 管理端页面使用 `APPROVED`，领域状态实际是 `REIMBURSED`
- 审核页使用 `RESUBMIT`，后端审核 DTO 实际接收 `REQUIRES_RESUBMIT`
- 管理端统计字段名与后端返回字段名未完全对齐
- 小程序采购记录更新/删除接口路径参数不完整

这类问题不影响方向判断，但会影响后续财务模块的继续扩建，建议优先清理。

### 3.8 订单价格预览与正式下单还未完全闭环

后端价格预览会生成 `snapshotId`，但当前小程序下单并没有把该 `snapshotId` 带回正式下单接口。

这会带来两个风险：

- 用户看到的预览价与实际下单价可能再次重算后不一致
- 无法严格保证“展示给用户的实时价格”与“成交价”完全一致

如果后续要做财务分析和毛利分析，这个闭环必须补齐。


## 4. 设计原则

### 4.1 把“采购流程”和“财务流程”拆开，但保持可追溯

建议拆成两条链：

- 业务链：订单/缺口/采购/入库/生产
- 财务链：申请/报销/审核/付款/记账/分析

两条链通过单据关联，而不是互相硬编码驱动状态。

### 4.2 统一“费用单据”模型

建议不要把“房租、水电、行政采购”继续塞进现有 `Reimbursement` 的临时字段里，而是抽象成统一费用单据模型：

- 原料采购费用
- 行政采购费用
- 固定费用
- 服务费用
- 其他杂项费用

### 4.3 所有金额都必须留快照

需要快照化的对象：

- 下单时订单成本快照
- 采购执行时实际采购快照
- 报销提交时费用构成快照
- 审核通过时审批快照
- 付款时支付快照

这样才能保证后续经营分析和审计可追溯。

### 4.4 财务分析基于事实表，不直接扫业务表拼装

随着采购、费用、订单变多，管理端图表不能靠运行时扫全表计算。建议增加汇总事实表或每日统计表，支持：

- 每日采购金额
- 每日费用金额
- 每日订单收入
- 每日毛利
- 每日原料价格波动


## 5. 推荐的目标架构

### 5.1 领域拆分

建议把当前能力扩展为 6 个子域：

1. `Material Pricing`
   - 原料价格
   - 价格历史
   - 价格来源
   - 价格生效版本

2. `Procurement`
   - 原料采购单
   - 行政采购单
   - 供应商
   - 采购执行记录
   - 到货/入库

3. `Expense`
   - 费用申请单
   - 报销单
   - 固定费用单
   - 费用分类
   - 成本中心

4. `Approval`
   - 审批模板
   - 审批实例
   - 审批节点
   - 审批动作日志

5. `Settlement`
   - 付款单
   - 支付凭证
   - 结算状态
   - 对账状态

6. `Finance Analytics`
   - 经营看板
   - 毛利分析
   - 采购差异分析
   - 费用结构分析


## 6. 推荐数据模型

### 6.1 在现有模型上继续保留

以下模型建议继续保留并增强，而不是推翻重做：

- `Ingredient`
- `PurchaseList`
- `PurchaseItem`
- `PurchaseRecord`
- `Reimbursement`
- `OrderPricingSnapshot`
- `PricingBreakdownSnapshot`
- `GlobalConfig`

### 6.2 新增核心模型

#### A. 费用分类

`ExpenseCategory`

建议字段：

- `id`
- `code`
- `name`
- `type`
  - `RAW_MATERIAL`
  - `ADMIN_PROCUREMENT`
  - `RENT`
  - `UTILITIES`
  - `LOGISTICS`
  - `EQUIPMENT`
  - `SERVICE`
  - `OTHER`
- `parentId`
- `requiresInvoice`
- `requiresProcurementRelation`
- `enabled`

#### B. 供应商/收款方

`Vendor`

建议字段：

- `id`
- `name`
- `type`
  - `SUPPLIER`
  - `LANDLORD`
  - `UTILITY_PROVIDER`
  - `SERVICE_PROVIDER`
- `contactName`
- `contactPhone`
- `bankAccountName`
- `bankAccountNo`
- `notes`

#### C. 成本中心

`CostCenter`

建议字段：

- `id`
- `code`
- `name`
- `ownerUserId`
- `enabled`

示例：

- 中央厨房
- 行政运营
- 仓储物流
- 内容营销

#### D. 通用费用单

`ExpenseBill`

建议字段：

- `id`
- `billNo`
- `billType`
  - `PROCUREMENT`
  - `REIMBURSEMENT`
  - `FIXED_EXPENSE`
  - `DIRECT_PAYMENT`
- `categoryId`
- `costCenterId`
- `vendorId`
- `sourceDocumentType`
- `sourceDocumentId`
- `currency`
- `estimatedAmount`
- `actualAmount`
- `taxAmount`
- `occurredAt`
- `submittedById`
- `status`
  - `DRAFT`
  - `SUBMITTED`
  - `UNDER_REVIEW`
  - `APPROVED`
  - `REJECTED`
  - `PAID`
  - `CLOSED`

#### E. 费用明细

`ExpenseBillLine`

建议字段：

- `id`
- `billId`
- `description`
- `quantity`
- `unit`
- `unitPrice`
- `lineAmount`
- `ingredientId` 可选
- `purchaseRecordId` 可选
- `notes`

#### F. 审批实例

`ApprovalInstance`

建议字段：

- `id`
- `businessType`
- `businessId`
- `templateId`
- `currentNodeOrder`
- `status`
  - `PENDING`
  - `APPROVED`
  - `REJECTED`
  - `CANCELLED`

`ApprovalNode`

- `id`
- `instanceId`
- `nodeOrder`
- `approverUserId`
- `approverRole`
- `decision`
- `comment`
- `actedAt`

#### G. 付款单

`PaymentSettlement`

建议字段：

- `id`
- `settlementNo`
- `expenseBillId`
- `payeeType`
- `payeeId`
- `plannedAmount`
- `paidAmount`
- `paidAt`
- `paymentMethod`
- `paymentAccount`
- `proofUrls`
- `status`

#### H. 原料价格历史

`IngredientPriceHistory`

建议字段：

- `id`
- `ingredientId`
- `pricePerPurchaseUnit`
- `purchaseUnit`
- `sourceType`
  - `MANUAL`
  - `PURCHASE_RECORD`
  - `IMPORT`
  - `MARKET_SYNC`
- `sourceId`
- `effectiveFrom`
- `effectiveTo`
- `versionNo`
- `createdById`


## 7. 推荐业务流程

### 7.1 原料采购流程

建议流程：

1. 订单价格快照生成原料需求
2. 系统生成 `PurchaseList`
3. 采购员执行采购并登记 `PurchaseRecord`
4. 采购完成后生成库存入账流水
5. 同步生成或关联 `ExpenseBill`
6. 员工提交报销/结算申请
7. 审批流转
8. 财务付款
9. 形成付款凭证与费用分析数据

关键改造点：

- “采购完成”应驱动库存入账
- “库存足够”应驱动生产可执行
- “报销审核通过”不应再作为生产解锁条件

### 7.2 行政采购流程

建议流程：

1. 员工新建行政采购申请
2. 选择费用分类、成本中心、收款方
3. 审批通过后执行采购
4. 上传小票/发票/支付凭证
5. 生成 `ExpenseBill`
6. 财务审核与付款

与原料采购的差异：

- 不经过订单缺口生成
- 不入原料库存
- 但共享审批、付款、分析能力

### 7.3 房租水电等固定费用流程

建议流程：

1. 系统按周期自动生成待办费用单
2. 财务/管理员录入账单金额
3. 上传账单截图
4. 审批
5. 付款
6. 标记已结清
7. 纳入月度费用分析

这类费用适合支持：

- 月付
- 季付
- 不定额
- 自动提醒

### 7.4 报销流程

建议把报销定义为“员工垫资后向公司报销”的子流程，而不是所有费用的总入口。

推荐区分：

- `ExpenseBill`：费用事实
- `ExpenseClaim`：员工报销申请

如果是公司直接付款：

- 不一定需要 `ExpenseClaim`

如果是员工先垫付：

- 必须经过 `ExpenseClaim`


## 8. 微信小程序端设计

### 8.1 建议入口结构

员工工作台建议扩展为：

- 采购管理
- 费用中心
- 审批中心
- 我的报销
- 财务概览

### 8.2 建议页面

#### A. 采购管理

- 采购清单列表
- 采购清单详情
- 采购记录录入
- 到货入库确认
- 价格异常提示

#### B. 费用中心

- 新建费用单
- 行政采购申请
- 房租/水电录入
- 固定费用待办
- 费用单详情

#### C. 报销中心

- 我的报销单
- 新建报销
- 重新提交
- 上传发票/支付凭证

#### D. 审批中心

- 待我审核
- 我已审核
- 审批详情
- 同意/驳回/退回补充

#### E. 财务概览

给小程序端展示轻量指标：

- 本月采购金额
- 本月费用金额
- 待审核单据数
- 待付款单据数
- 原料涨价预警数

### 8.3 小程序端角色建议

建议通过权限点而不是大角色硬编码控制：

- `procurement.execute`
- `expense.submit`
- `expense.approve.level1`
- `expense.approve.finance`
- `payment.execute`
- `finance.analytics.view`


## 9. 后端接口设计建议

### 9.1 采购域

- `GET /staff/procurement/raw/lists`
- `GET /staff/procurement/raw/lists/:id`
- `POST /staff/procurement/raw/lists/:id/records`
- `POST /staff/procurement/raw/lists/:id/stock-in`
- `POST /staff/procurement/raw/lists/:id/close`

### 9.2 费用域

- `POST /staff/finance/expense-bills`
- `GET /staff/finance/expense-bills`
- `GET /staff/finance/expense-bills/:id`
- `POST /staff/finance/expense-bills/:id/submit`
- `POST /staff/finance/expense-bills/:id/attachments`

### 9.3 报销域

- `POST /staff/finance/claims`
- `GET /staff/finance/claims`
- `GET /staff/finance/claims/:id`
- `POST /staff/finance/claims/:id/resubmit`

### 9.4 审批域

- `GET /staff/finance/approvals/pending`
- `GET /staff/finance/approvals/:id`
- `POST /staff/finance/approvals/:id/approve`
- `POST /staff/finance/approvals/:id/reject`
- `POST /staff/finance/approvals/:id/return`

### 9.5 统计分析域

- `GET /admin/finance/dashboard/overview`
- `GET /admin/finance/analytics/expense-trend`
- `GET /admin/finance/analytics/procurement-variance`
- `GET /admin/finance/analytics/material-price-trend`
- `GET /admin/finance/analytics/order-margin`
- `GET /admin/finance/analytics/vendor-ranking`


## 10. 原料价格实时更新方案

### 10.1 原则

“实时更新”不应理解为直接覆盖当前价格，而应采用：

- 当前价 + 历史价 + 生效时间 + 来源

### 10.2 更新来源

建议支持 4 类来源：

1. 后台人工改价
2. 采购记录自动回写建议价
3. Excel 批量导入
4. 第三方市场价同步（后续）

### 10.3 更新策略

建议支持三种口径：

- 最新采购价
- 最近 N 次加权平均价
- 财务确认价

系统中的“订单定价价目表”建议使用“财务确认价”，而不是直接使用最新录入价。

### 10.4 价格生效机制

建议新增：

- `PriceVersion`
- `IngredientPriceHistory`

订单预览时读取“当前生效版本”；
订单下单时把版本号固化到快照中。


## 11. 订单价格实时计算方案

### 11.1 推荐公式

订单价格建议继续沿用当前框架，但完善版本化：

- 原料成本
- 包材成本
- 人工成本
- 间接成本
- 运费
- 目标利润率

### 11.2 必做改造

1. 价格预览返回 `snapshotId`
2. 小程序正式下单必须带 `snapshotId`
3. 后端基于快照创建订单，不再重复实时重算

这样可以保证：

- 预览价 = 下单价
- 财务分析中的成交价有据可查

### 11.3 重算策略

建议只对以下场景允许重算：

- 用户还未提交订单
- 订单草稿未确认
- 内部重新报价

以下场景不允许覆盖原快照：

- 已支付订单
- 已生成采购清单订单
- 已进入生产订单


## 12. 财务统计与分析设计

### 12.1 核心指标

建议至少支持以下指标：

- 采购总额
- 原料采购总额
- 行政费用总额
- 固定费用总额
- 报销总额
- 待审核金额
- 待付款金额
- 已付款金额
- 订单收入
- 订单直接成本
- 订单毛利
- 毛利率

### 12.2 分析维度

- 日期
- 费用分类
- 成本中心
- 供应商
- 采购员
- 审批人
- 原料
- 食谱
- 订单

### 12.3 推荐分析看板

#### A. 财务总览

- 收入
- 成本
- 毛利
- 毛利率
- 本月费用结构

#### B. 采购分析

- 采购金额趋势
- 采购价 vs 预估价差异
- 原料涨跌幅
- 供应商集中度

#### C. 费用分析

- 房租/水电/行政/物流/设备费用占比
- 成本中心费用排行
- 超预算项目

#### D. 订单毛利分析

- 食谱毛利排行
- 单订单毛利
- 原料涨价对毛利影响


## 13. 分阶段落地建议

### Phase 1: 稳定现有采购报销链

目标：先把已有链路从“能用”变成“稳定可扩展”。

建议先做：

- 修复采购模块状态与接口命名不一致
- 小程序下单接入 `snapshotId`
- 采购完成后补齐库存入账
- 将生产解锁从报销审核中剥离
- 统一采购统计接口与前端字段

### Phase 2: 上线通用费用与审批中心

目标：支持行政采购、房租、水电等费用。

建议新增：

- `ExpenseCategory`
- `ExpenseBill`
- `ApprovalInstance`
- `ApprovalNode`
- 小程序审批中心

### Phase 3: 上线价格历史与财务分析

目标：把“可记录”升级成“可分析”。

建议新增：

- `IngredientPriceHistory`
- 财务汇总事实表
- 管理端财务分析看板
- 原料价格波动分析
- 订单毛利分析

### Phase 4: 自动化与经营控制

目标：让系统开始主动发现问题。

建议新增：

- 固定费用自动提醒
- 原料涨价预警
- 预算超标预警
- 审批超时提醒
- 毛利异常订单提醒


## 14. 推荐的实施顺序

如果按投入产出比排序，我建议：

1. 先做“现有采购报销链稳定化”
2. 再做“通用费用单 + 审批流”
3. 然后做“价格历史 + 财务分析”
4. 最后做“预算与预警”

原因：

- 这样可以最大化复用现有 `PurchaseList / PurchaseRecord / Reimbursement / PricingSnapshot`
- 风险最小
- 能尽快在小程序端看到业务效果
- 不会一次性重构过多已有模块


## 15. 结论

当前项目已经具备“采购报销子系统 + 订单成本引擎”的良好基础，不建议推翻重做。

最合适的路径是：

- 以现有采购与订单定价模块为底座
- 增加“通用费用域、审批域、结算域、价格历史域、分析域”
- 把原料采购、行政采购、房租水电统一纳入同一套财务单据体系
- 把实时价格、订单成交价、采购实绩、费用统计统一纳入可追溯快照体系

这样可以逐步演进成一套真正的“小程序作业 + 后台财务治理 + 经营分析”一体化财务流程。
