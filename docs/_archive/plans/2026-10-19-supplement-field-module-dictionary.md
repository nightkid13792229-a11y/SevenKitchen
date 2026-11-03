# 预分装补剂 · 字段与模块字典（v1 · 2026-10-19）

> **用途**：在写代码之前，把“已有字段/模块、要新增的字段/模块、禁止重复的字段/模块”一次定义清楚。
>
> **铁律**：
> 1. **一个概念只能有一个字段/模块**；同一件事不允许在两个地方各存一份。
> 2. 任何新增字段/模块，必须先登记到本文；没有登记的，代码审查直接不通过。
> 3. 能派生出来的值不存（如“售后中”“剩余产能”“可用库存”）；用查询/计算得出。
> 4. 快照字段必须以 `Snapshot` 结尾；时间以 `At` 结尾；编号以 `No` 结尾；外键以 `Id` 结尾。
> 5. 枚举用于封闭集合；开放集合才用字符串（如快递公司编码）。
>
> 配套：[需求 v2](2026-10-19-supplement-prepack-requirements-v2.md)

---

## 一、模块登记表

### 1.1 复用模块（不新建）

| 模块 | 现有职责 | 本轮怎么用 | 不要做什么 |
|---|---|---|---|
| `supplement-shop` | 补剂报价、下单、分装、发货、退款/补发 | 扩展排期、售后、订单中心、包材汇总 | 不新建第二个补剂订单模块 |
| `diy-sheet` | 制作单存储/查询 | 增加快照字段与冻结逻辑 | 不新建“制作单快照表” |
| `inventory` | 库存流水、占用、调整 | `InventoryAllocation.sourceType` 区分补剂占用 | 不新建补剂库存表 |
| `message` | 站内消息 + 微信订阅消息 | 补剂排期/发货/售后通知 | 不新建补剂消息表 |
| `label` | 鲜食/补剂标签渲染 | 补剂标签改 40×60 | 不改鲜食标签版式 |
| `custom-recipe` 日历 | 营业日/停发/公共假日 | 升级为公司营业日历 | 不新建第二套日历表 |
| `payment` | 微信支付/退款 | 补剂多次退款按售后记录 | 不新建补剂支付模块 |

### 1.2 新增模块（必须说明边界）

| 模块 | 唯一职责 | 写什么 | 读什么 | 不负责 |
|---|---|---|---|---|
| `SupplementSchedulingService` | 算分装日、产能、改期、自动完成 | `SupplementOrder.packingDate` + 事件 | 配置、日历、订单计数 | 不写库存、不写售后 |
| `SupplementInventoryService` | 补剂库存预占/移动/释放/扣减 | `InventoryAllocation` + `InventoryLedgerEntry` | 订单行、配置 | 不算日期、不改订单状态（除事件） |
| `SupplementAftersaleService` | 售后记录状态机、退款/补发编排 | `AftersaleCase` + 事件 | 订单、支付退款结果 | 不直接改订单履约状态 |
| `OrderCenterService` | 三类订单统一读模型（**不是补剂专用**） | 无（只读） | 三类订单、售后记录 | 不写任何业务表；不放在 supplement-shop 模块里 |
| `SupplementPackagingService` | 包材规则、选袋、汇总 | `SupplementPackagingRule`（仅配置） | 包材档案、订单行 | 不扣包材库存（本轮） |
| `BusinessCalendarService` | 公司营业日判断 | 复用定制日历表 | 日历表 | 不管定制产能 |

> 命名反例：不要叫 `SupplementOrderCenterService`——它会被误读为“补剂订单中心”；实际是三类订单统一读模型，应叫 `OrderCenterService`，放在独立的 order-center 读模块。
>
> 禁止：再建 `SupplementOrderStatusService`、`SupplementRefundService`、`SupplementNotificationService` 各一套——职责分别归到排期/售后/消息模块，避免“一个动作三个服务都在写”。

---

## 二、字段登记表

### 2.1 `SupplementOrder`（现有表，扩展）

| 字段 | 类型 | 可空 | 默认 | 唯一职责 | 备注 |
|---|---|---|---|---|---|
| `packingDate` | Date（日期） | 是 | 无 | 分装日/预计发货日 | **唯一日期字段**；不新增 `productionDate`/`shippingDate` |
| `packingDateSource` | enum `AUTO/ADMIN` | 否 | `AUTO` | 当前日期来源 | 历史改期进事件表 |
| `reorderFromOrderNo` | varchar(32) | 是 | 无 | 再次购买来源 | 不新增 `repurchaseFlag` 等布尔字段 |
| `events` | relation | — | — | 订单事件 | 只读关系，不存字段 |

