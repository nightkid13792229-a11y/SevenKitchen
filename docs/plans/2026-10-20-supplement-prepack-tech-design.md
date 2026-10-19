# 预分装补剂 · 技术方案 v1（2026-10-20）

> 对应需求：[需求 v2](2026-10-19-supplement-prepack-requirements-v2.md)
> 字段/模块唯一口径：[字段与模块字典](2026-10-19-supplement-field-module-dictionary.md)
> 原型：[三端原型](../prototypes/2026-10-19-supplement/index.html)
> 自检报告：[技术方案自检](2026-10-20-supplement-tech-design-self-check.md)
>
> **本文只写“怎么实现”**；业务规则以需求 v2 为准，字段名/模块边界以字典为准。
> 任何新增字段/模块，先改字典，再改本文，最后写代码。

---

## 一页纸结论

| 项 | 决定 |
|---|---|
| 数据 | 新增 3 张表（`AftersaleCase` / `SupplementOrderEvent` / `SupplementPackagingRule`）；现有表新增 13 列（订单 3、DIY 3、配置 6、库存 1）；新增 8 个枚举 + 1 个枚举值。不新建补剂订单/库存/日历/消息/包材主数据表 |
| 排期 | 复用公司营业日历（定制日历表），只看开/关，不看定制产能；补剂自己按订单数算 30 单/天 |
| 并发 | 排期 `Serializable` 事务 + 冲突重试；分装/退款用条件更新 + 幂等键 |
| 库存 | 复用 `InventoryAllocation` / `InventoryLedgerEntry`，加 `sourceType`；`quantityG/deltaG` 当“基准单位数量”用，不新增字段 |
| 定价 | 修现有口径：商品小计只算补剂商品；服务费/运费门槛都按商品小计；新增免服务费门槛 |
| 快照 | `DIYSheet.snapshot` JSON；首次买补剂冻结；冻结后再生成制作单必须新建，不覆盖旧单 |
| 售后 | 新 `AftersaleCase`；订单状态不动；一单同时一条未完结；退款按 case 逐笔、累计不超实付；补发每个 case 最多一张 |
| 订单中心 | `OrderCenterService` 三类订单统一读模型，只读；第一版三表查询合并，不建视图/汇总表 |
| 自动完成 | 发货后 10 天；资金到账不等于订单完成 |
| 标签 | 后端/小程序/网页统一 40×60；小程序两个打印机文件共用一份纸张常量 |
| 权限 | 员工端不显示管理员动作；后端管理员接口必须 `AdminGuard`，不能只靠前端隐藏 |
| 上线 | 先迁移+配置，再排期/库存，再售后/订单中心，最后前端+标签；全程特性开关，可回滚 |

**粗估工作量**：25–35 个开发日（后端 12–16、前端 8–12、测试/上线 5–7）。关键路径是售后/退款重构 + 三端前端。

---

## 二、范围与非目标

### 2.1 本轮范围

- DIY 制作单 → 补剂下单 → 快照 → 支付 → 排期 → 库存预占 → 分装 → 40×60 标签 → 发货 → 改地址 → 售后（退款/补发/登记/驳回）→ 再次购买。
- 三类订单统一订单中心（列表/筛选/计数/跳转，不做统一详情）。
- 补剂退款管理（财务视图，不新增售后入口）。
- 补剂运营看板（只读指标）。
- 后台原料管理（PACKAGING 包材档案）、库存管理（补剂占用/流水）的补剂适配。

### 2.2 不做

- 独立补剂商城、加购/换品牌/订阅、包材库存扣减、退货退款、鲜食/定制售后全量迁移。
- 完整产能算法（只按订单数）。
- 新订单汇总表、数据库视图（第一版不建；数据量上来再评估）。
- 新补剂消息表、新补剂日历表、新补剂包材主数据表。
- 自动分账/担保交易；当前微信直连商户，支付成功即收款。

---

## 三、现状与必须修掉的冲突

> 这些不是“新需求”，是现有代码与 v2 口径不一致的地方；不修会直接做错。

| # | 现状 | 与 v2 的冲突 | 方案 |
|---|---|---|---|
| C1 | `supplement-pricing.service.ts` 的 `goodsSubtotal = supplementPrice + serviceFee + packagingFee` | v2 的“商品小计”只算补剂商品；“满 ¥99 免服务费 / 满 ¥129 包邮”应按商品小计 | 拆出 `goodsAmount`；服务费/运费门槛按 `goodsAmount`；新增免服务费 |
| C2 | `createSupplementRefund` 一笔订单只支持一次退款，状态在订单字段上 | v2 要一单多次售后、累计退款、按 case 幂等 | 新建 `AftersaleCase`，退款按 case；订单旧字段只读 |
| C3 | `reshipOrder` 只要有 `reshipFromOrderNo` 就拒绝 | v2 允许不同售后记录各补发一次 | 改为按 `AftersaleCase.reshipOrderId` 判重；移除全局“补发过”检查 |
| C4 | `recordRefundRequest` / `reshipOrder` / `markAftersale` 把订单改成 `AFTERSALE` | v2 要求售后独立，原订单履约状态不变 | 新售后不再写订单状态；`AFTERSALE` 仅旧数据兼容 |
| C5 | `confirmPaymentFromWechat` 用 `paidAt: new Date()` | v2 要求用微信 `success_time`，否则截单判断会错 | 回调/主动查询把 `success_time` 传进来 |
| C6 | `AdminSupplementShopController` 类级 `StaffGuard`，员工可调退款/补发/取消 | v2 员工不能做资金动作 | 管理员动作方法级 `AdminGuard`；员工接口单独 DTO/权限 |
| C7 | 后端标签 60×40；小程序打印机 70×100 | 实际纸张 40×60 | 三处统一 40×60；小程序两个 printer 文件共用常量 |
| C8 | `DIYSheetStorageService.create` 按 user+recipe+dog 更新已有单 | 快照后更新会破坏“旧单保留” | 有 `snapshot` 时新建一张；无快照才更新 |
| C9 | 小程序 `CreateSupplementOrderPayload` 没有 `diySheetId` | 快照无法关联订单 | 草稿加 `diySheetId`，下单透传 |
| C10 | `InventoryAllocation` 没有 `sourceType`；`consumeAllocationsForOrderIds` 会捞所有来源 | 补剂/鲜食库存可能串 | 加 `sourceType`，现有鲜食方法默认过滤 `PRODUCTION` |
| C11 | 订单没有 `COMPLETED` 自动流转 | 订单永远停在已发货 | 定时任务：`SHIPPED + 10 天 → COMPLETED` |
| C12 | `OrderCenterService` 不存在；现有 `/orders` 只有鲜食+补剂两个 tab | 三类订单统一入口 | 新建通用 `OrderCenterService` + `/orders/center`；旧页保留做处理页 |
| C13 | 现有退款管理页只读鲜食/`OrderRefundRecord` | 补剂退款看不到 | 扩展现有 `/refunds` 页面，补剂读 `AftersaleCase`；不新建退款页 |
| C14 | 现有原料/库存页没有补剂包材/占用筛选 | 后台看不到补剂包材/占用 | 改造现有 `/ingredients`、`/inventory`；不新建模块 |

---

## 四、架构与模块边界

### 4.1 模块

| 模块 | 类型 | 职责 | 不做什么 |
|---|---|---|---|
| `supplement-shop` | 现有 | 报价、下单、分装、发货、补发编排 | 不做统一订单中心、不做售后状态机 |
| `supplement-scheduling` | 新服务（挂在 supplement-shop） | 算分装日、产能、改期、自动完成 | 不写库存、不写售后 |
| `supplement-inventory` | 新服务（挂在 supplement-shop 或 inventory） | 补剂预占/移动/释放/扣减 | 不算日期、不改订单状态 |
| `supplement-aftersale` | 新服务（挂在 supplement-shop） | `AftersaleCase` 状态机、退款/补发编排 | 不直接改订单履约状态 |
| `order-center` | 新 **只读** 模块 | 三类订单统一列表/筛选/计数 | 不写任何表；不做统一详情 |
| `supplement-packaging` | 新服务 | 包材规则、选袋、汇总 | 不扣包材库存（本轮） |
| `business-calendar` | 新服务 | 公司营业日判断 | 不管定制产能 |
| `message` / `wechat` | 现有 | 站内消息 + 订阅消息 | 不存补剂业务状态 |

