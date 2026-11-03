# 食谱定制板块 · 技术方案（2026-10-16 · 第一版）

> **文档边界**：
> - **需求文档**（`2026-10-16-custom-recipe-module-requirements.md`）= 要什么、业务规则、什么算做完
> - **原型**（`docs/prototypes/2026-10-16-custom-recipe-prototype.html`）= 长什么样、怎么点
> - **本文（技术方案）** = 表怎么建、字段叫什么、接口怎么定、**怎么解耦**、**计算怎么搬后端**
>
> 本文写给工程。老板只需要看**第一节（技术选型总览）**与**第十五节（分批与工作量）**。

---

## 决策记录

| 日期 | 决策 | 依据 |
|---|---|---|
| 10-16 | **不引入新框架/中间件**：继续用 NestJS + Prisma + PostgreSQL 单体 | 现量级不需要微服务；引入消息队列/事件总线只会增加运维负担 |
| 10-16 | **定制单保持独立表**，不并入 `order` | 两者生命周期差异大（见需求文档第十二节第 7 条） |
| 10-16 | **主状态用 Prisma enum + 字典表补展示元数据**；业务选项用纯数据表 | 结构性状态代码依赖，不能变成纯数据；业务选项代码不做判断，应该变成数据 |
| 10-16 | **计算后端化分两批**：先搬"配置类/展示类"，最后搬"配方评估引擎" | 评估引擎要解决"边改边算"的延迟问题，风险最高，单独排期 |
| 10-16 | **评估引擎迁移前，先做记忆化性能补丁**（**本次实测 21 倍**，15 个食材 202ms → 9.6ms；见 5.2.3） | 不修就搬，等于把每次编辑 60–200ms 的 CPU 从浏览器压到服务器（见 5.2.3） |
| 10-16 | **迁移前必须先把 `dataGaps` 补到后端** | 该功能只有前端实现却被界面消费，直接切会**静默失效**（见 5.2.2） |
| 10-16 | **只读评估用 `persist=false` 显式开启，默认值保持 `true`** | 发布页依赖回写结果做门控，改默认值会直接破坏发布（见 5.2.6） |
| 10-16 | **前端渲染契约先落地**（status/actions/progress 三件套），再做页面改造 | 契约不先定，页面改造会再造一批硬编码 |
| 10-16 | 新建的枚举一律**同时登记进选项字典**（启动时自动同步） | 防止"加了枚举忘了加文案"重演 |

---

## 一、技术选型总览

### 1.1 五个核心决策

| # | 决策 | 解决什么问题 | 替代方案与为什么不选 |
|---|---|---|---|
| **1** | **分层收敛**：`CustomRecipeService`（1978 行，一个类扛 6 类职责）拆成 8 个职责单一的服务 + 1 个 Prisma 仓储实现 | 改一处要通读 2000 行；domain 层只有接口没有实现，"分层"名存实亡 | *不拆*：现有回归面太大。<br />*拆成微服务*：运维成本远超收益 |
| **2** | **四层配置化**（参数 / 选项 / 表单 / 规则） | 老板已连续改 6 批定制页，每次都要改小程序发版 | *只做参数*：挡不住"改一个选项要发版"。<br />*做通用低代码引擎*：半年工程，过度设计 |
| **3** | **渲染契约**：后端下发 `status` / `actions` / `progress`，前端遍历渲染 | 同一个枚举在三个端写了 6 份；加一个状态漏两处半 | *前端做统一工具函数*：仍然是硬编码，只是收拢了一处 |
| **4** | **计算后端化**：删掉前端重复实现，调后端接口 | 前端评估引擎是后端同源代码的**逐字拷贝**（diff 仅 95 行，90 个对比用例输出逐字节相同），双份实现必然漂移 | *保留前端副本做即时反馈*：小程序已经证明"400ms 防抖 + 竞态守卫"就够了，不需要本地算 |
| **5** | **交付物 = 版本化交付单**（含内容快照） | 现状交付只是写两个字段，改食谱会改掉顾客看到的内容，无法回溯 | *只加"交付记录表"不留快照*：交付后改食谱仍会串改历史 |

### 1.2 明确不引入的东西

| 不引入 | 原因 |
|---|---|
| 微服务 / 服务网格 | 单量级远未到；运维成本 > 收益 |
| 消息队列（Kafka/RabbitMQ） | 现有 `@Cron` 定时任务 + 同步调用足够；通知失败已有重试位 |
| 事件溯源 / CQRS 全套 | 交付快照已经解决了"要看历史"的诉求，不需要事件流 |
| GraphQL | 现有 REST + 统一响应结构已经跑通，换协议会让三个端都改 |
| 通用低代码表单引擎 | 只做定制问卷的**字段级配置**，不做拖拽建表单 |
| 前端状态管理库（Pinia 之外的新东西） | admin-web 已有 Element Plus + 简单 store，够用 |

---

## 二、分层与模块边界

### 2.1 现状问题（可核对）

| # | 问题 | 事实 |
|---|---|---|
| 1 | 一个类扛 6 类职责 | `application/custom-recipe/custom-recipe.service.ts` **1978 行**：下单、排期、支付回调、额度台账、附件、健康档案回写 |
| 2 | 分层名存实亡 | 该服务直接 `implements ICustomRecipeRepository`；`domain/custom-recipe/` **只有接口，没有实现类** |
| 3 | 控制器直接写库 | `admin-custom-recipe.controller.ts:350-401` 在 controller 里 `prisma.recipe.create` + `recipeItem.createMany` |
| 4 | 私有属性穿透 | `custom-recipe.controller.ts:378,400` 用 `customRecipeService['prisma']` 访问私有属性 |
| 5 | 事务边界不全 | 建食谱（recipe + items + order 三步）与交付（查占用 → 写）**都没有事务**；交付存在 TOCTOU |
| 6 | 状态流转被绕过 | 流转表在 `custom-recipe.service.ts:467-486`，但有 3 条路径走裸 `update` |
| 7 | 死代码 | `OrderType.CUSTOM_SERVICE` 从未使用；两个附件上传接口无调用方；`analyzeDogPreferences` 恒返回空；`bookSlot`/`releaseSlot` 无调用方 |

### 2.2 目标分层

```
interfaces/
  controllers/custom-recipe/      ← 只做参数解析、鉴权、调用应用服务、包统一响应
  dto/custom-recipe/              ← 入参 DTO + Swagger 注解
  dto/common/renderable.dto.ts    ← 【新】渲染契约三件套

application/custom-recipe/        ← 【重构】职责单一的编排层
  custom-recipe-order.service.ts       下单、查询、列表
  custom-recipe-schedule.service.ts    产能、日历、自动排单
  custom-recipe-delivery.service.ts    交付、快照、重新交付、撤回
  custom-recipe-aftersale.service.ts   售后单生命周期
  custom-recipe-credit.service.ts      抵扣额度台账
  custom-recipe-state-machine.ts       状态机（唯一流转入口）
  custom-recipe-action-resolver.ts     动作可用性计算（状态 + 角色 + 业务规则）
  custom-recipe-view.service.ts        组装顾客视图 / 后台视图 DTO
  custom-recipe-form.service.ts        【新】表单 schema 下发与校验
  custom-recipe-config.service.ts      已有，扩展参数
  custom-recipe-policy.ts              【新】可配置规则的判定（窗口、次数、交付物开关）

domain/custom-recipe/             ← 【重构】纯领域逻辑，不碰 Prisma
  custom-recipe.repository.ts          已有接口，收窄
  custom-recipe.state.ts               【新】状态枚举与合法流转（纯函数）
  custom-recipe.schedule.ts            【新】排单算法（纯函数：输入日历+产能+今天 → 输出接单日/交付日）
  custom-recipe.delivery.ts            【新】交付物清单组装规则（纯函数）
  custom-recipe.credit.ts              【新】额度计算（纯函数，分对齐）

infrastructure/repositories/
  prisma-custom-recipe.repository.ts   【新】Prisma 实现（domain 接口的唯一实现）
```

**分层的两条硬规矩**（code review 用）：

1. **`domain/` 不许 import `@prisma/client` 之外的运行时**，也不许注入 `PrismaService`；
2. **`interfaces/controllers/` 不许直接调 `prisma`** —— 一律经应用服务。

### 2.3 跨模块的公共底座（新增）

定制板块需要的东西里有三样是**通用的**，不该只给定制用：

| 公共能力 | 位置 | 谁会用 |
|---|---|---|
| **选项字典**（L2） | `application/platform-options/` + `platform_option_set` / `platform_option_item` 两张表 | 定制、成品订单、售后、体重计划、疫苗…… |
| **渲染契约 DTO** | `interfaces/dto/common/renderable.dto.ts` | 三个端 |
| **表单 schema**（L3） | 表挂在定制板块下，但**结构设计成通用的**（`form_schema` / `form_field`） | 先用定制验证，将来别的板块可复用 |

> **克制原则**：表单 schema 本次**只为定制板块服务**，但表名与结构不带 `custom_recipe` 前缀的限制，
> 留出复用余地。**不做**通用的"任意表单渲染引擎"。