**明确不新增**：

- ❌ `scheduledAt`、`packedBy`、`rescheduledReason`：历史进 `SupplementOrderEvent`。
- ❌ `aftersaleStatus`：售后状态只存在 `AftersaleCase.status`。
- ❌ `capacityRemaining`：派生值，不存。
- ❌ `shippingDate`：与 `packingDate` 同一天，不拆两个字段。

### 2.2 `DIYSheet`（现有表，扩展）

| 字段 | 类型 | 可空 | 默认 | 唯一职责 | 备注 |
|---|---|---|---|---|---|
| `recipeVersion` | Int | 是 | 无 | 冻结的食谱版本 | 与 `snapshot` 同时写 |
| `snapshot` | Json | 是 | 无 | 整张制作单快照 | 只写一次；不覆盖 |
| `snapshotAt` | DateTime | 是 | 无 | 冻结时间 | 审计 |

**禁止**：

- ❌ 新建 `DIYSheetSnapshot` 表（快照是文档，不是新实体）。
- ❌ 在 `SupplementOrder` 再存一份完整制作单快照（订单只存 `diySheetId` + 商品/金额快照）。
- ❌ 用 `updatedAt` 当快照时间。

### 2.3 `SupplementShopConfig`（现有单例，扩展）

| 字段 | 类型 | 默认（首发目标） | 唯一职责 |
|---|---|---|---|
| `dailyCutoffTime` | varchar(5) HH:mm | `17:00` | 截单时间 |
| `dailyPackingCapacity` | Int | `30` | 每日订单数上限 |
| `autoScheduleEnabled` | Boolean | `true` | 自动排期开关 |
| `aftersaleWindowDays` | Int | `7` | 售后窗口 |
| `autoCompleteDays` | Int | `10` | 发货后自动完成（售后 7 天，留 3 天缓冲） |
| `freeServiceThreshold` | Decimal(10,2) 可空 | `99.00` | 免服务费门槛 |

**复用现有字段，不新增**：

- `markupMultiplier`（2.5）
- `serviceFeeMode`（PER_ORDER）/ `serviceFeeAmount`（10）
- `flatShippingFee`（6）/ `freeShippingThreshold`（129）
- `paymentTimeoutMinutes`
- 效期/标签字段

> 注意：现有代码默认值仍是旧值；上线前在后台设置成目标值，不能依赖 schema 默认。

### 2.4 `InventoryAllocation`（现有表，扩展）

| 字段 | 类型 | 默认 | 唯一职责 |
|---|---|---|---|
| `sourceType` | enum `PRODUCTION/SUPPLEMENT_PACK` | `PRODUCTION` | 区分鲜食/补剂占用 |

> **单位口径**：`InventoryAllocationLine.quantityG` / `InventoryLedgerEntry.deltaG` 虽叫 G，实际是原料 `baseUnit` 的数量（G/ML/PCS）。`baseUnit` 可以是 `PCS`，显示单位“平勺”也按 `PCS` 记：`purchaseUnit=瓶`、`purchaseToBaseRatio=2000` 表示 2000 平勺/瓶，1 平勺=1 PCS；不需要换算成克。只有配方按克/半勺、无法整勺计数时，才用 `baseUnit=G`、显示单位 `g`。**不新增 `quantityBase`/`deltaBase` 字段**，避免同一数量两个落点。

**禁止**：

- ❌ 新建 `SupplementInventoryAllocation` 表。
- ❌ 在 `SupplementOrder` 上存 `stockReserved` 布尔值（占用状态看 allocation）。
- ❌ 用 `sourceOrderIds` 之外再加 `supplementOrderId`（同一含义）。

### 2.5 `AftersaleCase`（新表）