> `OrderCenterService` **不是** `SupplementOrderCenterService`；它不属于补剂模块，放在独立 `order-center` 读模块。禁止在补剂模块里再建一个“补剂订单中心”。

### 4.2 依赖方向

```
Controller
  → SupplementOrderService
      → PricingService
      → SchedulingService → BusinessCalendarService
      → InventoryService (sourceType=SUPPLEMENT_PACK)
      → SnapshotService → DIYSheet
      → AftersaleService → WechatPaymentService
      → CustomerMessageService / WechatService

Controller
  → OrderCenterService (read-only, Prisma)
```

避免循环依赖：
- 售后不直接调用排期；补发单创建后，由排期服务单独排期。
- 排期不调用售后；取消/改期只释放库存、发通知。
- 订单中心只读，不调用业务写服务。

---

## 五、数据模型

### 5.1 新增枚举

```prisma
enum SupplementPackingDateSource {
  AUTO
  ADMIN
}

enum SupplementOrderEventType {
  SCHEDULED
  RESCHEDULED
  PACKED
  FORCE_PACKED
  SHIPPED
  COMPLETED
  CANCELLED
  ADDRESS_CHANGED
  REORDERED
  AFTERSALE_CREATED
  REFUNDED
  RESHIPPED
  SCHEDULE_FAILED
}

enum AftersaleOrderType {
  FOOD
  CUSTOM_RECIPE
  SUPPLEMENT
}

enum AftersaleCaseStatus {
  PENDING
  PROCESSING
  RESOLVED
  REJECTED
  CANCELLED
}

enum AftersaleRequestType {
  REFUND
  RESHIP
  OTHER
}

enum AftersaleResolutionType {
  REFUND
  RESHIP
  REGISTER_ONLY
  REJECT
}

enum SupplementPackagingRole {
  POUCH
  DESICCANT
  LABEL
}

enum InventoryAllocationSourceType {
  PRODUCTION
  SUPPLEMENT_PACK
}
```

`InventorySourceType` 增加：

```prisma
enum InventorySourceType {
  // ...现有值
  SUPPLEMENT_PACK_CONSUMPTION
}
```

### 5.2 `SupplementOrder` 加字段

```prisma
packingDate        DateTime?                    @map("packing_date") @db.Date
packingDateSource  SupplementPackingDateSource  @default(AUTO) @map("packing_date_source")
reorderFromOrderNo String?                      @map("reorder_from_order_no") @db.VarChar(32)
events             SupplementOrderEvent[]

@@index([packingDate, status])
@@index([reorderFromOrderNo])
```

- `packingDate` 是日期，UTC 零点代表上海日历日。
- 不新增 `shippingDate`、`scheduledAt`、`packedBy`、`rescheduleReason`。
- 金额字段保持现有；**不新增**“商品金额2/服务费2”。

### 5.3 `DIYSheet` 加字段

```prisma
recipeVersion Int?      @map("recipe_version")
snapshot      Json?     @map("snapshot")
snapshotAt    DateTime? @map("snapshot_at")
```

快照形状（v1，≤200KB）：

```json
{
  "version": 1,
  "frozenAt": "2026-10-20T...",
  "sheet": {
    "id": "...",
    "recipeId": "...",
    "recipeName": "...",
    "dogId": "...",
    "dogName": "...",
    "cycleDays": 7,
    "perMealG": 78,
    "dailyIntakeG": 156,
    "packagePlan": [],
    "purchaseList": [],
    "productionSteps": "..."
  },
  "recipe": {
    "id": "...",
    "recipeId": "...",
    "version": 3,
    "name": "...",
    "items": [
      {
        "ingredientId": "...",
        "name": "...",
        "type": "FOOD",
        "ratioPercent": 21,
        "exampleWeight": 210,
        "preparationMethod": "...",
        "supplementTargets": []
      }
    ]
  },
  "dog": { "id": "...", "name": "嘟嘟", "weightKg": 15, "mealsPerDay": 2 },
  "supplementLines": [
    {
      "ingredientId": "...",
      "name": "海藻粉",
      "brand": "NOW FOODS",
      "productModel": "227g/瓶",
      "unit": "g",
      "requestedAmount": 2.1,
      "packedAmount": 2.1,
      "bags": 1,
      "purchased": true
    }
  ]
}
```

- `supplementLines` 来自**食谱当前补剂清单**，`purchased` 标记本单是否购买；数量来自订单行。
- 不新建 `DIYSheetSnapshot` 表；不在订单里再存一份完整制作单。
- 快照只写一次；`snapshot` 非空即冻结。

### 5.4 `SupplementShopConfig` 加字段

```prisma
dailyCutoffTime      String   @default("17:00") @map("daily_cutoff_time") @db.VarChar(5)
dailyPackingCapacity Int      @default(30) @map("daily_packing_capacity")
autoScheduleEnabled  Boolean  @default(true) @map("auto_schedule_enabled")
aftersaleWindowDays  Int      @default(7) @map("aftersale_window_days")
autoCompleteDays     Int      @default(10) @map("auto_complete_days")
freeServiceThreshold Decimal? @default(99.00) @map("free_service_threshold") @db.Decimal(10, 2)
```

复用现有：`markupMultiplier`、`serviceFeeAmount`、`flatShippingFee`、`freeShippingThreshold`、`paymentTimeoutMinutes`、效期字段。

> 现有代码默认仍是 2.0/9.9/8/null；上线脚本/后台设置改成 2.5/10/6/129。**不靠 schema 默认值**。

### 5.5 `InventoryAllocation` 加字段

```prisma
sourceType InventoryAllocationSourceType @default(PRODUCTION) @map("source_type")

@@index([sourceType, status])
```

> **命名债**：`InventoryAllocationLine.quantityG` 和 `InventoryLedgerEntry.deltaG` 虽然叫 G，现有代码实际按原料 `baseUnit`（G/ML/PCS）存数量。补剂沿用同一约定，**不新增 `quantityBase` 字段**，否则同一数量会有两个落点。技术方案/注释里明确写“base unit quantity”。

### 5.6 新表 `AftersaleCase`

```prisma
model AftersaleCase {
  id                String                    @id @default(uuid()) @map("id")
  caseNo            String                    @unique @map("case_no") @db.VarChar(32)
  orderType         AftersaleOrderType        @map("order_type")
  orderId           String                    @map("order_id") @db.VarChar(36)
  orderNo           String?                   @map("order_no") @db.VarChar(32)
  customerId        String                    @map("customer_id")
  status            AftersaleCaseStatus       @default(PENDING) @map("status")
  requestType       AftersaleRequestType      @map("request_type")
  requestedReason   String                    @map("requested_reason") @db.VarChar(500)
  requestedPhotos   String[]                  @default([]) @map("requested_photos")
  source            String                    @default("CUSTOMER") @map("source") @db.VarChar(20)
  handlerId         String?                   @map("handler_id")
  handlingNote      String?                   @map("handling_note") @db.VarChar(1000)
  resolutionType    AftersaleResolutionType?  @map("resolution_type")
  refundAmount      Decimal?                  @map("refund_amount") @db.Decimal(10, 2)
  refundStatus      String?                   @map("refund_status") @db.VarChar(20)
  refundOutNo       String?                   @unique @map("refund_out_no") @db.VarChar(64)
  refundId          String?                   @map("refund_id") @db.VarChar(64)
  refundRequestedAt DateTime?                 @map("refund_requested_at")
  refundedAt        DateTime?                 @map("refunded_at")
  reshipOrderId     String?                   @map("reship_order_id") @db.VarChar(36)
  reshipOrderNo     String?                   @map("reship_order_no") @db.VarChar(32)
  acceptedAt        DateTime?                 @map("accepted_at")
  resolvedAt        DateTime?                 @map("resolved_at")
  rejectedAt        DateTime?                 @map("rejected_at")
  createdAt         DateTime                  @default(now()) @map("created_at")
  updatedAt         DateTime                  @updatedAt @map("updated_at")

  @@index([orderType, orderId])
  @@index([customerId, createdAt])
  @@index([status, createdAt])
  @@map("aftersale_case")
}
```