---

## 三、数据模型

> 命名严格遵循 `docs/DATABASE_NAMING_CONVENTIONS.md`：Prisma 用 camelCase，库内存 snake_case。

### 3.1 新增表（4 张业务 + 2 张底座）

#### ① `custom_recipe_delivery` — 交付单

```prisma
/// 一次交付 = 一条记录。同一张订单可以有多条（重新交付、售后修改后再交付）。
model CustomRecipeDelivery {
  id              String    @id @default(uuid())
  orderId         String    @map("order_id")
  /// 第几次交付，从 1 开始；同一订单内唯一
  version         Int
  /// 交付出去的那道私密食谱（recipe.id）
  recipeId        String    @map("recipe_id")
  /// 交付时食谱的版本号（recipe.version 的快照）
  recipeVersion   Int?      @map("recipe_version")

  /// 【核心】交付时刻冻结的内容快照。
  /// 之后营养师改设计器，这一版顾客看到的仍是快照里的内容。
  contentSnapshot Json      @map("content_snapshot")

  /// 这一版包含哪些交付物（后端按配置组装）
  items           Json      @default("[]")
  /// 营养师给定的喂食参数（几餐/每餐多少/做几天），决定采购量与制作量
  feedingParams   Json?     @map("feeding_params")

  deliveredBy     String    @map("delivered_by")
  deliveredAt     DateTime  @default(now()) @map("delivered_at")

  notifyStatus    String?   @map("notify_status") @db.VarChar(20)
  notifiedAt      DateTime? @map("notified_at")
  viewedAt        DateTime? @map("viewed_at")
  confirmedAt     DateTime? @map("confirmed_at")
  /// CUSTOMER / AUTO（超期自动完成）
  confirmChannel  String?   @map("confirm_channel") @db.VarChar(20)

  /// 被哪一版替换（重新交付时指向新的那条）；null = 当前有效版本
  replacedByDeliveryId String? @map("replaced_by_delivery_id")
  revokedAt       DateTime? @map("revoked_at")
  revokeReason    String?   @map("revoke_reason") @db.VarChar(200)

  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  order           CustomRecipeOrder @relation(fields: [orderId], references: [id], onDelete: Cascade)
  recipe          Recipe            @relation(fields: [recipeId], references: [id])
  aftersales      CustomRecipeAftersale[]

  @@unique([orderId, version])
  @@index([orderId])
  @@index([recipeId])
  @@index([deliveredAt])
  @@map("custom_recipe_delivery")
}
```

**为什么必须存 `contentSnapshot`**：现状交付是"就地覆盖同一行 Recipe，版本号恒为 1"，
营养师交付后再改，顾客打开看到的内容会变。快照是唯一能回溯的手段。

#### ② `custom_recipe_aftersale` — 售后单

```prisma
model CustomRecipeAftersale {
  id            String   @id @default(uuid())
  orderId       String   @map("order_id")
  /// 针对哪一版交付提出的（可空：交付前就提也行）
  deliveryId    String?  @map("delivery_id")
  /// 类型：答疑 / 调整食谱 / 其他意见 —— 取值来自选项字典
  type          String   @map("type") @db.VarChar(32)
  status        CustomRecipeAftersaleStatus @default(PENDING)
  description   String   @db.VarChar(1000)
  photos        String[] @default([])

  handlerId     String?  @map("handler_id")
  handleNote    String?  @map("handle_note") @db.VarChar(1000)
  acceptedAt    DateTime? @map("accepted_at")
  resolvedAt    DateTime? @map("resolved_at")
  /// 处理结果是"调整食谱"时，指向重新交付的那一版
  linkedDeliveryId String? @map("linked_delivery_id")
  rejectReason  String?  @map("reject_reason") @db.VarChar(200)

  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  order         CustomRecipeOrder    @relation(fields: [orderId], references: [id], onDelete: Cascade)
  delivery      CustomRecipeDelivery? @relation(fields: [deliveryId], references: [id])

  @@index([orderId])
  @@index([status])
  @@index([handlerId])
  @@map("custom_recipe_aftersale")
}

enum CustomRecipeAftersaleStatus {
  PENDING      // 待受理
  ACCEPTED     // 已受理
  PROCESSING   // 处理中
  RESOLVED     // 已解决
  REJECTED     // 已拒绝
}
```

#### ③ `custom_recipe_weekday_rule` — 按星期的接单规则

```prisma
/// 按星期几的默认规则。日历上具体某一天的设置（custom_recipe_schedule）优先级更高。
model CustomRecipeWeekdayRule {
  /// 0 = 周日 … 6 = 周六（与 JS getDay() 一致，避免转换出错）
  weekday          Int     @id
  isOpen           Boolean @default(true) @map("is_open")
  /// 留空表示用配置里的全局值
  capacity         Int?
  deliveryCapacity Int?    @map("delivery_capacity")
  note             String? @db.VarChar(100)
  updatedAt        DateTime @updatedAt @map("updated_at")

  @@map("custom_recipe_weekday_rule")
}
```

#### ④ `custom_recipe_form_field` — 定制问卷字段（L3）

```prisma
model CustomRecipeFormField {
  id            String   @id @default(uuid())
  /// 分组码：BASIC / GOAL / ALLERGY / PREFERENCE / NOTE / ATTACHMENT
  sectionCode   String   @map("section_code") @db.VarChar(32)
  /// 字段码，稳定标识；核心字段必须与 CORE_FIELD_BINDINGS 对齐
  key           String   @unique @db.VarChar(48)
  label         String   @db.VarChar(64)
  /// 受控类型白名单，见 L3
  type          String   @db.VarChar(24)
  required      Boolean  @default(false)
  enabled       Boolean  @default(true)
  sortOrder     Int      @default(0) @map("sort_order")
  helpText      String?  @map("help_text") @db.VarChar(200)
  placeholder   String?  @db.VarChar(100)
  /// 选项来源：指向 platform_option_set.code；type 为选择类时必填
  optionSetCode String?  @map("option_set_code") @db.VarChar(48)
  /// 条件显示规则，如 {"field":"hasFoodAllergy","equals":true}
  visibleWhen   Json?    @map("visible_when")
  /// 校验规则，如 {"maxLength":500,"maxCount":9}
  validation    Json?    @map("validation")
  /// 【关键】落到订单的哪个位置：CORE:targetGoal = 写核心列；EXTRA = 写 answers JSON
  binding       String   @default("EXTRA") @db.VarChar(48)
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  @@index([sectionCode, sortOrder])
  @@map("custom_recipe_form_field")
}
```

#### ⑤⑥ `platform_option_set` / `platform_option_item` — 选项字典（L2）

```prisma
/// 选项集：一组可选项的容器（订单状态 / 定制目标 / 活动量 / 售后类型 / 交付物类型…）
model PlatformOptionSet {
  code        String   @id @db.VarChar(48)
  name        String   @db.VarChar(64)
  description String?  @db.VarChar(200)
  /// ENUM = 选项由代码枚举定义（后台只能改展示，不能增删）
  /// DATA = 选项纯粹是数据（后台可以自由增删改）
  sourceType  String   @default("DATA") @map("source_type") @db.VarChar(8)
  /// sourceType=ENUM 时，代码里登记的枚举名（用于启动同步与告警）
  enumName    String?  @map("enum_name") @db.VarChar(48)
  enabled     Boolean  @default(true)
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  items       PlatformOptionItem[]

  @@map("platform_option_set")
}

model PlatformOptionItem {
  id          String   @id @default(uuid())
  setId       String   @map("set_id")
  code        String   @db.VarChar(48)
  label       String   @db.VarChar(64)
  description String?  @db.VarChar(200)
  /// 色彩档位（前端据此选样式，不写死颜色值）
  tone        String?  @db.VarChar(16)
  icon        String?  @db.VarChar(32)
  sortOrder   Int      @default(0) @map("sort_order")
  enabled     Boolean  @default(true)
  isDefault   Boolean  @default(false) @map("is_default")
  /// 业务附加参数（例如活动量的系数），前端不解释，只透传给后端
  extra       Json?
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  set         PlatformOptionSet @relation(fields: [setId], references: [code], onDelete: Cascade)

  @@unique([setId, code])
  @@index([setId, enabled, sortOrder])
  @@map("platform_option_item")
}
```

### 3.2 改造表

#### `custom_recipe_order`（加列）

| 列 | 类型 | 说明 |
|---|---|---|
| `subStage` | `CustomRecipeSubStage?` | 内部子阶段（顾客只看主状态） |
| `answers` | `Json?` | 配置化问卷里 `binding=EXTRA` 字段的回答 |
| `formSchemaVersion` | `Int?` | 下单时用的表单版本（便于回溯"当时问的是什么"） |
| `handledBy` | `String?` | 处理人（现在只有老板一人，留痕用） |
| `completedAt` | `DateTime?` | 完成时间（新增 COMPLETED 状态） |
| `autoCompleteAt` | `DateTime?` | 预计自动完成时间（交付后 + 配置天数） |
| `acceptedAt` | `DateTime?` | 接单时间 |