| 字段 | 类型 | 可空 | 说明 |
|---|---|---|---|
| `id` | uuid | 否 | 主键 |
| `caseNo` | varchar(32) 唯一 | 否 | 售后单号 |
| `orderType` | enum `FOOD/CUSTOM_RECIPE/SUPPLEMENT` | 否 | 订单类型 |
| `orderId` | varchar(36) | 否 | 订单 id（多态，不加外键） |
| `orderNo` | varchar(32) | 是 | 订单号快照 |
| `customerId` | uuid | 否 | 顾客 id |
| `status` | enum `PENDING/PROCESSING/RESOLVED/REJECTED/CANCELLED` | 否 | 售后状态 |
| `requestType` | enum `REFUND/RESHIP/OTHER` | 否 | 顾客诉求 |
| `requestedReason` | varchar(500) | 否 | 顾客原因 |
| `requestedPhotos` | text[] | 否 | 凭证（选填） |
| `source` | varchar(20) | 否 | CUSTOMER/ADMIN/MIGRATION |
| `handlerId` | uuid | 是 | 处理人 |
| `handlingNote` | varchar(1000) | 是 | 处理说明 |
| `resolutionType` | enum `REFUND/RESHIP/REGISTER_ONLY/REJECT` | 是 | 处理结论 |
| `refundAmount` | Decimal(10,2) | 是 | 本笔退款金额 |
| `refundStatus` | varchar(20) | 是 | 微信退款状态 |
| `refundOutNo` | varchar(64) 唯一 | 是 | 退款单号（每笔唯一） |
| `refundId` | varchar(64) | 是 | 微信退款 id |
| `refundRequestedAt` | DateTime | 是 | 退款发起时间 |
| `refundedAt` | DateTime | 是 | 退款到账时间 |
| `reshipOrderId` / `reshipOrderNo` | varchar(36/32) | 是 | 补发单 |
| `acceptedAt` / `resolvedAt` / `rejectedAt` | DateTime | 是 | 状态时间 |
| `createdAt` / `updatedAt` | DateTime | 否 | 审计 |

**约束**：

- 部分唯一索引：`(orderType, orderId) WHERE status IN ('PENDING','PROCESSING')` —— 同一订单只能一条未完结。
- 不建 `SupplementAftersale` 第二张表；本轮补剂写这张通用表，鲜食/定制第二批迁移。

### 2.6 `SupplementOrderEvent`（新表）

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | uuid | 主键 |
| `orderId` | uuid | 订单 |
| `type` | enum（SCHEDULED/RESCHEDULED/PACKED/FORCE_PACKED/SHIPPED/COMPLETED/CANCELLED/ADDRESS_CHANGED/REORDERED/AFTERSALE_CREATED/REFUNDED/RESHIPPED/SCHEDULE_FAILED） | 事件类型 |
| `fromValue` / `toValue` | varchar(64) | 状态/日期变化 |
| `actorType` | varchar(20) | CUSTOMER/STAFF/ADMIN/SYSTEM |
| `actorId` | uuid | 操作人 |
| `reason` | varchar(500) | 原因 |
| `metadata` | Json | 扩展信息（超排、缺料、原地址等） |
| `createdAt` | DateTime | 时间 |

**禁止**：在订单表再加 `lastRescheduledAt`、`forcePackReason` 等历史字段。

### 2.7 `SupplementPackagingRule`（新表）

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | uuid | 主键 |
| `role` | enum `POUCH/DESICCANT/LABEL` | 包材角色 |
| `ingredientId` | uuid | 指向 `Ingredient(PACKAGING)` |
| `physicalForm` | enum 可空 | POWDER/TABLET/CAPSULE |
| `unitPattern` | varchar(20) 可空 | g/平勺/片/粒；空=任意 |
| `minAmount` / `maxAmount` | Float 可空 | 分装量区间 |
| `priority` | Int | 命中优先级 |
| `enabled` | Boolean | 启用 |
| `note` | varchar(200) | 备注 |
| `createdAt` / `updatedAt` | DateTime | 审计 |

**禁止**：

- ❌ 新建“补剂包材表”存袋子名称/单价（物料在 `Ingredient`）。
- ❌ 在 `SupplementShopConfig` 里用 JSON 存包材规则（不可查询、易漂移）。

---

## 三、字段/模块“禁止重复”清单