迁移里加**部分唯一索引**（Prisma schema 表达不了）：

```sql
CREATE UNIQUE INDEX aftersale_case_one_open_per_order
ON aftersale_case (order_type, order_id)
WHERE status IN ('PENDING', 'PROCESSING');
```

- 同一订单可多条历史，但只能一条未完结。
- `refundOutNo` 每笔唯一；退款回调按它找 case。
- 一单累计退款 = `SUM(refundAmount WHERE refundStatus='SUCCESS')`，不超实付。

### 5.7 新表 `SupplementOrderEvent`

```prisma
model SupplementOrderEvent {
  id        String                   @id @default(uuid()) @map("id")
  orderId   String                   @map("order_id")
  type      SupplementOrderEventType @map("type")
  fromValue String?                  @map("from_value") @db.VarChar(64)
  toValue   String?                  @map("to_value") @db.VarChar(64)
  actorType String                   @map("actor_type") @db.VarChar(20)
  actorId   String?                  @map("actor_id")
  reason    String?                  @map("reason") @db.VarChar(500)
  metadata  Json?                    @map("metadata")
  createdAt DateTime                 @default(now()) @map("created_at")

  order     SupplementOrder          @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@index([orderId, createdAt])
  @@index([type, createdAt])
  @@map("supplement_order_event")
}
```

### 5.8 新表 `SupplementPackagingRule`

```prisma
model SupplementPackagingRule {
  id           String                  @id @default(uuid()) @map("id")
  role         SupplementPackagingRole @map("role")
  ingredientId String                  @map("ingredient_id")
  physicalForm IngredientPhysicalForm? @map("physical_form")
  unitPattern  String?                 @map("unit_pattern") @db.VarChar(20)
  minAmount    Float?                  @map("min_amount")
  maxAmount    Float?                  @map("max_amount")
  priority     Int                     @default(0) @map("priority")
  enabled      Boolean                 @default(true) @map("enabled")
  note         String?                 @db.VarChar(200)
  createdAt    DateTime                @default(now()) @map("created_at")
  updatedAt    DateTime                @updatedAt @map("updated_at")

  ingredient   Ingredient              @relation(fields: [ingredientId], references: [id], onDelete: Restrict)

  @@index([role, enabled, priority])
  @@index([ingredientId])
  @@map("supplement_packaging_rule")
}
```

`Ingredient` 加反向关系 `supplementPackagingRules SupplementPackagingRule[]`。

### 5.9 订单中心索引

```prisma
// Order
@@index([status, createdAt])
// CustomRecipeOrder
@@index([status, createdAt])
// SupplementOrder 已有 [status, createdAt]
```

- 第一版不建视图/汇总表；三表查询 + 应用层合并。
- 如果单表 >5 万行或列表 P95 >800ms，再评估视图/搜索表（不在本轮）。

---

## 六、迁移与回填

### 6.1 迁移拆分

| 步骤 | 内容 | 是否锁表 |
|---|---|---|
| M1 | 枚举/新表/新列/索引/部分唯一索引 | 短暂 |
| S1 | `backfill-supplement-v2.ts --dry-run/--apply` 回填 `packingDate`、旧售后映射 | 分批，可暂停 |
| S2 | `configure-supplement-launch.ts --dry-run/--apply` 设置首发配置 | 单行更新 |

> 数据回填不放进 migration；便于 dry-run、分批、失败重跑。

### 6.2 `packingDate` 回填

| 订单状态 | 回填 |
|---|---|
| `SHIPPED` / `COMPLETED` | `shippedAt` 的上海日期；为空则 `packedAt`；再空则 `paidAt` 排期 |
| `PACKED` | `packedAt` 的上海日期 |
| `PAID` / `PACKING` | 按 `paidAt` + 截单/日历/产能跑一次排期；失败留空 + 事件 |
| `PENDING_PAYMENT` / `CANCELLED` | 不回填 |
| `AFTERSALE` | 先按原状态回填，再映射售后 case |

- 脚本幂等：只填空值，不覆盖已有日期。
- 每批 200 单，失败记录 ID，支持重跑。

### 6.3 旧售后映射

| 旧数据 | 映射 |
|---|---|
| `aftersaleType=REFUND` + `refundStatus` | 建 `AftersaleCase`（`source=MIGRATION`）；成功→`RESOLVED`，处理中→`PROCESSING`，失败→`PROCESSING` 并备注 |
| `aftersaleType=RESHIP` + `reshipFromOrderNo` | 建 case（`RESHIP`）；找到补发单→`PROCESSING`/`RESOLVED`；找不到→`PENDING` 备注 |
| 只有 `aftersaleAt`/`aftersaleReason` | 建 `OTHER` case，`PENDING`，备注“待人工核对” |
| 无售后字段 | 不建 |

- 旧订单状态**不改**；`AFTERSALE` 保留，人工处理完再迁。
- 旧 `refund*` 字段只读，不删除。
- 输出对账报告：建了多少 case、金额合计、无法判断清单。

### 6.4 配置设置

`configure-supplement-launch.ts` 只设置以下值，且先打印旧值：

```text
markupMultiplier=2.5
serviceFeeAmount=10
flatShippingFee=6
freeShippingThreshold=129
freeServiceThreshold=99
minOrderAmount=0
dailyCutoffTime=17:00
dailyPackingCapacity=30
autoScheduleEnabled=true
aftersaleWindowDays=7
autoCompleteDays=10
```

- 不静默覆盖非默认值；检测到已被人工改过则跳过并提示。
- 生产执行前备份 `supplement_shop_config` 单行。

### 6.5 回滚

- Schema 只加不删；回滚代码不删表/列。
- 特性开关（env）：
  - `SUPPLEMENT_AUTO_SCHEDULE_ENABLED`
  - `SUPPLEMENT_INVENTORY_RESERVATION_ENABLED`
  - `SUPPLEMENT_AFTERSALE_CASE_ENABLED`
  - `SUPPLEMENT_ORDER_CENTER_ENABLED`
  - `SUPPLEMENT_AUTO_COMPLETE_ENABLED`
- 售后开关关闭：新申请走旧 `markAftersale` 只读/人工；新 case 保留不丢。
- 订单中心关闭：旧 `/orders`、`/custom-recipes` 仍可用。
- 标签回滚：保留 40×60 纸张，只回滚排版版本。

---

## 七、核心服务设计

### 7.1 时间/日期工具

在 `backend/src/utils/timezone.util.ts` 增加：

```ts
type DateOnly = Date; // UTC 零点，代表上海日历日

static toShanghaiDateOnly(input: Date): Date;
static shanghaiDateKey(input: Date): string; // YYYY-MM-DD
static parseDateOnly(input: string): Date;   // YYYY-MM-DD -> UTC 零点
static addDays(dateOnly: Date, days: number): Date;
static weekday(dateOnly: Date): number;      // 用 getUTCDay()
static minutesOfDayInShanghai(input: Date): number;
static isBeforeCutoff(input: Date, cutoff: string): boolean;
```

- 全部用 UTC 方法处理 date-only，避免服务器本地时区把 00:00 变成前一天。
- 截单时间 `HH:mm` 正则校验；只支持 00:00–23:59。
- 不引入 dayjs/moment；现有依赖不增加。

### 7.2 `BusinessCalendarService`

```ts
isOpen(dateOnly: Date): Promise<boolean>;
nextOpen(dateOnly: Date): Promise<Date>;
```

读取顺序：

1. `custom_recipe_schedule`（具体某天）：`isAvailable && !isPublicHoliday`。
2. `custom_recipe_weekday_rule`（星期）：`isOpen`。
3. 默认：开。

**刻意不看** `capacity` / `bookedCount` / `deliveryCapacity`：
- 补剂产能按订单数单独算；
- 定制名额满了不代表公司关门。

> 不直接复用 `resolveDay()`：它把“定制容量满”也算成不开，补剂会误判。

### 7.3 `SupplementSchedulingService`

#### 接口

```ts
resolvePackingDate(paidAt: Date, now?: Date): Promise<Date>;
scheduleOrder(orderId: string, actor: Actor, opts?: { allowOverbook?: boolean; reason?: string }): Promise<void>;
rescheduleOrder(orderId: string, date: Date, actor: Actor, opts: { allowOverbook?: boolean; reason?: string }): Promise<void>;
countOrdersForDate(dateOnly: Date): Promise<number>;
autoCompleteShippedOrders(limit?: number): Promise<number>;
```