> `recipeId` 保留（向后兼容，指向**当前有效版本**的食谱）；
> 交付版本历史一律查 `custom_recipe_delivery`。

#### `custom_recipe_schedule`（加列）

| 列 | 类型 | 说明 |
|---|---|---|
| `deliveryCapacity` | `Int @default(4)` | 当天最多交付几份 |
| `deliveryCount` | `Int @default(0)` | 已占用的交付位 |

> 现有 `capacity` / `bookedCount` 语义不变（= 接单容量）。
> **注意**：`capacity` 默认值 4 与配置里的 `dailyCapacity` 是两处，本次统一为"建行时从配置取值"。

#### `custom_recipe_config`（加列）

| 分组 | 列 | 默认 | 说明 |
|---|---|---|---|
| 产能 | `dailyDeliveryCapacity` | 4 | 每日交付上限 |
| 售后 | `aftersaleWindowDays` | 30 | 售后受理窗口 |
| 售后 | `freeRevisionCount` | 1 | 免费调整次数 |
| 售后 | `freeRevisionWindowDays` | 7 | 免费调整的时间窗 |
| 交付 | `autoCompleteDays` | **3** | 交付后几天自动完成（老板定的） |
| 交付 | `requireCustomerConfirm` | true | 是否要求顾客确认 |
| 交付 | `deliveryItems` | `["RECIPE","SHOPPING_SOP","NUTRITION_REPORT"]` | 交付物开关 |
| 附件 | `attachmentMaxCount` | 9 | 附件张数上限 |
| 附件 | `attachmentMaxSizeMb` | 10 | 单文件大小 |
| 设计默认 | `defaultNutritionStandard` | `FEDIAF_2025` | 原写死在控制器 |
| 设计默认 | `defaultEnergyDensityKcalPerKg` | 3200 | 同上 |
| 设计默认 | `productionLossRate` | **1.07** | **统一两个值**（现在 1.07 / 1.05 并存） |
| 设计默认 | `defaultLaborHours` | 2 | 原写死 |
| 排期 | `scheduleLookaheadDays` | 45 | 原写死 |
| 排期 | `slotRetryTimes` | 5 | 原写死 |
| 排期 | `orderNoPrefix` | `CR` | 原写死 |
| 订正 | `__fix_default_amount` | — | 见 3.3 第 4 条 |

### 3.3 迁移策略与老数据

> 遵循 `prisma/migrations/YYYYMMDDHHMMSS_描述/migration.sql` 约定，SQL 内写中文注释说明**为什么**。

| # | 事项 | 做法 |
|---|---|---|
| 1 | 现有 `DELIVERED` 订单 | 为每张补一条 `custom_recipe_delivery`（version=1），`contentSnapshot` 从当前挂接的 Recipe 现场生成；`deliveredAt` 沿用订单上的值 |
| 2 | 现有 `DELIVERED` 订单的新状态 | **保持 `DELIVERED` 不动**，并设 `autoCompleteAt = deliveredAt + 3 天`；已经超过 3 天的，由定时任务在下一个周期转 `COMPLETED`（避免上线瞬间产生大量变更通知） |
| 3 | 选项字典初始化 | 用 seed 脚本把 6 个选项集（订单状态 / 定制目标 / 活动量 / 餐数 / 售后类型 / 交付物类型）灌进去；`sourceType=ENUM` 的由**启动时自动同步** |
| 4 | **`CustomRecipeOrder.amount` 默认 299 与配置 300 不一致** | 删掉列默认值（改为无默认，必填由服务写入）。历史数据不动 —— 老单已按快照执行 |
| 5 | 默认值三处重复 | 迁移后**只保留配置表**为唯一真源；代码里的 `DEFAULT_*` 常量降级为"建单例时的初值" |
| 6 | 表单字段初始化 | seed 出当前页面上的 12 个字段（dogId / weightGoalChoice / targetGoal / hasFoodAllergy / allergies / preferredIngredients / dislikedIngredients / additionalNotes / attachments + 三个门槛补确认项） |
| 7 | 双轨挂接（`Recipe.customOrderId` vs `custom_recipe_order.recipe_id`） | 本次**不删**，但新增的交付一律只写 `custom_recipe_delivery`；`Recipe.customOrderId` 标记为 deprecated，加注释 |

**回滚预案**：本次改动是"加表加列"，不改既有列语义。
回滚只需停用新代码路径，数据不影响老逻辑（老列表读 `custom_recipe_order` 仍然可用）。

---

## 四、四层配置化（"字段解耦"的落地）

### L1 · 参数字典化

**载体**：`custom_recipe_config` 单例表 + `CustomRecipeConfigService`（已有，扩展）
**下发**：
- 后台：`GET/PUT /admin/custom-recipe/config`（已有，扩展字段）
- 小程序：`GET /api/v1/custom-recipe-config`（已有，扩展**公开子集**）

**公开子集原则**：只暴露顾客需要看到/需要知道的。
`dailyDeliveryCapacity`、`productionLossRate`、`slotRetryTimes` 这类**不进公开配置**。

### L2 · 选项字典化

**载体**：`platform_option_set` / `platform_option_item`
**两个来源**：

| `sourceType` | 用在哪 | 后台能做什么 | 例子 |
|---|---|---|---|
| `ENUM` | 代码里有 if-else 的结构性取值 | 只能改标签/色调/排序/启用，**不能增删** | 订单状态、子阶段、售后状态 |
| `DATA` | 代码只做存储与展示 | 可自由增删改 | 定制目标、活动量、餐数、售后类型、交付物类型 |

**启动同步**（解决"加了枚举忘了加字典"）：
在 `PlatformOptionsService.onModuleInit()` 里，把代码中登记的枚举清单 upsert 进字典。
新增枚举值时会自动补一行（默认标签 = 枚举名，并在启动日志里 **warn** 提醒"这条还没配中文"）。

**下发接口**：
```
GET /api/v1/options?sets=order_status,goal,activity_level,meal_count,aftersale_type,delivery_item
→ { sets: { order_status: [{code,label,description,tone,icon,sortOrder,extra}], ... } }
```
小程序与后台各自缓存（按 `updatedAt` 做 ETag 或版本号）。

**这条直接消灭的重复**：现状状态文案在小程序 6 处、后台 1 处各写一遍；
售后类型、活动量档位、餐数、目标文案也都是硬编码。全部改为读字典。

### L3 · 表单元数据化

**载体**：`custom_recipe_form_field`
**下发**：`GET /api/v1/custom-recipe/form-schema`
```json
{
  "version": 3,
  "sections": [
    { "code": "GOAL", "title": "定制目标", "fields": [
      { "key": "weightGoalChoice", "label": "想帮它…", "type": "SINGLE_CHOICE",
        "required": true, "optionSetCode": "weight_goal_direction",
        "binding": "CORE:weightGoalChoice",
        "visibleWhen": null, "validation": null, "helpText": null }
    ]}
  ]
}
```

**受控类型白名单**（不允许自定义控件）：

| type | 说明 | 提交形态 |
|---|---|---|
| `SINGLE_CHOICE` | 单选，选项来自 `optionSetCode` | `string`（code） |
| `MULTI_CHOICE` | 多选，选项来自 `optionSetCode` | `string[]`（codes） |
| `BOOLEAN` | 是 / 否 | `boolean` |
| `TEXT` | 单行文本 | `string` |
| `TEXTAREA` | 多行文本 | `string` |
| `DATE` | 日期 | `string`（YYYY-MM-DD） |
| `ATTACHMENT` | 图片 | `string[]`（urls） |
| `DERIVED_READONLY` | 只读推导值（后端算，前端只显示） | 不提交 |

**双轨绑定（关键设计）**：

```
binding = "CORE:targetGoal"   → 写入订单的核心列（算法要用）
binding = "EXTRA"             → 写入 order.answers JSON
```

**为什么必须双轨**：算法（过敏拦截、能量计算、推荐过滤）依赖核心列是**强类型**的。
如果全塞进 JSON，`WHERE allergies && ARRAY['chicken']` 这类查询就废了。
所以：**核心字段永远有列；新加的问答进 JSON**。

**提交校验**：后端按 schema 逐字段校验（必填、长度、张数、选项合法性），
**不信任前端**。前端校验只是为了即时反馈。

**边界（写进文档，防止被滥用）**：
- 只做字段级配置，不做拖拽建表单；
- 类型白名单，不能新增控件；
- 结构化字段（如过敏原）**必须绑词表**，不允许退化成自由文本 ——
  否则营养师侧的"配方命中确诊过敏原"报警会失效；
- 字段 `key` 一旦有历史数据，**不允许改**，只能停用（`enabled=false`）。

### L4 · 规则集中化

**载体**：代码（不是表）—— 因为规则要执行代码，纯数据表达不了。