| 概念 | 唯一落点 | 禁止 |
|---|---|---|
| 补剂订单 | `SupplementOrder` | ❌ 新订单表、❌ 把补剂塞进 `Order` |
| 补剂订单行 | `SupplementOrderItem` | ❌ 新明细表 |
| 分装日/发货日 | `SupplementOrder.packingDate` | ❌ `productionDate`、❌ `shippingDate`、❌ 再存 `expectedShipDate` |
| 售后状态 | `AftersaleCase.status` | ❌ 订单表 `aftersaleStatus`、❌ 旧 `AFTERSALE` 新写 |
| 售后历史 | `AftersaleCase` | ❌ 订单表 `aftersaleType/Reason/At` 新写 |
| 退款流水 | `AftersaleCase`（本轮） | ❌ 订单表 `refund*` 新写；❌ 新建补剂退款表 |
| 制作单快照 | `DIYSheet.snapshot` | ❌ 新快照表、❌ 订单再存整张单 |
| 包材主数据 | `Ingredient(PACKAGING)` | ❌ 新包材主数据表 |
| 包材选型 | `SupplementPackagingRule` | ❌ 代码写死选袋、❌ 配置 JSON |
| 库存占用 | `InventoryAllocation` | ❌ 新补剂占用表 |
| 库存流水 | `InventoryLedgerEntry` | ❌ 新补剂库存流水 |
| 营业日历 | `CustomRecipeSchedule/WeekdayRule` | ❌ 新补剂日历表 |
| 站内消息 | `CustomerMessage` | ❌ 新补剂消息表 |
| 订单事件 | `SupplementOrderEvent` | ❌ 订单表堆历史字段 |
| 订单中心 | 读模型/查询 | ❌ 新订单汇总表（除非性能证明需要） |

---

## 四、术语表（对外/对内统一）

| 概念 | 唯一说法 | 不要用 |
|---|---|---|
| 内部日期 | **分装日** | 排产日、生产日 |
| 顾客日期 | **预计发货日期** | 分装日、生产日期 |
| 订单 | **补剂订单** | 补剂单、补剂订单表 |
| 售后 | **售后记录** | 售后单、售后工单（菜单名可保留“售后视图”） |
| 快照 | **制作单快照** | 制作单副本、历史制作单 |
| 包材 | **分装包材** | 包装材料、耗材（混用） |
| 服务费 | **分装服务费** | 手工费、加工费 |
| 小单 | **小单（商品 <¥29）** | 低客单、迷你单 |
| 售后中 | **售后中（标签）** | 用“售后中”替代履约状态 |
| 退款失败 | **退款失败/处理中** | 退款异常（不具体） |

---

## 五、指标字典（看板唯一口径）

| 指标 | 公式 | 分母/窗口 | 数据源 | 备注 |
|---|---|---|---|---|
| 补剂渗透率 | 买过补剂的制作单数 ÷ 生成制作单数 | 按周/月 | `SupplementOrder.diySheetId` + `DIYSheet` | 同一制作单多单只算 1 |
| 单均贡献率 | （实付 − 补剂成本 − 包材 − 人工 − 运费 − 支付费 − 售后预留）÷ 实付 | 按周/月，**平均** | 订单 + 成本配置 | 不是每单保证 |
| 小单占比 | 商品金额 <¥29 的订单数 ÷ 已付款订单数 | 按周/月 | `SupplementOrder.amountGoods` | 内部标记，不拦单 |
| 售后率 | 有售后记录的订单数 ÷ 已付款订单数 | 按 30 天 | `AftersaleCase` | 按订单去重，不按 case 数 |
| 准时发货率 | 在 `packingDate` 当天或之前发货的订单数 ÷ 已发货订单数 | 按 30 天 | `shippedAt` vs `packingDate` | 排除取消单 |
| 复购率 | 60 天内下过 ≥2 单的顾客数 ÷ 下过 ≥1 单的顾客数 | 滚动 60 天 | 订单 | 按顾客去重 |
| 退款率 | 退款成功金额 ÷ 实付金额 | 按 30 天 | `AftersaleCase` | 金额口径 |
| 退款单占比 | 有退款成功的订单数 ÷ 已付款订单数 | 按 30 天 | `AftersaleCase` | 笔数口径，后台退款页用 |
| 缺料订单数 | 当前分装日缺料订单数 | 当日 | 汇总视图 | 实时 |
| 待排期数 | `PAID` 且 `packingDate` 为空 | 实时 | 订单 | 异常态 |
| 逾期数 | `packingDate` < 今天且未 `PACKED` | 实时 | 订单 | 排除取消 |

**时区**：全部按 Asia/Shanghai 日历日；数据库时间用 UTC。

---

## 六、变更控制

任何代码任务新增字段/模块，必须同时更新本文：

1. 在“模块登记表”写：职责、写什么、读什么、不负责什么。
2. 在“字段登记表”写：类型、可空、默认、唯一职责、索引、保留策略。
3. 在“禁止重复”清单确认没有第二落点。
4. 在“术语表/指标字典”确认口径唯一。
5. 代码审查逐项对照；没有登记 = 不通过。

> 这份字典是“防重复新增”的闸门，不是技术方案。具体索引/迁移/接口在技术方案里写，但字段名和职责以本文为准。