#### 算法

```
today = 上海今天
paidDate = 上海日期(paidAt)
candidate = paidDate
if paidDate == today and !beforeCutoff(paidAt, cutoff): candidate = today + 1
if paidDate < today: candidate = today

loop 0..59:
  if !calendar.isOpen(candidate): candidate += 1; continue
  count = countOrdersForDate(candidate)
  if count < capacity: return candidate
  candidate += 1
throw ScheduleUnavailable
```

- 付款时间 = 微信 `success_time`；人工确认 = 确认时间；拿不到才用 `now`。
- 产能计数：`packingDate = candidate AND status != CANCELLED`；补发单也计入。
- 当天已满：顺延；管理员可 `allowOverbook` 超排，事件 `metadata.overbook=true` + reason。
- 降上限不自动挪已排订单；后台标红。

#### 事务

```ts
await prisma.$transaction(async (tx) => {
  const count = await tx.supplementOrder.count({ where: {...} });
  if (count >= capacity && !allowOverbook) throw ...
  await tx.supplementOrder.update({ where: { id }, data: { packingDate, packingDateSource } });
  await inventory.reserveForOrder(tx, order);
  await tx.supplementOrderEvent.create({ ... });
}, { isolationLevel: 'Serializable' });
```

- 捕获 `P2034`（serialization failure）重试 3 次，指数退避 20/50/100ms。
- 幂等：已排到同一天直接返回；不重复建 allocation。
- 排期失败：`packingDate=null` + `SCHEDULE_FAILED`；订单仍 `PAID`；定时任务每分钟重试（批量 50）。
- 管理员改期：只允许 `PAID`（未分装）；`PACKED/SHIPPED/COMPLETED/CANCELLED` 拒绝。先 `rescheduleOrder`，移动 allocation；停发日拒绝；满员日需 `allowOverbook` + reason。
- `paidAt` 晚于当前时间（时钟偏差）按今天处理，不排到未来。

#### 自动完成

- 每小时跑：`status=SHIPPED AND shippedAt <= now - autoCompleteDays`。
- 批量 200，事务内 update + event `COMPLETED`；`completedAt = now`。
- 与售后窗口解耦：售后 7 天，自动完成 10 天；完成不关闭售后入口（窗口仍按 shippedAt）。
- 有未完结 REFUND case 时也允许自动完成（售后独立）；但订单中心同时显示“已完成 + 售后中”，不隐藏 case。
- 特性开关关闭时不动。

#### 定时任务注册

- 现有 scheduler 模块注册：
  - `supplement-schedule-retry` 每分钟。
  - `supplement-auto-complete` 每小时。
  - `supplement-payment-timeout` 沿用现有。
- 任务要加锁（`pg_try_advisory_lock` 或现有 scheduler 锁），避免多实例重复。

### 7.4 `SupplementInventoryService`

#### 单位

```ts
toBaseQuantity(item: SupplementOrderItem, ingredient: Ingredient): number
```

支持 1:1（显示单位与 `baseUnit` 是同一计量）：
- `g/克` → `G`
- `ml/毫升` → `ML`
- `粒/片/个` → `PCS`
- `平勺` → `PCS`：1 平勺 = 1 PCS。例：一瓶 2000 平勺，`purchaseUnit=瓶`、`baseUnit=PCS`、`purchaseToBaseRatio=2000`；库存按 2000 PCS 记，**不需要换算成克**。

规则：
- **不要求统一换算成克**；库存按原料自己的 `baseUnit` 记账。
- 只有“显示单位无法 1:1 对应 `baseUnit`”才拦截：例如显示 `g` 但 `baseUnit=PCS`，或显示 `平勺` 但 `baseUnit=G` 且没有克/勺换算。
- 整勺计量用 `PCS`；配方按克/半勺计量时用 `G`，并把显示单位改成 `g`，不在运行时猜密度。
- 现有 `roundUpPackAmount` 已把 `平勺` 当 countable，向上取整到整勺；与 `PCS` 库存口径一致。

总量 = `packedAmount * bags`（加量是每袋同样规格）。

#### 方法

```ts
reserveForOrder(tx, order): Promise<void>;
moveReservation(tx, orderId, newDate): Promise<void>;
releaseForOrder(tx, orderId): Promise<void>;
consumeForOrder(tx, orderId, actor): Promise<void>;
```

- 预占：`InventoryAllocation` + lines，`sourceType=SUPPLEMENT_PACK`，`targetDate=packingDate`，`sourceOrderIds=[orderId]`。
- 移动：按 `sourceType + sourceOrderIds has orderId + status ACTIVE` 找 allocation，更新 `targetDate`。
- 释放：`status=RELEASED`，`releasedAt=now`。
- 扣减：`status=CONSUMED`，写 `InventoryLedgerEntry`：
  - `sourceType=SUPPLEMENT_PACK_CONSUMPTION`
  - `sourceId=orderId`
  - `deltaG=-baseQty`
  - 唯一键 `[sourceType, sourceId, ingredientId]` 防重复。
- 强制分装：允许负库存；事件 `FORCE_PACKED` + reason；不阻断 ledger。
- 现有鲜食方法加 `sourceType: PRODUCTION` 过滤（`consumeAllocationsForOrderIds` 增加参数，默认 PRODUCTION；补剂显式传 SUPPLEMENT_PACK）。
- `InventorySourceType` 新增值后，更新 `resolveSourceLabel` 的 `Record` 映射，否则 `tsc` 会报穷举缺失。
- **事务边界**：新增 `reserveForOrder(tx, ...)` / `consumeForOrder(tx, ...)` 的 `Prisma.TransactionClient` 版本；不要在外层事务里调用会自己开 `$transaction` 的旧方法——Prisma 嵌套事务会另开连接，不是原子操作。把现有 `createAllocationForOrderDemand` / `consumeAllocationsForOrderIds` 拆出 `*InTx` 私有实现，public 方法只负责包事务。
- 库存不足不阻止排期；分装时员工不能完成；管理员强制。
- 预占开关开启但没有 ACTIVE allocation 时：正常分装拒绝并告警；管理员强制可分装，但必须补写 ledger 并事件留痕。不能静默不扣库存。

### 7.5 `SupplementSnapshotService`

```ts
freezeForOrder(tx, { orderId, userId, diySheetId }): Promise<void>;
```

流程：

1. 校验 `DIYSheet.userId`；校验 `order.userId`。
2. 校验 `diySheet.recipeId == order.recipeId`、`dogId == order.dogId`（为空则跳过）。
3. 如果 `sheet.snapshot` 已存在：不覆盖；校验订单来源一致；返回。
4. 加载 `Recipe` + `RecipeItem` + 相关 `Ingredient`；加载 `Dog`。
   - 先按 `Recipe.id = diySheet.recipeId` 查；查不到再按 `Recipe.recipeId` 取最新版本（兼容逻辑 id / 版本 id 两种历史数据）。
5. 构建快照 JSON（见 5.3）；`supplementLines` 用订单行 + 食谱补剂清单合并。
6. `tx.dIYSheet.update` 写 `snapshot/recipeVersion/snapshotAt`。
7. 订单 `diySheetId` 已在创建时落库；不重复写。

边界：

- `diySheetId` 缺失（旧客户端）：不冻结，不阻塞下单；记录 warning。
- `diySheetId` 不属于用户 / recipe 不匹配 / dog 不匹配：400，拒绝下单。
- `DIYSheetStorageService.create` 查最新一张（`orderBy createdAt desc`）；冻结后内容变化才新建。
- `Recipe` 查不到：快照 `recipe=null`，写 `snapshotWarning`，订单继续；后台告警。
- 快照只写一次；事后改食谱不影响。
- 快照 JSON 超过 200KB：截断非必填的 `purchaseList/productionSteps` 长文本并告警，不静默丢核心字段。
- 冻结后再生成制作单：`DIYSheetStorageService.create` 检测 `snapshot != null`：
  - 入参内容与冻结单一致（recipeName/dogName/cycleDays/perMealG/dailyIntakeG/packagePlan/purchaseList/productionSteps 的哈希相同）→ 返回旧单，避免自动保存每次都新建；
  - 内容有变化 → **新建一行**，返回新 id；不覆盖旧单。