| 规则 | 落点 | 现状 |
|---|---|---|
| 状态合法流转 | `domain/custom-recipe/custom-recipe.state.ts`（纯函数表） | 硬编码在 service，且有 3 条路径绕过 |
| 动作可用性 | `application/custom-recipe/custom-recipe-action-resolver.ts` | 前端 + 后端各判断一次 |
| 可配置策略（窗口、次数、开关） | `application/custom-recipe/custom-recipe-policy.ts` 读 L1 | 无 |
| 自动流转（超时关单、自动完成） | `application/scheduler/custom-recipe-scheduler.service.ts` | 分散在 `order-scheduler.service.ts` |

**状态机收敛**：所有状态变更（含交付、确认付款、取消）**必须**经过
`CustomRecipeStateMachine.transition(order, to, ctx)`，由它校验合法性并写时间戳。
**加一条守卫测试**：源码扫描，确保没有别处直接 `prisma.customRecipeOrder.update({ data: { status` 的写法。

---

## 五、计算后端化

### 5.1 盘点（10 处，按搬迁难度排序）

| # | 位置 | 现在在前端算什么 | 搬迁难度 | 批次 |
|---|---|---|---|---|
| 1 | 小程序 `utils/custom-recipe-order.ts` | 支付截止时间推算、剩余分钟、工作日推算（后者是死代码） | 低 | 2 |
| 2 | 小程序 `custom-recipe/order-detail.vue` + `orders.vue` | 抵扣剩余额度（**各算一遍**） | 低 | 2 |
| 3 | 小程序 `custom-recipe/index.vue` | 体况阈值判方向、把计划编译成目标、体况分算术 | 低 | 2 |
| 4 | 小程序 `utils/order-aftersale.ts` | 7 天售后窗口、能不能申请售后 | 低 | 3 |
| 5 | 后台 `utils/customRecipe.ts` | 交付倒计时、超期天数 | 低 | 3 |
| 6 | 后台 `publishReport.ts` | 占热量比、重量占比、能量密度 | 中 | 3 |
| 7 | 后台 `RecipeForm.vue` | 食材占比、单位换算、硬编码单位映射 | 中 | 3 |
| 8 | 小程序 `utils/order-package-plan.ts` | 每袋克重、起订量、可吃天数 | 中 | 4 |
| 9 | 小程序 `recipe-order/index.vue` | 总克数、总袋数、每餐克数、均价 | 中 | 4 |
| 10 | 后台配方编辑器 `assessment.ts` 等 **3727 行** | 整套 FEDIAF 营养合规引擎 | **中**（原估"高"，经实测下调，见 5.2） | 5 |

### 5.2 配方编辑器评估引擎（第 10 项，单独展开）

> **本节已做过专项实测分析**（含前后端等价性对比、性能 profile、接口行为核对），
> 结论推翻了两个初始假设。下面每条都标了证据。

#### 5.2.1 关键事实（实测）

| # | 事实 | 证据 |
|---|---|---|
| 1 | 前端那份**是后端的逐字拷贝** | `recipe-assessment.ts` 1738 行 ↔ `assessment.ts` 1779 行，**diff 仅 95 行 / 5 个 hunk**，实质差异只有 3 处：import 路径改写、**前端独有 `dataGaps`**、一处非空断言 |
| 2 | 两边**输出逐字节相同** | 用真实 137 条 FEDIAF 目标跑双实现对比：**90 个用例（5 情景 × 6 配方形态 × 3 数据完整度）JSON 完全一致**，唯一差异是前端独有的 `dataGaps` |
| 3 | 导出符号逐一对齐（我方复核） | `recipe-assessment` ↔ `assessment`：**9 个导出零差异**；`nutrition-profile-reader` ↔ `nutritionProfileReader`：**5 个导出零差异**；`dog-atwater-energy` ↔ `dogAtwaterEnergy`：前端**只多 2 个展示常量**（字段中文名与 JSON 路径） |
| 4 | **后端是权威** | 只有后端持久化结果；它是发布闸门；**只有后端有真数据测试**（`tests/domain/recipe-designer/recipe-assessment.spec.ts` 带 FEDIAF 夹具，前端 spec 把这整块删了） |
| 5 | 编辑器**没有节流**，每敲一个字符同步阻塞主线程 | `Editor.vue:317-322` 的 `assessment` 是**同步 Vue computed**；重量框 `@update:model-value`(`:129`) → `onWeightChange`(`:867-885`) → 立刻全量重算。保存另有 500ms 防抖（`useDesignerSaveQueue.ts:20`） |
| 6 | **性能是个约 20 倍的意外回归**（**本次亲自实测**） | 同一台机器、同样 60 轮平均：**3 食材 ~37ms / 8 食材 ~104ms / 15 食材 ~202ms**。根因是 `normalizeNutritionProfile` **反复重建整份空档案**：读取模块的三个读函数各归一化一次，`nutrition-field-catalog.getNutritionProfileFieldValue` 里**还再归一化一次**；叠加 `findNutritionField` 每次线性查找 + 克隆 |
| 7 | 该回归**在后端同样存在** | 同一份代码。且 `recipe-designer.service.ts:6044-6048` 对**每个带目标值的补剂再跑一遍完整评估** |
| 8 | 有个**已过期的设计理由** | `useRecipeDesignerAssessment.ts:1-5` 写"避免每次编辑都请求服务器评估（小程序端卡顿根因）"。**但小程序是用 400ms 防抖 + 竞态守卫解决的**（`miniapp/src/pages/recipe-designer/editor.vue:984-991`），不是靠本地算 |
| 9 | **小程序已基本合规，是现成范本** | 小程序 `assessment.ts` 只有 **797 行**（admin-web 是 1779 行），内容是**纯展示映射 + 格式化**。全文件只有一处真实换算 —— `readMoisturePercent`(`:638-655`) 在**服务端没给百分比时**用 `水分总量 / 总重 × 100` 兜底；主路径直接读后端返回值（`:642-643`）。其余 5 处是 `Math.round/min/max` 的展示取整 |
| 10 | `assess` **只读数据库**、且**会回写草稿状态** | `POST drafts/:id/assess` 只接路径参数；`assessDraft`(`service:4826-4860`) 对**非发布态草稿**执行 `designRecipe.updateMany` 回写 `assessmentSummary`/`status`（`:4850-4855`） |

> **第 1、2、3 行合起来说明**：这不是"两套实现需要对齐"，而是**同一份代码存了两份**。
> 所以搬运**没有算法风险** —— 真正的风险是**功能不等**（下面 5.2.2）与**性能**（5.2.3）。

#### 5.2.2 一个会静默坏掉的功能：`dataGaps`

| 项 | 情况 |
|---|---|
| 是什么 | "哪个原料缺哪个字段"的提示。实测现在正常工作（如"油麦菜 缺 膳食纤维"） |
| 谁在用 | `AssessmentPanel.vue:333` 读 `props.assessment?.dataGaps` |
| 在哪实现 | **只有前端**：`assessment.ts:80`（类型）、`:241`（`collectAssessmentDataGaps(input.items)`） |
| 后端有没有 | **零实现**（全仓 grep `dataGaps` 在 `backend/src/` 无命中）。后端另有个粗粒度的 `missingDataReport`，**只写库、不在 assess 响应里** |

> ⚠️ **这是本次最高危的坑**：如果直接把前端切到后端接口，这个功能会**静默失效** ——
> 不报错、不崩溃，只是提示没了，没人会发现。
> **必须先把 `dataGaps` 移植到后端，再切前端。**

#### 5.2.3 必须先做的一步：性能记忆化（**实测约 21 倍**）

**为什么必须先做**：不修就直接搬，等于把**每次编辑 60–200ms 的 CPU** 从浏览器搬到服务器；
而服务器还要对每个补剂再跑一遍（事实 7）。当前端只有一个用户时无所谓，
一旦多人同时编辑，或补剂种类多，就会变成接口超时。

**修法**（已验证）：给 `normalizeNutritionProfile` 加 **WeakMap 记忆化**（按入参对象身份缓存）。
`nutrition-profile-reader.ts` 里三个读函数（`getProfileEffectiveWeightG:38`、`readProfileFieldAmount:125`、
`readProfileValuePer100g:163`）**各自独立地**对同一个 profile 归一化一次 —— 这就是单次字段读取
normalize 3–4 遍的来源，属于纯重复劳动。

| 指标 | 修前 | 修后 |
|---|---|---|
| 3 食材 | ~37 ms | **~2.7 ms** | **~14×** |
| 8 食材 | ~104 ms | **~5.3 ms** | **~20×** |
| 15 食材 | ~202 ms | **~9.6 ms** | **~21×** |
| 正确性 | — | 缓存版与原始版**输出逐字段一致**（守卫测试 ③） |

#### 5.2.3.1 记忆化的安全性（已核实，原标注的顾虑不成立）

> 初步分析时标注过一个风险："`normalizeNutritionProfile` 每次返回**全新对象**，
> 记忆化后多个调用方会**共享同一个对象**，一旦有人改写就会互相污染"。
> 这条顾虑**已查清，不成立**，证据如下：