`DIYSheetResponseDto` 增加 `recipeVersion/snapshot/snapshotAt`；小程序有快照时优先用快照渲染。

### 7.6 `SupplementAftersaleService`

```ts
createForCustomer(userId, orderId, dto): Promise<AftersaleCase>;
listForOrder(userId, orderId): Promise<AftersaleCase[]>;
getCase(userId, caseId): Promise<AftersaleCase>;
cancelByCustomer(userId, caseId): Promise<AftersaleCase>;
resolve(adminId, caseId, dto): Promise<AftersaleCase>;
```

#### 创建

- 校验订单属于用户、`orderType=SUPPLEMENT`。
- `PACKED` 有未完结 REFUND case 时，`shipOrder` 拒绝并提示先处理退款。
- 补发单/0 元单不能退款（`amountTotal > 0` 才允许 REFUND）；可以走 RESHIP/登记。
- 允许状态：`PACKED` / `SHIPPED` / `COMPLETED`；`PAID` 只能取消订单，不能售后。
- **PACKED 边界（待老板确认）**：
  - `PACKED` 只允许**全额退款**（`refundAmount = amountTotal`），不允许部分退款、不允许 `RESHIP`；部分退款/补发只在 `SHIPPED/COMPLETED` 做。
  - `PACKED` 有未完结 `REFUND` 时，`shipOrder` 必须拒绝。
  - `PACKED` 未发货的售后窗口从 `packedAt` 起算（不是 `shippedAt`，因为还没发货）；发货后仍按 `shippedAt`。
  - `PACKED` 全额退款成功后，订单置 `CANCELLED`、写 `CANCELLED` 事件；**库存已在分装时消耗，不释放**（若异常未扣减，才释放 allocation）。
  - `PACKED` 退款被驳回后，允许正常发货。
  - 如果老板要求 PACKED 也能部分退款/补发/不改订单状态，需要另行定义，否则会出现“退款了还发货”“部分退款后剩余货怎么发”“补发两张”等问题。
- `SHIPPED/COMPLETED` 的退款/补发：订单履约状态不变，只更新 case。
- 窗口：`SHIPPED/COMPLETED` 按 `shippedAt + aftersaleWindowDays`；`PACKED` 按 `packedAt + aftersaleWindowDays`（待确认）。
- 同一订单已有 `PENDING/PROCESSING` → 拒绝。
- 驳回后同原因再次申请：同一订单同原因最多 2 次；第 3 次拒绝，管理员可 override（写 reason）。
- 写 case + `AFTERSALE_CREATED` 事件；发站内/订阅“已受理”。
- 顾客撤回：仅 `PENDING`；`CANCELLED`。

#### 处理

| 结论 | 动作 | case 状态 |
|---|---|---|
| `REFUND` | 先写 `resolutionType=REFUND`，再调 `createSupplementRefundForCase`；成功后回写 | `PROCESSING` → 回调 `SUCCESS` → `RESOLVED` |
| `RESHIP` | 先写 `resolutionType=RESHIP`，创建 0 元补发单；排期；预占 | `PROCESSING`；补发单 `SHIPPED` 后 `RESOLVED` |
| `REGISTER_ONLY` | 只登记 | `RESOLVED` |
| `REJECT` | 填原因 | `REJECTED` |

- 退款失败：case 保持 `PROCESSING`，`refundStatus=FAILED/ABNORMAL`，可重试；不重复退款。
- 补发：每个 case 最多一张；`AftersaleCase.reshipOrderId` 判重；不再用 `reshipFromOrderNo` 全局判重。
- 原订单状态不变；不再写 `AFTERSALE/aftersale*/refund*`。
- 员工只读：列表/详情可见，不能调 resolve。

#### 退款累计

```ts
paid = order.amountTotal
success = SUM(case.refundAmount WHERE refundStatus='SUCCESS')
inflight = SUM(case.refundAmount WHERE refundStatus IN ('PENDING','PROCESSING'))
available = paid - success - inflight
newAmount <= available
```

- 退款金额 >0；累计不超实付。
- 同一 case 重试复用同一个 `outRefundNo`。
- 退款回调：先按 `AftersaleCase.refundOutNo` 找；找不到再走旧 `SupplementOrder.refundOutNo`（兼容）。

### 7.7 `WechatPaymentService` 改造

新增：

```ts
createSupplementRefundForCase(input: {
  caseId: string;
  amount?: number;
  reason: string;
  adminId?: string | null;
}): Promise<{ outRefundNo; refundId; status; amount; reused }>;
```

- 载入 case + order；校验 `orderType=SUPPLEMENT`、已支付、`WECHAT_PAY`。
- 金额校验按 7.6；`outRefundNo` 用 `caseNo` 生成。
- 调微信退款；写 case `refundOutNo/refundId/refundStatus/refundRequestedAt`；case `PROCESSING`；事件 `REFUNDED`（发起）。
- 幂等：case 已有 `SUCCESS`/处理中 → 返回已有；失败可重试同一 `outRefundNo`。
- 回调：`handleSupplementRefundNotify` 先查 case；更新 case；成功写 `resolvedAt`；再写事件。
- 保留旧 `createSupplementRefund(orderId)` 作为**兼容/回滚**，内部转调 case？建议：
  - 新代码只调 case 版；
  - 旧方法标记 deprecated，保留一个版本，内部创建/复用 case 后调用 case 版，避免两套退款逻辑。
- 支付回调：
  - `handleSupplementNotify` 解析 `success_time`，传给 `confirmPaymentFromWechat(orderId, transactionId, successTime)`。
  - `syncSupplementPayment` 查询返回 `success_time`，同样传。
  - `confirmPaymentFromWechat` 写 `paidAt = successTime ?? new Date()`；然后触发排期（try/catch，不阻塞支付确认）。

### 7.8 `OrderCenterService`

第一版**不建视图/汇总表**，用三表查询 + 应用层合并：

```ts
list(query: OrderCenterQuery, actor: Actor): Promise<OrderCenterPage>;
```

- 类型：`FOOD` = `Order` 表（含 `FRESH_FOOD/TASTING_PACK/CUSTOM_SERVICE`，显示子类型）；`CUSTOM_RECIPE` = `CustomRecipeOrder`；`SUPPLEMENT` = `SupplementOrder`。
- 统一状态组按需求 v2 3.10.2：

| 统一组 | 鲜食 | 定制 | 补剂 |
|---|---|---|---|
| 待处理 | INIT | — | — |
| 待付款 | PENDING_PAYMENT | PENDING_PAYMENT | PENDING_PAYMENT |
| 处理中 | PAID / PURCHASING / IN_PRODUCTION | PAID / IN_PROGRESS | PAID（含待排期） |
| 待发货 | FREEZING | — | PACKED |
| 已发货 | SHIPPED | — | SHIPPED |
| 已完成 | COMPLETED | DELIVERED / COMPLETED | COMPLETED |
| 已取消 | CANCELLED | CANCELLED | CANCELLED |

```ts
type UnifiedStatusGroup =
  | 'PENDING'
  | 'PENDING_PAYMENT'
  | 'IN_PROGRESS'
  | 'TO_SHIP'
  | 'SHIPPED'
  | 'COMPLETED'
  | 'CANCELLED';
```

- 过滤：类型、统一状态组、日期范围、关键词、是否有未完结售后。
  - 日期默认按下单时间 `createdAt`；补剂可选 `dateField=packing` 按 `packingDate` 过滤，避免“订单日期/分装日”混用。
- 关键词：先按订单号前缀；再按用户姓名/手机号查 `User.id`（最多 50 个）后过滤；不做全表 `LIKE`。
- 分页：每类取 `page * pageSize`（上限 500），合并按 `createdAt desc` 排序，slice；总数分别 count 后相加。
- 状态映射纯函数：`mapFoodStatus/mapCustomStatus/mapSupplementStatus` → `PENDING_PAYMENT / IN_PROGRESS / TO_SHIP / SHIPPED / COMPLETED / CANCELLED`。
- **售后不是订单状态**：列表项单独返回 `hasOpenAftersale`/`aftersaleLabel`；筛选 `aftersale=true` 按未完结售后过滤，不替换履约状态。鲜食旧 `AFTERSALE` 映射为“处理中/已发货 + 售后中标签”，不新增第二套状态；售后中不是状态组里的第七个状态。
- 售后标记：补剂查 `AftersaleCase` open；鲜食/定制先用现有字段/状态；不阻塞列表。
- 员工：返回前删掉金额、退款、管理员备注字段；只读。
- 性能阈值：单表 >5 万或 P95 >800ms 时，再评估视图/搜索表；不提前建。
- 控制器：`GET /api/v1/admin/order-center`，`StaffGuard`；员工/管理员都可读。