| # | 核查项 | 结果 |
|---|---|---|
| 1 | `normalizeNutritionProfile` 是否返回新对象 | 是。`nutrition-profile.utils.ts:175-189`：legacy 路径 `createEmptyNutritionProfile()` 新建；v2 路径 `ensureProfileDefaults(input)`(`:134-…`) 全程用展开构造新对象，**不改入参** |
| 2 | 读路径上一共有几个调用点 | **只有 3 个**，全在 `domain/recipe-designer/nutrition-profile-reader.ts`（`:38` / `:125` / `:163`），都在 `recipe-assessment` 的只读计算链上 |
| 3 | 有没有调用方改写返回的对象 | **没有**。全量搜索 `normalized.x =` / `profile.macros.x =` / `Object.assign` / `delete` / `customItems.push`，唯一命中是 `nutrition-profile.utils.ts:119` 的 `profile.customItems.push(...)` —— 那是 `assignLegacyItem` 在**自己刚 new 出来的那个对象**上写，不是调用方拿到的返回值 |

**结论**：归一化结果在评估路径上是**只读**的，共享不会产生副作用，记忆化安全。
**落地时的两条附加拿法**（把安全性变成"结构性保证"，不依赖"现在没人改"）：
1. 缓存**只用于读路径**（`nutrition-profile-reader.ts`），不污染写路径；
2. 缓存返回的对象**可选择性冻结**（`Object.freeze` 浅冻结 5 个 tab），
   将来若有人不小心写入，会**立刻报错**而不是静默串数据。

> 这一条**独立于本次重构也有价值**：它同时让编辑器和发布页都快约 20 倍。
> **建议单独作为一个"随手修"提交先上**（见批次 0）。

#### 5.2.4 推荐方案

| 方案 | 做法 | 工作量 | 评价 |
|---|---|---|---|
| A | 每次改动节流调后端，返回完整评估 | 5–8 人日 | 机制采用，但要补两个洞（见下） |
| B | 后端增量评估 + 结果缓存 | 8–12 人日 | **不划算**：记忆化之后全量只要 0.3–0.9ms，做增量纯属过度设计 |
| **C** | **本地只保留"纯输入态"反馈，派生值全部用后端返回值；用 A 的机制落地** | **3–5 人日** | ✅ **采用** |

**方案 A 的两个洞，方案 C 一并补上**：

| 洞 | 说明 | 补法 |
|---|---|---|
| 评估到旧状态 | `assess` 只读库，而保存有 500ms 防抖 → 评估的可能是上一次的重量 | 新接口**接受未保存的明细**（`items` 随请求带上），不依赖库里的行 |
| 高频调用改写草稿状态 | 每次评估都会 `updateMany` 回写 `status`/`reviewStatus`，可能干扰发布页判断（`Publish.vue:310,339-341`） | 加 **`persist=false` 只读模式**；**`persist` 默认保持 `true`**，只读由编辑器显式开启 |

#### 5.2.5 落地步骤（顺序不可换）

| 步 | 做什么 | 为什么这个顺序 |
|---|---|---|
| **0** | **记忆化补丁**（后端 + 前端各一份，或先做后端） | 不做这步，后面每一步都在放大一个约 20 倍的成本 |
| **1** | **后端补 `dataGaps`**（移植 `assessment.ts:257-277`），并把前端那 2 个后端没有的测试用例补进后端 spec | 不先补，切过去就静默失效 |
| **2** | 后端加**只读评估**（`persist=false`）+ 给 `getTargets` 加缓存（现在每次重查 137 行、约 25KB JSON） | 让高频调用安全且便宜 |
| **3** | 前端改**异步 + 400ms latest-wins + 竞态守卫**（照抄小程序 `editor.vue:984-991` 与 `editor-performance.ts:173,207` 的做法，在 admin-web 内自建一份） | 先让"调后端"这件事在体验上成立 |
| **4** | **删引擎**：删掉 `assessment.ts`、`dogAtwaterEnergy.ts`、`assessmentBar.ts`、`nutritionProfileUtils.ts` 等计算副本；测试移交后端 | 最后一步才删，前面每一步都可回退 |

#### 5.2.6 发布流程零回归的做法

`Publish.vue:431-436` 已在调 `assessDraft`，消费 `overallStatus`(`:307-313`)、`summary`(`:48-57`)、
`groupedEntries`(`:344-347`)。因此：

1. **只增字段、不改现有出参形状**；
2. **`persist` 默认保持 `true`** —— 发布页依赖草稿行里的 `assessmentSummary` / `status`
   来驱动 `publishRequiresReview`(`Publish.vue:339-341`) 与发布门控(`:450`)，改默认值会直接破坏发布；
3. 只读模式**只由编辑器显式开启** → 发布路径字节不变；
4. 回归以 `recipe-designer.service.spec.ts` 里约 11 处 `assessDraft` 断言为准。

#### 5.2.7 风险清单

| # | 风险 | 严重度 | 缓解 |
|---|---|---|---|
| 1 | `dataGaps` 静默失效 | **高** | 步骤 1 先补后端（5.2.2） |
| 2 | 评估回写干扰发布页判断 | **高** | `persist=false` 只读模式；默认值不动（5.2.4） |
| 3 | 未保存配方无法评估 | 中 | 新接口接受 `items`（5.2.4） |
| 4 | 性能回归 | 中 | 步骤 0 记忆化（5.2.3） |
| 5 | **类型说谎** | 中 | 前端 `api/recipeDesigner.ts:139` 返回 `Promise<unknown>`；前端类型含 `entries` 而后端会删掉它 → 迁移时一并修正类型 |
| 6 | 后端独有的 `removableSupplementWarnings` / `allergenWarnings` 目前**只有小程序在用**（`miniapp/.../editor.vue:1117`） | 中 | 迁到 admin-web 会**新增界面内容** —— **需老板确认要不要显示**（不显示就丢弃，别默认渲染） |
| 7 | **副本漂移地雷**：前端 `nutritionFieldCatalog.ts` 缺派生字段支持（后端 `nutrition-field-catalog.ts:554-567`） | 中 | 今日无害（没有评估目标用 `derived.*`），但一旦启用 `derived.caP` 前端会静默报"缺数据" → 删副本即消除 |
| 8 | 前端评估缓存按**原料 id 集合**校验（`useRecipeDesignerAssessment.ts:43-59`） | 低 | 复制某个生命阶段会换 id；新的异步层若只按 `draftId` 缓存，切换阶段后会显示旧评估 → 缓存键要带 id 集合 |
| 9 | 现有测试**抓不住性能回归** | 中 | 前端 spec 是 `@ts-nocheck` 且夹具只有 1 条手写目标 → 迁移时**必须新增真实 137 目标的契约/性能守卫** |

**本节未验证的部分（如实标注）**：未跑后端 jest 全量；那 2 个前端独有用例未经后端实跑；
未测真实网络 RTT。
（记忆化补丁的**别名安全顾虑已核实排除**，见 5.2.3.1；但补丁本身仍只在临时副本验证过，
落地时按 5.2.3.1 的两条附加拿法做。）

### 5.3 其它 9 处的通用做法

**统一原则：后端在**已有**的接口里多返回几个字段，而不是新增一堆"计算接口"。**

| 场景 | 做法 |
|---|---|
| 抵扣剩余 | 订单详情/列表 DTO 直接返回 `creditRemaining`（**两个接口都已返回**——⚠️ 2026-10-16 实测更正：此前"列表没有"的说法是错的，见 `custom-recipe.controller.ts` 的 `my-orders`(:123) 与 `orders/:orderId`(:245)）；待清理的是**前端那三处兜底相减** |
| 支付时限 | 已返回 `paymentDeadlineAt`；列表同样补上 |
| 体况判方向 | `GET /dogs/:id` 或定制入口接口返回 `weightGoalAdvice { direction, blocked[], reason }` |
| 售后窗口 | 订单 DTO 返回 `aftersaleWindow { open, closeAt, remainingFreeRevisions }` |
| 交付倒计时 | 订单 DTO 返回 `deliveryDueAt` + `overdueDays`（后端算，前端不算日期差） |
| 份量/包装 | 照搬补剂线范式（`portionOptions`）：后端返回 `packagePlan { perMealG, dailyIntakeG, bagSpecs[], minOrderMet }` |
| 占比/单位换算 | 后端返回 `ratioPercent` 与已换算好的展示值 |

**一条硬规矩**：前端**不许**出现 `Math.round(金额)`、`new Date(某字段) - new Date()`、
`a / b` 这类业务算术；出现即视为缺陷（可加 lint 规则或源码扫描测试）。

---

## 六、渲染契约（"前端只渲染"的协议）

### 6.1 三个基础 DTO

放在 `interfaces/dto/common/renderable.dto.ts`，三个端共用同一份字段名。