> `OrderCenterService` 放在 `order-center` 目录，不放在 `supplement-shop`。

### 7.9 `SupplementPackagingService`

```ts
resolvePouch(physicalForm, unit, amountPerBag): Promise<{ ingredientId; sizeLabel }>;
buildSummary(date): Promise<PackingSummary>;
```

- 包材主数据：`Ingredient(type=PACKAGING)`，不新建表。
- 选袋规则：`SupplementPackagingRule`，角色 `POUCH`；按 `physicalForm + unitPattern + min/max` 命中；多条取 `priority` 高/区间窄。
- 干燥剂/标签：固定 1/袋；规则可配但默认。
- 汇总：按分装日聚合订单行 → 需要袋数/标签数/干燥剂数；本轮不扣包材库存。
- 未配置规则：汇总提示，不阻塞已排订单分装；上线检查失败。

### 7.10 通知

不新建独立通知模块/表。在 `supplement-shop` 内用一个小型纯函数文案模块 `supplement-notification.copy.ts`，发送仍用：

- `CustomerMessageService.send`（站内，必达）
- `WechatService.sendSubscriptionMessage`（订阅，失败只记日志）

事件：

| 事件 | 站内 | 订阅模板 |
|---|---|---|
| 排期确认 | ✅ | `WECHAT_TEMPLATE_SUPPLEMENT_SCHEDULE` |
| 正常发货 | ✅ | `WECHAT_TEMPLATE_SUPPLEMENT_SHIPPED` |
| 延迟 | ✅ | `WECHAT_TEMPLATE_SUPPLEMENT_DELAY` |
| 售后受理/完成/驳回/退款到账/补发发货 | ✅ | `WECHAT_TEMPLATE_SUPPLEMENT_AFTERSALE` |

- 模板 ID 走 env；未配置时跳过订阅，不报错。
- 去重：同订单同事件 5 分钟内只发一次（查 `CustomerMessage` 最近记录）。
- `linkType='SUPPLEMENT_ORDER'`，`linkId=order.id`；消息跳转必须校验归属。

### 7.11 地址修改

`PATCH /api/v1/supplement-orders/:id/address`

- 顾客/管理员；校验订单归属 + 地址归属。
- 允许 `PENDING_PAYMENT/PAID/PACKED`；`SHIPPED/COMPLETED/CANCELLED` 拒绝。
- 更新 `shippingAddressSnapshot`；写 `ADDRESS_CHANGED` 事件（原/新地址脱敏）。
- `PACKED` 返回 `needsReprint=true`；前端提示重打面单。
- `setAsDefault` 可选，只改用户默认地址，不影响订单快照。

### 7.12 再次购买

`POST /api/v1/supplement-orders/:id/repurchase`

- 校验订单归属；读原单 items（优先）或快照 `supplementLines`。
- 补发单/0 元单再次购买时，按**当前商品价格**报价，不复制 0 元价格。
- 返回**报价草稿**：当前可售/价格/缺货；不直接创建订单。
- 不要求当前 DIY 制作单；`diySheetId` 可空。
- 前端用草稿填充下单页；创建订单时带 `reorderFromOrderNo`。
- 服务端校验来源订单属于用户；写 `REORDERED` 事件（下单成功后）。
- 不额外弹“价格可能变化”。

### 7.13 标签 40×60

后端 `supplement-label.service.ts`：

```ts
canvas: { widthMm: 40, heightMm: 60 } // 8px/mm => 320×480
margin: { topMm: 3, rightMm: 3, bottomMm: 3, leftMm: 3 }
```

- 重新排版：品牌 2.2mm、品名 3.2mm（最多 2 行）、分装量 4.2mm、日期 2.4mm、原品 2.0mm、提示 1.8mm；行高 1.25。
- 必印字段优先：品名、分装量、分装日期、有效期、储存、原品、分装者、用法、干燥剂提示。
- 长品名压力测试：洋车前子壳粉、维生素 B 族、柠檬酸钙粉；不得溢出。
- 小程序：
  - `utils/jcing-printer.ts` 和 `pages/staff-supplement-orders/utils/jcing-printer.ts` 的 `LABEL_PAPER_WIDTH_MM/HEIGHT_MM` 改 40/60。
  - 抽 `utils/label-paper.ts` 导出 `SUPPLEMENT_LABEL_PAPER = { widthMm:40, heightMm:60 }`，两个 printer 文件共用；不再各写一份。
  - `labels.vue` 的 `CANVAS_WIDTH/HEIGHT` 改 320/480（8px/mm）。
  - `startDrawLabel`/`drawImage` 使用常量。
- 后台 `LabelPrint.vue` 预览 CSS 按 40×60；A4 备用页同步。
- 补打：只记录打印日志/次数，不重复扣库存；不改订单状态。

### 7.14 旧接口兼容（过渡一个版本）

现有后台还在调 `/orders/:id/aftersale`、`/refund`、`/reship`。直接删会让旧页面报错，因此保留为**薄适配器**：

| 旧接口 | 过渡行为 |
|---|---|
| `POST /orders/:id/aftersale` | 创建 case（`source=ADMIN`，`requestType` 按入参），不写订单状态 |
| `POST /orders/:id/refund` | 找/建该订单的 OPEN `REFUND` case，调 `createSupplementRefundForCase` |
| `POST /orders/:id/reship` | 找/建该订单的 OPEN `RESHIP` case，调新补发 |

- 新代码不再直接调 `markAftersale` / `recordRefundRequest` / `applyRefundResult` / `reshipOrder`；这些方法只保留给旧回调/旧数据。
- 后台前端切到新接口后，删除适配器（下一个版本）。
- 过渡期旧页面可能看不到新 case 的完整信息；上线顺序必须是“后台新页面先上，再开售后开关”。

### 7.15 定价修正

`supplement-pricing.service.ts` 改造：

```ts
goodsAmount = sum(line.price)                    // 商品小计，不含服务费/包材/运费
serviceFeeWaived = freeServiceThreshold != null
  && freeServiceThreshold > 0
  && goodsAmount >= freeServiceThreshold
serviceFee = serviceFeeWaived ? 0 : configuredServiceFee
packagingFee = packagingFeePerBag * bagCount
freeShipping = freeShippingThreshold != null
  && freeShippingThreshold > 0
  && goodsAmount >= freeShippingThreshold
shippingFee = freeShipping ? 0 : shipping.fee
total = goodsAmount + serviceFee + packagingFee + shippingFee
minOrderAmount: goodsAmount
```

- `freeServiceThreshold` 为 null 或 0 = 不启用免服务费。
- `freeShippingThreshold` 为 null 或 0 = 不包邮。
- Quote 返回新增：`goodsAmount`、`serviceFeeWaived`、`freeServiceThreshold`、`serviceFeeBeforeWaiver`。
- 保留 `goodsSubtotal` 字段名（前端兼容），值改为 `goodsAmount`；在 DTO 注释写清“商品小计，不含服务费/包材/运费”。
- `SupplementOrder.amountGoods` 写 `goodsAmount`；`amountSupplement` 同值（历史字段保留）。
- `pricingSnapshot` 记录 `pricingVersion=2`、`goodsAmount/serviceFeeWaived/freeServiceThreshold`。
- **历史订单不重算**：旧 `amountGoods` 含服务费/包材，语义与新单不同；报表商品金额统一用 `amountSupplement`，新单可用 `pricingSnapshot.pricingVersion=2` 区分。
- 后台配置页加免服务费门槛、截单/产能/售后窗口/自动完成。

---

## 八、API / DTO

### 8.1 顾客端

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| POST | `/api/v1/supplement-orders` | 创建；支持 `diySheetId` / `reorderFromOrderNo` | 顾客 |
| PATCH | `/api/v1/supplement-orders/:id/address` | 未发货改地址 | 顾客/管理员 |
| POST | `/api/v1/supplement-orders/:id/cancel` | 未分装取消 + 退款 + 释放 | 顾客 |
| POST | `/api/v1/supplement-orders/:id/repurchase` | 再次购买报价草稿 | 顾客 |
| POST | `/api/v1/supplement-orders/:id/aftersales` | 申请售后 | 顾客 |
| GET | `/api/v1/supplement-orders/:id/aftersales` | 售后记录 | 顾客 |
| GET | `/api/v1/aftersales/:id` | 售后详情 | 顾客 |
| POST | `/api/v1/aftersales/:id/cancel` | 撤回 PENDING | 顾客 |

DTO：

```ts
CreateSupplementOrderDto += {
  reorderFromOrderNo?: string;
  // diySheetId 已有，客户端必须传
}

UpdateSupplementAddressDto = {
  addressId: string;
  setAsDefault?: boolean;
}

CreateSupplementAftersaleDto = {
  requestType: 'REFUND' | 'RESHIP' | 'OTHER';
  reason: string;
  photos?: string[];
  amount?: number; // 仅 REFUND，可选
}
```

### 8.2 后台/员工

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| GET | `/api/v1/admin/order-center` | 三类订单统一列表 | 员工/管理员 |
| POST | `/api/v1/admin/supplement-shop/orders/:id/schedule` | 改分装日 | 管理员 |
| POST | `/api/v1/admin/supplement-shop/orders/:id/force-pack` | 强制分装 | 管理员 |
| POST | `/api/v1/admin/supplement-shop/orders/:id/pack` | 正常分装 | 员工/管理员 |
| POST | `/api/v1/admin/supplement-shop/orders/:id/ship` | 发货 | 员工/管理员 |
| POST | `/api/v1/admin/supplement-shop/orders/:id/refund` | 按售后 case 退款 | 管理员 |
| POST | `/api/v1/admin/supplement-shop/orders/:id/reship` | 按售后 case 补发 | 管理员 |
| GET | `/api/v1/admin/supplement-shop/aftersales` | 售后列表 | 员工/管理员（只读） |
| POST | `/api/v1/admin/supplement-shop/aftersales/:id/resolve` | 受理/退款/补发/登记/驳回 | 管理员 |
| GET | `/api/v1/admin/supplement-shop/refunds` | 补剂退款记录 | 管理员 |
| POST | `/api/v1/admin/supplement-shop/refunds/:id/retry` | 重试退款 | 管理员 |
| GET | `/api/v1/admin/supplement-shop/dashboard` | 看板指标 | 管理员 |
| GET/PUT | `/api/v1/admin/supplement-shop/packaging-rules` | 包材规则 | 管理员 |
| GET/PUT | `/api/v1/admin/supplement-shop/config` | 现有，加字段 | 管理员 |

DTO：

```ts
ScheduleSupplementOrderDto = {
  packingDate: string; // YYYY-MM-DD
  reason?: string;
  allowOverbook?: boolean;
}

PackSupplementOrderDto = {
  items: Array<{ itemId: string; batchNo?: string; sourceExpiryDate: string }>;
}

ForcePackSupplementOrderDto = {
  items: ...;
  reason: string;
}

ResolveAftersaleDto = {
  resolutionType: 'REFUND' | 'RESHIP' | 'REGISTER_ONLY' | 'REJECT';
  refundAmount?: number;
  note?: string;
  rejectReason?: string;
}

OrderCenterQueryDto = {
  type?: 'FOOD' | 'CUSTOM_RECIPE' | 'SUPPLEMENT';
  status?: UnifiedStatusGroup; // 不含 AFTERSALE；售后用 aftersale 过滤
  dateFrom?: string;
  dateTo?: string;
  keyword?: string;
  aftersale?: boolean;
  page?: number;
  pageSize?: number;
}
```

### 8.3 权限

- 顾客：`AuthGuard` + 订单/地址/case 归属校验。
- 员工：`StaffGuard`；只读订单/分装/发货；**不显示/不能调**改期、强制分装、退款、补发、驳回。
- 管理员：`AdminGuard`；资金/改期/强制/配置/包材/日历。
- 不能只靠前端隐藏：后端每个管理员方法必须 `AdminGuard`；员工调用返回 403。
- **已确认**：员工不看订单金额/退款金额/管理员备注；订单中心/详情 DTO 删除这些字段；详情不要原样复用 `getOrderById`，新增 staff 选择字段的 DTO。
- `CustomerMessageService.send` 的 `linkType` 类型 union 增加 `SUPPLEMENT_ORDER`；消息跳转必须校验归属。

---

## 九、前端改造

### 9.1 顾客小程序

- `pages/diy-sheet/index.vue`
  - 保存/购买草稿带 `diySheetId`（使用 `DIYSheetStorageService.create` 返回的 id）。
  - 有 `snapshot` 时优先用快照渲染；顶部显示“已冻结”说明。
  - 重新生成制作单：后端返回新 id；旧单保留。
- `pages/supplement-order/index.vue`
  - 创建订单带 `diySheetId`、`reorderFromOrderNo`。
  - 结算页展示商品小计/服务费/运费/合计；免服务费/包邮标签。
- `pages/supplement-orders/index.vue` / detail
  - 状态、预计发货日、改地址、售后、再次购买、快照入口。
  - 售后状态独立显示，不覆盖履约状态。
- `pages/c-me` / messages
  - 我的：一个订单入口、角标含三类。
  - 消息：`SUPPLEMENT_ORDER` 跳转；分类筛选。
- 售后申请页：7 天窗口、照片选填、已有未完结拦截。
- 地址修改页：未发货可改；已发货提示联系客服；已打面单提示重打。

### 9.2 后台 admin-web

- 新增 `views/OrderCenter/index.vue`，路由 `/orders/center`；类型/状态/日期/关键词/售后筛选；表格；操作跳原详情页。
  - 侧边栏“订单中心”指向新页；旧 `/orders`、`/custom-recipes` 保留为处理页。
- 扩展现有 `views/Aftersale/RefundManagement.vue`（`/refunds`）：
  - 来源筛选：补剂/鲜食/定制（定制先只读或后续）。
  - 补剂行读 `AftersaleCase`；失败可重试；不新建页面。
- 新增 `views/SupplementShop/Dashboard.vue`，路由 `/supplement-shop/dashboard`；只读指标；告警跳订单中心/退款。
- `views/SupplementShop/Config.vue`：加截单/产能/售后窗口/自动完成/免服务费门槛；默认值提示。
- `views/Ingredients/index.vue`：加 PACKAGING 筛选/字段；包材档案。
- `views/Inventory.vue`：加 `sourceType=SUPPLEMENT_PACK` 筛选、占用/流水。
  - 数量列不要写死“g”；按原料 `unitDisplayLabel` 显示（平勺/粒/片/g/ml），底层仍是 `quantityG/deltaG` 的 base-unit 数量。
- `views/SupplementShop/components/SupplementOrdersPanel.vue`：
  - 状态不含 `PACKING`；排期/产能/缺料/售后/地址审计/快照。
  - 分装/发货；强制分装单独 admin 入口。
  - 退款/补发走 case；显示累计可退。
- 标签预览/打印 40×60。

### 9.3 员工小程序

- 新增 `pages/staff-order-center/index`：统一订单列表，调 `/admin/order-center`；类型/状态/日期/关键词；详情跳现有 `staff-orders/detail` 或 `staff-supplement-orders/detail`。
- `staff-workbench`：合并为一个“订单”入口；角标含三类。
- `staff-supplement-orders/detail`：
  - 每个补剂一条分装数据；缺料阻断；标签；发货。
  - 不显示管理员动作（改期/强制/退款/补发）；不展示订单金额/退款金额。
- `staff-summary`：分装汇总手机版。
- 标签打印：40×60；补打单张；不重复扣库存。
- 定制只读详情保留。

---

## 十、状态机 / 并发 / 幂等

### 10.1 补剂订单

```
PENDING_PAYMENT --支付--> PAID --分装--> PACKED --发货--> SHIPPED --10天/手动--> COMPLETED
PENDING_PAYMENT --取消/超时--> CANCELLED
PAID --取消--> CANCELLED
```