```ts
/** 状态：不是给人看的字符串，而是可直接渲染的三件套 */
export interface RenderableStatus {
  code: string;              // PENDING_PAYMENT
  label: string;             // 待付款
  tone: string;              // neutral | info | progress | success | warning | danger
  customerHint?: string;     // 一句给顾客的说明
}

/** 动作：前端遍历渲染按钮，不做任何判断 */
export interface RenderableAction {
  code: string;              // CONFIRM_RECEIPT / APPLY_AFTERSALE / …
  label: string;             // 确认收到
  enabled: boolean;          // 后端已算好（含权限、状态、窗口）
  disabledReason?: string;   // 禁用时给顾客看的原因
  confirmText?: string;      // 二次确认文案
  danger?: boolean;          // 是否危险操作（前端用红色）
  style?: 'primary' | 'ghost' | 'line';
}

/** 进度：时间轴的每个节点都由后端给 */
export interface RenderableProgress {
  current: string;           // 当前节点 code
  timeline: Array<{
    code: string;
    label: string;           // 已付款 · ¥300
    done: boolean;
    active?: boolean;
    at?: string | null;      // ISO 时间
    note?: string | null;    // 营养师正在设计，预计 10 月 20 日前完成
  }>;
}

/** 选项：所有下拉/标签/单选的统一形态 */
export interface RenderableOption {
  code: string;
  label: string;
  description?: string | null;
  tone?: string | null;
  icon?: string | null;
  extra?: Record<string, unknown> | null;
}
```

`tone` 是**语义档位**而不是颜色值 —— 前端把 `tone` 映射到自己的样式类。
这样以后换配色不用改后端。

### 6.2 接口约定

**每一个"给前端看的订单对象"都必须带这三件套**：

```
GET /custom-recipe/orders/:id
{
  order: { ...业务字段 },
  status:  { code, label, tone, customerHint },
  progress:{ current, timeline: [...] },
  actions: [ { code, label, enabled, disabledReason, confirmText, danger } ],
  sections:{ ...按后端定义的顺序渲染的分区 }
}
```

**后台同理**，但 `actions` 里额外按角色算好 `enabled`（前端不判断 `role === 'ADMIN'`）。

### 6.3 前端渲染器

| 端 | 新增 | 作用 |
|---|---|---|
| 小程序 | `utils/renderable.ts` | `toneToClass(tone)`、`renderActions(actions, handler)`、`formatOption(opt)` |
| 小程序 | `api/custom-recipe.ts`（**新增，现在没有**） | 定制相关接口统一封装 |
| 后台 | `components/common/StatusTag.vue` | 吃 `RenderableStatus`，不再各页写 `el-tag` 判断 |
| 后台 | `components/common/ActionBar.vue` | 吃 `RenderableAction[]`，遍历渲染 |
| 后台 | `composables/useOptions.ts` | 按需拉选项字典并缓存 |

### 6.4 边界（写进 code review 清单）

**必须后端给**：金额、日期推算、阈值判断、枚举→中文、能不能点、权限、页面结构数据、一切配方计算。

**前端可以写**：加载中/暂无数据/网络错误文案、页面标题与返回、纯样式、本地草稿缓存。

**红线检查（加进 CI 或守卫测试）**：
1. 源码里搜不到 `PENDING_PAYMENT: '待付款'` 这类映射表；
2. 源码里搜不到业务算术（金额/日期/阈值）；
3. 后台页面里搜不到 `role === 'ADMIN'`；
4. 新增业务参数不需要改前端代码（人工确认项）。

---

## 七、接口设计

> 完整契约在执行阶段写进 `docs/05_API_Specs.md` 的新章节「4.7 食谱定制板块（2026-10 重构后）」。
> 此处只列骨架与关键点。

### 7.1 顾客侧（小程序）

| 方法 | 路径 | 说明 | 变化 |
|---|---|---|---|
| GET | `/custom-recipe/entry` | **【新】页面入口一次拉全**：公开配置 + 表单 schema + 选项 + 最近可约日 + 我的待付款单摘要 | 新 |
| POST | `/custom-recipe/orders` | 提交定制单（按 schema 的 answers） | 改：接收配置化字段 |
| GET | `/custom-recipe/my-orders` | 我的定制订单列表 | 改：返回三件套 |
| GET | `/custom-recipe/orders/:orderId` | 订单详情 | 改：返回三件套 + 交付 + 售后摘要 |
| POST | `/custom-recipe/orders/:orderId/pay` | 发起支付 | 不变 |
| POST | `/custom-recipe/orders/:orderId/sync-payment` | 主动查单 | 不变 |
| POST | `/custom-recipe/orders/:orderId/cancel` | 自助取消 | 改：走状态机 |
| GET | `/custom-recipe/orders/:orderId/deliveries` | **【新】**交付记录列表 | 新 |
| GET | `/custom-recipe/orders/:orderId/deliveries/:version` | **【新】**某一版交付（含交付物） | 新 |
| POST | `/custom-recipe/orders/:orderId/deliveries/:version/confirm` | **【新】**确认收到 | 新 |
| POST | `/custom-recipe/orders/:orderId/aftersales` | **【新】**提交售后 | 新 |
| GET | `/custom-recipe/orders/:orderId/aftersales` | **【新】**该单的售后记录 | 新 |
| GET | `/custom-recipe/aftersales/:id` | **【新】**售后详情 | 新 |
| POST | `/custom-recipe/aftersales/:id/replies` | **【新】**顾客补充说明 | 新 |
| GET | `/custom-recipe/schedule` | 可约日历（顾客看） | 改：加交付容量与关闭原因 |
| GET | `/custom-recipe-config` | 公开配置 | 改：扩展公开子集 |
| GET | `/api/v1/options` | **【新】**选项字典（公共） | 新 |
| GET | `/api/v1/custom-recipe/form-schema` | **【新】**定制问卷 schema | 新 |

**删除**：`POST /custom-recipe/upload-attachment`（无调用方）、
`GET /custom-recipe/dogs/:dogId/preference-analysis`（恒返回空）、
`POST /custom-recipe/upload-attachment` 的后台孪生接口。

### 7.2 后台侧（admin-web）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/admin/custom-recipe/workbench` | **【新】**五个待办队列及数量 |
| GET | `/admin/custom-recipe/orders` | 列表（加筛选、排序、默认待处理视图） |
| GET | `/admin/custom-recipe/orders/export` | **【新】**导出（对齐成品订单列表） |
| GET | `/admin/custom-recipe/orders/:id` | 详情（分区 + 三件套） |
| POST | `/admin/custom-recipe/orders/:id/accept` | **【新】**接单（写 `acceptedAt` / `handledBy`） |
| PATCH | `/admin/custom-recipe/orders/:id/sub-stage` | **【新】**更新内部子阶段 |
| PATCH | `/admin/custom-recipe/orders/:id/confirm-payment` | 人工确认收款（已有） |
| POST | `/admin/custom-recipe/orders/:id/deliver` | **【新】**从编辑器成果交付（带交付物与喂食参数） |
| GET | `/admin/custom-recipe/orders/:id/deliveries` | **【新】**交付记录（版本、交付人、顾客查看/确认） |
| POST | `/admin/custom-recipe/orders/:id/deliveries/:did/revoke` | **【新】**撤回本次交付 |
| GET | `/admin/custom-recipe/orders/:id/aftersales` | **【新】**该单售后 |
| POST | `/admin/custom-recipe/aftersales/:id/accept` \| `/reply` \| `/resolve` \| `/reject` | **【新】**售后处理 |
| POST | `/admin/custom-recipe/orders/:id/cancel` | 取消（已付款自动退款，沿用） |
| POST | `/admin/custom-recipe/orders/:id/restore-credit` | 恢复额度（已有） |
| GET/PUT | `/admin/custom-recipe/config` | 配置（扩展） |
| GET | `/admin/custom-recipe/schedule?from=&to=` | **【新】**区间日历（含接单/交付两个计数） |
| PUT | `/admin/custom-recipe/schedule/:date` | **【新】**单日开关 |
| POST | `/admin/custom-recipe/schedule/batch` | 批量设置（已有接口，补"已有订单是否顺延"参数） |
| GET/PUT | `/admin/custom-recipe/weekday-rules` | **【新】**按星期规则 |
| GET/PUT | `/admin/custom-recipe/form-fields` | **【新】**表单字段配置 |
| GET/PUT | `/admin/options/:setCode` | **【新】**选项字典维护 |

**编辑器打通**：
- `POST /admin/custom-recipe/orders/:id/deliver` 接收 `designDraftId` 或 `recipeId`，
  由后端完成"建食谱归属 + 写交付单 + 快照 + 状态流转 + 通知"，**全部在一个事务里**。
- 编辑器 URL 带 `?orderId=xxx`，编辑器右侧调 `GET /admin/custom-recipe/orders/:id/design-context`
  拿到顾客需求 + 档案最新 + 过敏比对。

### 7.3 接口的兼容策略

| 类型 | 策略 |
|---|---|
| 新增字段 | 追加，老客户端忽略 |
| 语义变化 | **不做**破坏性变更；用新接口（如 `deliveries`）替代旧行为，旧接口标记 deprecated 但保留一个版本 |
| 删除接口 | 先确认无调用方（本次删的 3 个都已确认） |
| 状态枚举新增 `COMPLETED` | 老小程序遇到未知枚举会走兜底文案（已确认 `custom-recipe-order.ts` 有兜底），但**仍要求小程序与后端同批上线** |