- 不使用 `PACKING`（旧数据按 PAID）；`packOrder` 的守卫从 `['PAID','PACKING']` 改为只允许 `PAID`。
- 售后不改订单状态；`AFTERSALE` 仅旧数据。
- 退款/补发不影响履约状态。

### 10.2 售后

```
PENDING --受理--> PROCESSING --退款成功/补发发货--> RESOLVED
PENDING --驳回--> REJECTED
PENDING --顾客撤回--> CANCELLED
PROCESSING --退款失败--> PROCESSING（可重试）
```

### 10.3 并发/幂等

| 场景 | 做法 |
|---|---|
| 并发排期 | Serializable + P2034 重试；count + update 同事务 |
| 并发分装 | `updateMany where status IN (PAID,PACKING)` 条件更新；失败即已处理 |
| 重复支付回调 | 已 PAID 直接返回；事件不重复 |
| 重复退款 | case + outRefundNo 幂等；累计校验；回调按 outRefundNo |
| 重复补发 | case.reshipOrderId 判重；唯一索引/条件更新 |
| 重复售后 | 部分唯一索引 + 应用层检查 |
| 重复下单 | 现有支付超时/幂等；新增 `reorderFromOrderNo` 不唯一 |
| 重复扣库存 | ledger 唯一键 `[sourceType, sourceId, ingredientId]` |
| 定时任务多实例 | advisory lock/scheduler 锁 |

---

## 十一、测试

### 11.1 单元

- 日期/截单：16:59 / 17:00 / 17:01、周末、节假日、连续停发、60 天上限。
- 日历：具体某天 > 星期 > 默认；定制容量满不影响补剂。
- 产能：29/30/31 单；补发计入；降上限不挪单。
- 定价：商品小计、免服务费、包邮、最低起送、圆整。
- 库存：g/ml/粒/片/平勺 1:1（平勺按 PCS）；预占/移动/释放/扣减；负库存强制。
- 快照：形状、只写一次、冻结后新建制作单、recipe 缺失。
- 售后：一单一条未完结、累计退款、一次补发、退款失败、旧数据映射。
- 订单中心：三类映射、筛选、分页、员工脱敏。
- 标签：40×60、长品名、必印字段。
- 权限：员工调管理员接口 403。

### 11.2 集成

- 下单（带 diySheetId）→ 快照 → 支付 → 排期 → 预占 → 分装 → 扣减 → 发货 → 10 天完成。
- 改期 → 移动 allocation；取消 → 释放；退款 → 释放/不重复。
- 售后多次：部分退款 + 补发；累计不超实付；一单一条未完结。
- 退款失败/回调丢失/重试；补发单取消。
- 地址修改 + 面单重打标记。
- 订单中心三类列表/筛选/员工脱敏。
- 员工 403；顾客越权 404/403。

### 11.3 回归

- 鲜食订单/生产/售后全绿。
- 定制订单/交付/售后全绿。
- 补剂现有报价/下单/标签不回归。
- 现有退款管理/财务页不回归。

### 11.4 性能/安全

- 排期 50 并发不超卖。
- 订单中心 1 万/5 万数据 P95。
- 退款并发不重复打款。
- 越权用例（顾客 A 改 B 地址、员工调管理员接口、消息 linkId 越权）。

### 11.5 人工

- 40×60 实物标签打样：最长品名、最长提示、贴 6×8 袋。
- 员工现场走查：分装/缺料/打印/发货。
- 客服走查：改地址/售后/退款失败/补发。

---

## 十二、上线顺序与回滚

### 12.1 顺序

1. **M1 迁移**：表/字段/索引；不跑数据回填。
2. **S1 dry-run**：`backfill-supplement-v2.ts --dry-run`；老板/开发核对报告。
3. **S2 配置 dry-run**：`configure-supplement-launch.ts --dry-run`；确认旧值。
4. **后端核心**：定价/排期/库存/快照/售后/订单中心；测试全绿。
5. **S1/S2 apply**：低峰执行；观察。
6. **后台前端**：订单中心/退款/看板/配置/原料/库存。
   - 开启库存预占前，先对“已排期、未分装、无 allocation”的订单补建占用；否则分装时没有占用可扣。
7. **小程序**：顾客/员工页面 + 40×60 标签；体验版审核。
8. **灰度**：先内部账号/员工，再小流量；观察 3 天。
9. **全量**。

### 12.2 监控

- 待排期数、排期失败数、逾期未分装、缺料订单数。
- 售后待处理、退款失败、退款处理中 >30 分钟。
- 库存负值、allocation 未释放。
- 订阅消息失败率（不影响主流程）。
- 订单中心 P95。

### 12.3 回滚

- 关特性开关，不回滚 schema。
- 售后开关关闭：新 case 保留，旧流程人工处理；不删除数据。
- 订单中心关闭：旧页面继续用。
- 标签回滚：保留 40×60 纸张，回滚排版版本。
- 配置回滚：S2 脚本备份旧值，可恢复。

---

## 十三、任务拆分（建议）

| 阶段 | 内容 | 产出 | 粗估 |
|---|---|---|---|
| P0 | 迁移、枚举、字段、DTO 骨架、特性开关 | 迁移可 dry-run；`tsc` 通过 | 2–3d |
| P1 | 定价修正、配置字段、截单/日历/排期/自动完成 | 排期单测/并发测试 | 3–4d |
| P2 | 库存 sourceType、补剂预占/移动/释放/扣减 | 库存集成测试 | 2–3d |
| P3 | 快照、DIY 冻结后新建、diySheetId 透传 | 快照测试/小程序草稿 | 2–3d |
| P4 | 售后 case、退款重构、补发、改地址、再次购买 | 售后集成测试 | 4–5d |
| P5 | 订单中心后端 + 后台页；退款/看板/配置/原料/库存 | 后台可用 | 4–5d |
| P6 | 顾客/员工小程序页面 + 40×60 标签 | 体验版可走通 | 4–6d |
| P7 | 回填 dry-run/apply、UAT、灰度、上线 | 上线报告 | 3–4d |

> 前端工作量取决于复用程度：订单中心/退款/看板/原料/库存尽量改造现有页，不新开一套。

---

## 十四、风险与待确认

### 风险

1. **退款重构**：现有退款只支持一笔/订单；改成 case 后要确保旧数据/回调/重试都不丢。先 dry-run + 集成测试。
2. **库存单位**：`quantityG/deltaG` 是命名债；实际是 `baseUnit` 数量（G/ML/PCS，平勺=PCS）。如果团队误以为是“克”，PCS/平勺补剂会算错。必须在代码注释/字典/验收里写死“base unit quantity”。
3. **快照后制作单**：`DIYSheetStorageService.create` 现在会更新已有单；不改成“冻结后新建”，旧单会被覆盖。
4. **员工权限**：类级 `StaffGuard` 会让员工调到退款/补发；必须逐方法 `AdminGuard` + 403 测试。
5. **订单中心性能**：三表合并第一版够用；数据量大再优化，不提前建表。
6. **标签实物**：40×60 排版必须打样；屏幕好看不等于纸上放得下。
7. **配置旧默认值**：不设置就是 2.0/9.9/8/空；上线脚本必须跑。

### 待确认 / 已确认口径

1. `Order.type=CUSTOM_SERVICE` 在订单中心归“鲜食”还是“定制服务”？建议归 `FOOD` 并显示子类型，避免和 `CustomRecipeOrder` 混淆。
2. **已确认**：员工不看订单金额/退款金额/管理员备注；订单中心/详情按 staff DTO 脱敏。
3. 包邮门槛按“纯商品”还是“商品+包材”？建议纯商品；包材费本轮为 0，不影响当前数字。
4. **已确认**：`平勺` 按 `PCS` 入库（1 平勺=1 PCS，2000 平勺/瓶 = 2000 PCS）；只有配方按克/半勺时用 `G` 并配置克/瓶。数据体检时检查每瓶平勺数是否已维护。
5. 鲜食/定制旧售后是否本轮迁移？建议只迁移补剂；旧数据只读，第二批再做。
6. 订单中心路由：新建 `/orders/center`，旧 `/orders`、`/custom-recipes` 保留为处理页；如果老板要求“一个菜单”，侧边栏只留新入口。