---

## 八、状态机与动作

### 8.1 状态定义

```prisma
enum CustomRecipeStatus {
  PENDING_PAYMENT   // 待付款
  PAID              // 已付款 · 待接单
  IN_PROGRESS       // 制作中
  DELIVERED         // 已交付
  COMPLETED         // 已完成（顾客确认 / 超时自动）
  CANCELLED         // 已取消
}

/// 内部子阶段：只影响后台工作台，顾客侧仍是"制作中"
enum CustomRecipeSubStage {
  PENDING_ACCEPT     // 已付款，还没接单
  ACCEPTED           // 已接单
  NEED_INFO          // 资料不足，等顾客补充
  DESIGNING          // 营养师设计中
  IN_REVIEW          // 内部审核中
  READY_TO_DELIVER   // 设计完成，待交付
}
```

### 8.2 合法流转（唯一真源，纯函数表）

| 从 | 到 | 触发者 |
|---|---|---|
| `PENDING_PAYMENT` | `PAID` / `CANCELLED` | 支付回调 / 超时关单 / 顾客取消 |
| `PAID` | `IN_PROGRESS` / `CANCELLED` | 接单 / 顾客取消 / 后台取消（退款） |
| `IN_PROGRESS` | `DELIVERED` / `CANCELLED` | 交付 / 后台取消（退款） |
| `DELIVERED` | `COMPLETED` / `DELIVERED` | 顾客确认或超时 / **重新交付（自环）** |
| `COMPLETED` | `DELIVERED` | **售后调整后重新交付**（回到已交付待确认） |
| `CANCELLED` | — | 终态 |

> **相对现状的两处关键变化**：① `DELIVERED` 不再是终态；② 允许 `COMPLETED → DELIVERED` 的自环回退
> （售后改了食谱，顾客需要重新确认）。

### 8.3 动作解析器

`CustomRecipeActionResolver.resolve(order, viewer)` 返回 `RenderableAction[]`：

| 动作 | 顾客可见 | 后台可见 | 可用条件（后端算） |
|---|---|---|---|
| `PAY` | ✅ | — | 状态 = PENDING_PAYMENT 且未超时 |
| `CANCEL_SELF` | ✅ | — | 状态 ∈ {PENDING_PAYMENT, PAID} |
| `CONTACT_SERVICE` | ✅ | ✅ | 恒可用 |
| `CONFIRM_RECEIPT` | ✅ | — | 有未确认的有效交付 |
| `APPLY_AFTERSALE` | ✅ | — | 在售后窗口内 |
| `VIEW_DELIVERY` | ✅ | ✅ | 有交付记录 |
| `ACCEPT_ORDER` | — | ✅ | 状态 = PAID |
| `DESIGN` | — | ✅ | 状态 = PAID / IN_PROGRESS |
| `DELIVER` | — | ✅ | 状态 ∈ {PAID, IN_PROGRESS, DELIVERED, COMPLETED} 且角色 ≥ ADMIN |
| `CANCEL_ADMIN` | — | ✅ | 角色 = ADMIN |
| `RESOLVE_AFTERSALE` | — | ✅ | 有未解决售后 |

**禁用时必须给 `disabledReason`**（例如"已超过 30 天售后窗口，如需帮助请联系客服"）——
现状是按钮直接消失或点了才报错。

---

## 九、交付与内容快照

### 9.1 交付的原子操作

```
POST /admin/custom-recipe/orders/:id/deliver
{ designDraftId | recipeId, feedingParams, items[], reviewNote? }
```

**一个事务内完成**：
1. 校验食谱归属（必须是该顾客 + 该狗的私密定制食谱）
2. 校验订单没被别的交付占用（`recipeId` 唯一约束的前置检查，并处理"同一道食谱交付给第二张单"）
3. 生成 `contentSnapshot`（按交付物清单组装：食谱本体 + 营养报告 + 采购与制作 + 喂食建议）
4. 写 `custom_recipe_delivery`（version = 该订单已有版本数 + 1）
5. 把上一版 `replacedByDeliveryId` 指向新版本
6. 更新订单：`recipeId` = 新版食谱、`status` = DELIVERED、`deliveredAt`、
   `autoCompleteAt` = now + `autoCompleteDays`
7. 状态流转**经状态机**

**事务外**：发通知（失败不回滚交付，落 `notifyStatus=FAILED` 由定时任务重试）。

### 9.2 内容快照的结构

```json
{
  "recipe":   { "recipeId": "R...", "name": "...", "coverImageUrl": "...", "items": [...] },
  "feeding":  { "dailyIntakeG": 220, "mealsPerDay": 2, "perMealG": 110, "cycleDays": 7 },
  "nutrition":{ "standard": "FEDIAF_2025", "summary": {...}, "plainConclusion": "..." },
  "shopping": { "lines": [{ "name": "牛后腿肉", "netG": 493, "purchaseG": 530 }], "totalG": 1660, "lossRate": 1.07 },
  "supplements": [{ "name": "碳酸钙粉", "totalG": 4.9, "brand": "..." }],
  "steps":    ["...", "..."],
  "storage":  "冷藏 3 天，冷冻 14 天…"
}
```

**快照由后端组装**（含采购量的损耗计算、喂食克数）—— 这正是第 5 节要搬进后端的计算。

### 9.3 顾客查看

`GET /custom-recipe/orders/:orderId/deliveries/:version` 返回快照 + 渲染元数据。
**顾客看到的是快照，不是当前 Recipe** —— 这就是"改食谱不会串改历史"的实现。

---

## 十、售后

### 10.1 生命周期

```
PENDING ──accept──> ACCEPTED ──> PROCESSING ──resolve──> RESOLVED
   └────────────reject──────────────────────────────────> REJECTED
```

### 10.2 与订单的关系

- 售后**不改订单主状态**（避免"已交付 / 售后中"互相覆盖）；
- 「调整食谱」类型的售后解决时，**必须**关联一条新的交付记录（`linkedDeliveryId`）；
- 新交付会把订单从 `COMPLETED` 拉回 `DELIVERED`（见 8.2 自环回退），顾客重新确认。

### 10.3 权限与留痕

- 客服可受理与回复；**「拒绝」与「退款特批」仅管理员**；
- 每一步写时间戳与操作人；顾客端可见进度（复用同一套 `RenderableProgress`）。

---

## 十一、产能与排单

### 11.1 排单算法（纯函数，可单测）

```ts
// domain/custom-recipe/custom-recipe.schedule.ts
export interface ScheduleContext {
  today: Date;
  lookaheadDays: number;        // 45
  defaultCapacity: number;      // 每日接单上限
  defaultDeliveryCapacity: number;
  weekdayRules: WeekdayRule[];
  dayOverrides: DayOverride[];  // custom_recipe_schedule 里的具体某天
  intakeCountByDate: Map<string, number>;
  deliveryCountByDate: Map<string, number>;
  holidays: Set<string>;        // 第三方节假日接口结果（带缓存与超时）
}

export function planOrder(ctx, workDays): {
  scheduledDate: string;        // 接单日
  estimatedDeliveryDate: string;// 承诺交付日
}
```

**算法**（与需求文档 15.3 一致）：
1. 从今天起，找第一个「未关闭 且 接单量 < 该日接单上限」的日子 → 接单日
2. 从接单日往后数 `workDays` 个工作日（跳过周末与关闭日）→ 候选交付日
3. 若候选交付日交付量已满，继续顺延到第一个有空位的日子 → 承诺交付日

**并发安全**：沿用现有 CAS 做法（`updateMany` + 条件 `bookedCount`），
交付位同样用 CAS 占位。**两次占位在同一个事务里**（要么都占上，要么都不占）。

### 11.2 关闭某天时的保护

`PUT /admin/custom-recipe/schedule/:date` 的入参带 `cascade`：

| `cascade` | 行为 |
|---|---|
| `NONE`（默认） | 只关闭；若该天有已排订单，**返回 409 + 受影响的订单清单**，要求前端二次确认 |
| `RESCHEDULE` | 关闭并把受影响的订单顺延（重算承诺交付日），逐单写状态历史并通知顾客 |

**绝不允许静默改期** —— 这是需求文档 15.4 定的硬口径。

### 11.3 两个入口共用同一套接口

小程序工作台与 Web 后台**调同一组接口**，不各写一套。
小程序只展示"今日 + 未来 7 天"，后台展示"未来 30 天 + 批量设置"。

---

## 十二、兼容、上线顺序与回滚

### 12.1 上线顺序（强约束）

```
① 后端（加表加列 + 新接口 + 字典底座）—— 老小程序、老后台都不受影响
② 小程序                    —— 依赖后端新字段
③ admin-web                 —— 依赖后端新接口
```

**为什么后端可以先上**：本批改动是"加表加列 + 新增接口"，
老接口的返回是**追加字段**（不是替换），老客户端忽略新字段即可正常工作。

**唯一需要注意**：`COMPLETED` 是新枚举，老小程序遇到会走兜底文案"状态待确认"。
所以**②必须紧跟①**，不能停太久。

### 12.2 数据迁移的执行顺序

1. 建表（delivery / aftersale / weekday_rule / form_field / option_set / option_item）
2. 加列（order 7 列、schedule 2 列、config 17 列）
3. 删 `custom_recipe_order.amount` 的列默认值
4. seed 选项字典与表单字段
5. **回填历史交付**：为 `DELIVERED` 订单建 delivery 记录（可分批，用脚本）
6. 设 `autoCompleteAt`
7. 校验脚本：核对每张 DELIVERED 单都有 delivery、每张单的 version 连续

### 12.3 回滚

- 代码回滚：老代码只读老列，新增的表与列不影响它；
- 若已产生 `COMPLETED` 状态而代码回滚，老代码会把它当未知状态 ——
  **回滚前必须先把 `COMPLETED` 批量改回 `DELIVERED`**（脚本准备好）。

---

## 十三、测试策略

> 详细用例库在执行阶段的《测试方案》里出。这里定**分层与红线**。

| 层 | 位置 | 覆盖什么 |
|---|---|---|
| **领域单测** | `backend/tests/domain/custom-recipe/` | 状态机流转表、排单算法、额度计算、交付物组装规则（**纯函数，不需要数据库**） |
| **应用单测** | `backend/tests/application/custom-recipe/` | 各服务的编排、事务边界、并发 CAS、策略判定 |
| **契约守卫** | `backend/tests/contracts/` | 渲染契约字段齐全；选项字典与枚举一致；**状态流转无旁路** |
| **Schema 守卫** | `backend/tests/prisma/` | 沿用现有做法：断言 migration 文件存在且 SQL 含关键 DDL |
| **前端源码守卫** | `miniapp/src/pages/*.regression.spec.ts`、`admin-web/tests/` | 红线扫描：没有硬编码状态映射、没有业务算术、没有角色判断 |
| **接口联调** | 手工走查 + 验收清单 | 按需求文档第十四节的场景 |

**必须新增的四条守卫**（都对应这次要根治的病）：

| # | 守卫 | 断言什么 |
|---|---|---|
| 1 | 状态流转唯一入口 | 源码里除状态机外，没有别处直接更新 `status` |
| 2 | 前端零硬编码枚举 | 三个端搜不到状态/目标/活动量的中文映射表 |
| 3 | 前端零业务算术 | 搜不到金额加减、日期相减、阈值比较 |
| 4 | 后端零重复实现 | 前端 `utils/recipeDesigner/` 下不存在营养合规判定实现 |

---

## 十四、风险清单

| # | 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|---|
| 1 | 评估引擎搬后端后编辑器变卡 | 中 | 高 | 节流 + 请求取消；先在一个环境实测；实在不行保留"总重/占比"的本地即时反馈 |
| 2 | 小程序与后端上线不同步 | 中 | 中 | 后端先上；小程序紧跟；`COMPLETED` 的兜底文案已确认存在 |
| 3 | 历史交付回填不准 | 中 | 中 | 回填脚本先 dry-run 输出报告，人工核对再执行 |
| 4 | 表单配置化被滥用（字段越加越多） | 中 | 低 | 类型白名单 + "核心字段必须有列"的约束；字段增删需管理员 |
| 5 | 选项字典与 Prisma 枚举漂移 | 低 | 中 | 启动时自动同步 + 漂移告警 |
| 6 | 交付快照体积过大（一份含全部营养数据） | 低 | 低 | 快照只存"渲染所需"的字段，不存完整评估明细；明细按需再查 |
| 7 | 重构期间与其它会话冲突 | 中 | 中 | 沿用项目既有做法：独立 worktree + 合并前核对重叠文件 |
| 8 | `customRecipeOrder.recipeId` 唯一约束在重新交付时撞库 | 中 | 中 | 已有前置检查；本次把它挪进交付事务，并补单测 |

---

## 十五、分批与工作量

> 分五批，**每批都能独立上线并产生可验证的业务收益**。
> 工作量是粗估档位（小 / 中 / 大 / 很大），实际以执行阶段的拆分与排期为准。

### 批次 1 · 底座（后端为主，不改前端行为）

| 内容 | 档位 |
|---|---|
| 拆 `CustomRecipeService`、建 Prisma 仓储实现、收敛状态机 | 大 |
| 选项字典（表 + 服务 + 启动同步 + 接口 + 后台维护页） | 中 |
| 配置扩展（17 个参数）+ 公开子集 | 小 |
| 迁移脚本 + 历史数据回填 | 中 |
| 守卫测试 4 条 | 中 |

**产出**：老页面照常工作，但后端已经能按新结构跑。**风险最低，收益是后面四批的地基。**

### 批次 2 · 顾客侧交付与售后（收益最直接）

| 内容 | 档位 |
|---|---|
| 交付单（表 + 服务 + 快照组装） | 大 |
| 顾客侧：订单详情三件套 + 进度时间轴 + 交付卡片 + 确认收到 | 中 |
| 顾客侧：售后申请与进度 | 中 |
| 交付物两页（专属食谱 / 采购与制作）+ 长图复用 | 大 |
| 后端组装交付物内容（含采购量、喂食量计算搬后端） | 中 |

**产出**：老板能第一次真正"把食谱交付给客户"，顾客能确认、能提售后。

### 批次 3 · 后台管理（员工效率）

| 内容 | 档位 |
|---|---|
| 工作台（五个待办队列）+ 列表导出 + 默认待处理视图 | 中 |
| 订单详情分区 + 交付记录区 + 售后区 | 大 |
| 编辑器带订单进来 + 一键交付 + 预览顾客所见 | 大 |
| 售后处理界面 | 中 |

**产出**：员工不用再绕到食谱管理页手工设归属；交付记录可查。

### 批次 4 · 产能与自动排单（老板点名要的）

| 内容 | 档位 |
|---|---|
| 产能模型（两级容量）+ 排单算法抽成纯函数 | 中 |
| Web 后台：未来 30 天日历 + 批量设置 + 关闭某天的二次确认 | 大 |
| 小程序工作台：今日排单 + 未来 7 天 + 快捷关单 | 中 |
| 顾客侧：产能见底提示与暂停接单 | 小 |

**产出**：老板在手机上就能调产能、关节假日；承诺交付日可信。

### 批次 0 · 随手修（可以立刻做，不依赖任何前置）

| 内容 | 档位 |
|---|---|
| **评估引擎性能记忆化**（WeakMap 缓存 `normalizeNutritionProfile`） | 小 |
| 顺带补一个**真实 137 目标的性能守卫测试** | 小 |

**为什么单独拎出来**：这一条**独立于整个重构也有价值** —— 编辑器与发布页都会快约 20 倍
（**实测** 15 个食材 202ms → 9.6ms）。而且它是批次 5 的前置条件（见 5.2.3）。
**建议先做掉，让老板立刻感受到编辑器变快。**

### 批次 5 · 计算后端化收尾

| 内容 | 档位 |
|---|---|
| 表单配置化（L3）落地：schema 下发 + 后台配置页 + 双轨绑定 | 大 |
| 前 9 处前端计算搬后端 | 中 |
| **配方编辑器评估引擎搬后端**（详见 5.2，实测后由"很大"下调为 3–5 人日） | 中 |
| 前端硬编码清理（状态/选项/角色判断） | 中 |

**产出**：老板要的"所有计算交给后端，前端只渲染"真正达成。

> ⚠️ **批次 5 有一项需要老板先定**：后端独有、目前只有小程序在用的
> `removableSupplementWarnings`（可移除补剂提醒）与 `allergenWarnings`（过敏原警告），
> 搬到 admin-web 后会**新增界面内容**。要不要在后台也显示，需要产品确认（见 5.2.7 第 6 条）。

### 顺序的理由

```
批次 0（随手修：评估快约 20 倍）← 独立收益，先拿到
   └→ 批次 1（地基）
         └→ 批次 2（顾客能收到东西）← 最直接的业务收益
               └→ 批次 3（员工能用好）
                     └→ 批次 4（老板能控产能）
                           └→ 批次 5（把技术债还清）
```

**每批结束都要**：
1. 后端全量测试通过（基线 **302 套 / 3158 项**）+ `npx tsc -p tsconfig.build.json --noEmit` **0 错**；
2. admin-web 构建通过 + 单测通过（基线 **18 套 / 252 项**）；
3. 小程序构建通过 + （若动了小程序）上传体验版给老板看（基线 **124 套 / 1642 项**）；
4. 更新需求文档的「执行记录」与本方案的「实际进度」；
5. 部署（后端 / admin-web 可直接上生产；小程序只上传体验版）。

> ⚠️ **不要用 `npx tsc --noEmit` 当验收标准** —— 它含测试文件，本项目有 **262 个既存类型错误**
> 分布在这类文件里（实测）。生产代码的干净检查用 `tsconfig.build.json`。
> 详见执行计划 §1.1.1。

---

*本文为技术方案层。执行计划见 `2026-10-16-custom-recipe-execution-plan.md`；
测试方案待执行计划确认后产出。*
