# 订单中心 · 代客下单（成品鲜食）设计方案

- 日期：2026-11-08
- 状态：**待老板确认**（2026-11-08 23:00 修订：支持无账号顾客；**员工入口暂不开放**，只给管理员）
- 工位：`task/20261108-t222015`
- 前置：2026-06-11 已上线的「客户与狗狗 → 代客下单」（`docs/_archive/superpowers/specs/2026-06-11-staff-assisted-orders-dog-recipe-history-design.md`）
- 证据来源：本仓库代码实测（`backend/src`、`miniapp/src`、`backend/prisma/schema.prisma`），2026-11-08 21:40~22:20

---

## 0. 一句话

把「代客下单」从客服工作台搬到订单中心，并且把它从"手填克数的表单"改成"选狗 → 选食谱 → 确认"的三步小流程：
食谱在橱窗食谱之外，**还能选全部定制食谱（含别人家狗狗的）**；克数按狗狗体重自动算，提交前先看到系统报价。

顾客没有小程序账号（电话打来下单）也得走得通 —— 搜不到就当场建顾客、建狗、填地址，这是本期范围的一部分。

---

## 1. 老板已拍板的事

| # | 议题 | 决定 |
|---|---|---|
| 1 | 范围 | **只做成品鲜食订单**。定制食谱那一套代客下单（后台 `AssistedOrderCreate`）**不搬到小程序** |
| 2 | 入口 | 放在**小程序订单中心** |
| 3 | 流程 | 选狗 → 选食谱 → 确认，三步（已看流程图确认） |
| 4 | 食谱可见范围 | 不只这只狗的专属定制，**所有定制食谱都要能看到，包括别人家狗狗的** |
| 5 | 食谱选择交互 | 方案 B：一个列表 + 顶部筛选（全部 / 橱窗 / 这位顾客的定制 / 其他定制）+ 搜索 |
| 6 | 无账号顾客 | **本期必须接**（2026-11-08 22:46）。电话打来、没有小程序账号的顾客，要能当场建档并下单 |
| 7 | 员工入口 | **暂时不开放**（2026-11-08 23:00）。代客下单只给管理员，员工端看不到这个入口 |

---

## 2. 现状证据（代码实测）

| 事实 | 位置 |
|---|---|
| 代客下单页现在只挂在「客服工作台 → 客户与狗狗」，每只狗一行「代客下单」按钮 | `miniapp/src/pages/staff-customer-service/customers.vue:40` |
| 代客下单页是一个长表单：食谱**下拉选择器**、地址下拉、手填天数/总克数/每包克数/包数 | `miniapp/src/pages/staff-customer-service/assisted-order.vue` |
| 后端已经能同时返回橱窗食谱和私密定制食谱 | `staff-customer-service.controller.ts` `listDogFinishedFoodRecipeOptions` |
| 但私密定制**被限定为"这位顾客的"**：`customerOwnerId: ownerId` | 同上，`where` 子句 |
| 员工/管理员本来就有权打开任何私密定制食谱 | `recipes.controller.ts:713`（`role === 'STAFF' \|\| 'ADMIN'`） |
| 用别人的私密食谱下单**不会被拦**：下单链路只拦"顾客自己设计的系列" | `order.service.ts:1094` `assertRecipeOrderableAsFinishedFood` |
| 下单时系统会**自己算价**（原料+包装+人工+分摊+运费），代客页只是把这个结果用「实际收款金额」覆盖 | `order.service.ts:1854` `createOrderFromItems` |
| 但员工在提交前**看不到这个价**：报价接口 `POST /orders/pricing/preview` 用的是登录人自己的 `customerId` | `orders.controller.ts:954` |
| 狗狗饭量接口 `POST /dogs/:id/calc-for-recipe` 同样按 `user.customerId` 校验归属，员工算不了顾客的狗 | `dogs.controller.ts:1382` |
| 报价接口每次调用会**落一条价格快照**（除了 DIY_SHEET 用途） | `order.service.ts:2517` |
| 订单中心现在只有列表 + 搜索 + 筛选，**没有任何"新建"入口** | `miniapp/src/pages/staff-order-center/index.vue` |
| 分装业务规则：1 袋 = 1 顿（袋数 = 餐次 × 天数），总量最低 1000g，单袋过小会报错 | `miniapp/src/composables/usePackagePlan.ts`、`recipe-order/index.vue:874` |
| 代客单可以约「今天」制作，顾客自助单不行 | `order.service.ts:125`、`production-date.ts` |

**结论**：数据层和下单层基本齐了，缺的是三块 —— ①入口在错的地方；②"全部定制食谱"被一个过滤条件挡住了；③员工在提交前既看不到饭量也看不到价。

---

## 3. 目标 / 非目标

### 目标
1. 员工在订单中心里，从"接到一个电话"到"单子建好"不超过 4 次点击（不含填金额）。
2. 选食谱时能看到橱窗 + 全部定制，并且看得出"这是谁家的哪只狗"。
3. 克数、包数、总重自动算好，员工只需要确认或微调。
4. 提交前看到系统报价；实收与报价不一致时必须写原因。
5. 没有小程序账号的顾客也能走完整条流程：当场建顾客、建狗、填地址、下单。

### 非目标（本期不做）
- 定制食谱的代客下单（问卷、报价、排期）——留在后台。
- 一次给多只狗 / 多个食谱下同一单。
- 补剂、试吃装的代客下单（入口不出现）。
- 顾客端任何改动。

### 反面目标（做成了也算失败）
- 让员工更容易下错狗、下错食谱（比如列表里看不出归属）。
- 把"报价"做成可以随手改的东西，导致事后对不上账。

---

## 4. 用户流程

```
订单中心
  └─ 顶部「＋ 代客下单」
       ├─ ① 选顾客 / 选狗
       │     ├─ 搜到了 → 选一只狗
       │     └─ 搜不到 → ＋新建无账号顾客（姓名 + 电话）
       │                  └─ 顾客名下还没有狗 → ＋新建狗狗（8 项档案）
       ├─ ② 选食谱        （全部 / 橱窗已上架 / 这位顾客的定制 / 其他定制 + 搜索）
       └─ ③ 确认          （饭量 → 分装 → 制作日期 → 地址 → 报价 → 实收 → 提交）
             ├─ 顾客名下没有地址 → ＋新增收货地址
             └─ 成功后跳到员工订单详情
```

### ① 搜顾客 / 选狗
- 复用现有 `GET /staff/customer-service/customers/search`，**搜索口径要扩到无账号顾客**（§6.2）。
- 结果里两种人：有账号顾客（正常）和无账号顾客（灰标「无账号」）。顾客卡片下面列狗，选一只。
- 选中后显示**上次那一单**（食谱名 / 分装 / 日期），让员工一眼确认"是不是又要一样的"。
- 搜不到就给出口：`没找到？＋ 新建无账号顾客`（只有管理员看得到，J16）。
- 新建顾客只要 **姓名 + 电话**（微信可选）；建完直接带着这个顾客回到选狗，并提示"还没有狗狗".
- 顾客名下没有狗时给 `＋ 新建狗狗`，只录影响饭量和档案的 8 项（J17）。
- 没搜索词时不展示结果，避免一进来就是全量顾客。

### ② 选食谱（方案 B）
- 顶部筛选：`全部` / `橱窗已上架` / `这位顾客的定制` / `其他定制`。
- 一行搜索框：食谱名 / 顾客名 / 狗狗名。
- 每条卡片：封面、食谱名、来源、归属（`豆豆的定制 · 李先生家 · 泰迪`）、适配提示。
- 选中"其他定制"时，卡片下方出现一行提示：`这条是给「豆豆」定制的，用于布丁下单前请确认配方仍适用`。
- 分页加载，每次 20 条。

### ③ 确认
- 顶部：狗 + 食谱（可返回改）。
- 饭量区：`按 12.4kg / 每天 2 餐算：每天 447g`，默认 7 天 → 总克数 / 分装建议。
- 天数与分装可改；改动后重新算总重、重新报价。默认 7 天，若总重不足 1000g 自动抬到够 1000g 的最小天数（J13）。
- 制作日期：默认"最早可约日"，代客允许选今天。
- 地址：**必填**，默认选中默认地址，可切换（J14）。
- 金额：`系统报价 ¥428.00`（只读）+ `实收金额`（可改）+ 不一致时必填 `差额原因`。
- 提交：`创建订单（线下已收款）`。

---

## 5. 关键决策

### 老板定的
见 §1。

### 我的判断（老板没明说，先这么定；不同意请指出）

| # | 事项 | 判断 | 理由 |
|---|---|---|---|
| J1 | 归属文案 | 保留狗名 + 主人 + 品种：`豆豆的定制 · 李先生家 · 泰迪` | 员工要靠它辨认"这是哪一单定制的"，只写主人反而难找 |
| J2 | 不合适食谱 | **只提示，不禁止** | 员工在现场跟顾客沟通，系统没有资格替他决定；但必须写清原因 |
| J3 | 提示口径 | 只判两类硬伤：**过敏原冲突**、**生命阶段不符**；健康标签只展示不判断 | 这两类判错代价最大；健康标签的匹配规则容易误伤 |
| J3a | 过敏判定方式 | 用"名称包含匹配"（`鸡肉` 命中 `水煮鸡胸肉`），**宁多勿漏**；误报用"请确认"的软措辞，不写"不能吃" | 过敏原在库里是自由文本（`Dog.allergyFoods`、`AllergyRecord.allergen`），没有标准词表，严格匹配会漏 |
| J4 | 旧入口 | 客服工作台「客户与狗狗」里的「代客下单」**改指向新流程**，旧页面下线；按钮与入口**只对管理员渲染**（J19） | 不留两套入口，避免页面分叉 |
| J5 | 实收 vs 报价 | 不一致时**必须填原因**（一句人话），随订单留痕 | 现在只写「备注」，事后分不清哪句是差额原因 |
| J6 | 一单范围 | 一张单 = 一只狗 + 一条食谱 | 与现有下单链路（MVP 单商品）一致，不为多狗改造订单模型 |
| J7 | 报价落库 | 员工报价**不落价格快照** | 快照是顾客自助下单的防篡改凭证；员工报价只是看一眼，落库只会污染数据 |
| J8 | 页面归属 | 新开分包 `pages/staff-assisted-order/`，三个页面各司其职 | 单页三步会让一个页面又长又难测；分包也让小程序主包不膨胀 |
| J9 | 顾客自己 DIY 设计的食谱 | **不出现在列表里**（不是灰掉，是不列） | 下单链路会拦（W3：系列 `createdBy` 是顾客），报错文案还是对着顾客写的；老板说的"全部定制"指的是别人家狗狗的定制，不是顾客的设计稿 |
| J10 | "未定稿"的定制 | 只列 `status = PRIVATE_CUSTOM` 且系列未删除 / `status = ACTIVE` 的 | `DRAFT` 本身就不在 `PRIVATE_CUSTOM` 里；不再额外要求"有交付记录"，避免老数据被误藏 |
| J11 | 顾客级定制（没绑具体狗，`customerDogId = null`） | 归「这位顾客的定制」档；卡片文案写 `张女士的定制 · 通用` | 归"其他定制"会让提示句变成"这条是给豆豆定制的"，明摆着错 |
| J12 | 筛选档名 | 四档：`全部` / `橱窗已上架` / `这位顾客的定制` / `其他定制` | 比"布丁专属"更准 —— 这一档里既有绑这只狗的，也有顾客级的 |
| J13 | 1000g 起订量 | **代客单不豁免**（成本口径），但确认页默认天数自适应：从 7 天起，不足 1000g 就自动抬到够 1000g 的最小天数并说明 | 硬豁免会破坏定价与采购口径；自动抬天数对员工是零负担 |
| J14 | 收货地址 | **必填** | 成品鲜食是冷链发货，没有地址这单发不出去 |
| J15 | 无账号顾客 | 支持：搜得到、建得出、下得了单 | 老板 2026-11-08 明确要求 |
| J16 | 谁能建无账号顾客 | **只有管理员**（沿用现有 `AdminGuard`），员工看不到"新建"按钮 | 建档是造数据，不能松给所有人；本期本来就是老板自己用 |
| J19 | 员工能不能代客下单 | **暂时不能**：前端入口按角色隐藏，**后端接口同时收口到 `AdminGuard`** | 只藏入口等于没拦 —— 员工仍可直接调接口下单；两边一起收才叫"不开放" |
| J19a | 怎么恢复 | 把 `orders/assisted` 与三个建档接口的 `AdminGuard` 改回 `StaffGuard`，前端去掉角色判断即可，不动表结构 | 是"暂时"，要保证能一键放开 |
| J17 | 建狗录多细 | 只录 8 项：名字、品种、生日、性别、绝育、当前体重、体况评分、活动量；餐数默认 2 | 这 8 项决定饭量与生命阶段；其余档案以后可在后台补 |
| J18 | 顾客没地址 | 流程里能**直接新增**一条地址（写进该顾客的地址簿） | 无账号顾客不可能自己在小程序里加地址；不给这条路，第③步必然卡死 |

---

## 6. 后端设计

### 6.1 改：列出可下单食谱

`GET /api/v1/staff/customer-service/dogs/:dogId/recipe-options`

| 参数 | 说明 |
|---|---|
| `scope` | `own`（默认，兼容旧调用）/ `all`（含别人家狗的定制） |
| `keyword` | 食谱名 / 顾客名 / 狗狗名 |
| `page`、`pageSize` | 分页，默认 1 / 20 |

返回每条新增两个字段：

```jsonc
{
  "id": "recipe_id",              // recipeId（业务号）
  "name": "鸭肉梨子低敏餐",
  "status": "PRIVATE_CUSTOM",
  "ownership": {
    "kind": "OTHER_CUSTOM",       // WINDOW | OWN_CUSTOM | OTHER_CUSTOM
    "customerId": "u_1",
    "customerName": "李先生",
    "dogId": "d_9",
    "dogName": "豆豆",
    "breedName": "泰迪"
  },
  "fit": {
    "level": "WARN",              // OK | WARN
    "reasons": ["布丁的档案里记录了鸡肉过敏，这条配方含水煮鸡胸"]
  }
}
```

- `scope=all` 时：`status=PUBLIC`（且系列已发布）∪ `status=PRIVATE_CUSTOM`（不限 owner）；
  同时**排除**顾客自己 DIY 设计的系列（J9，否则点得动、提交必 400）和已删除 / 非 `ACTIVE` 的系列（J10）。
- 旧调用方（不传 `scope`）行为不变，避免一次性打断客服工作台。
- `fit` 计算：对当前 `:dogId` 判断 —— 过敏原（`Dog.allergyFoods` + `AllergyRecord` 里确认过的）与配方原料名求交集；生命阶段用 `Recipe.applicableLifeStages` 对比狗狗当前阶段。健康标签不参与判定。
- 性能：一次 `recipeItem.findMany({ recipeId: { in: [...] } })` 取原料名，不做 N+1。

### 6.2 改：顾客搜索纳入无账号顾客

`GET /api/v1/staff/customer-service/customers/search?keyword=`

- 现在只查 `role = CUSTOMER` 的 `phone` / `nickname` / 狗名 / 订单号。
- **加两条 OR**：`guestContactPhone contains`、`guestContactName contains`（无账号顾客的电话只存在 `guestContactPhone`，`phone` 恒为 null）。
- 返回体每条新增 `isGuest: boolean`，前端据此打「无账号」标。
- 仍然是一个接口一次返回，不要做成"两个接口前端合并排序"。

### 6.3 复用：建无账号顾客 / 建狗（不新写服务）

| 用途 | 接口 | 权限 |
|---|---|---|
| 建顾客 | `POST /api/v1/admin/custom-recipe/guest-customers` | `AdminGuard`（已有） |
| 建狗 | `POST /api/v1/admin/custom-recipe/guest-customers/:customerId/dogs` | `AdminGuard`（已有） |

- 直接复用 `GuestCustomerService`，**不要**在 staff 控制器里再写一套。
- 建狗必填：`name`、`breedId`、`birthday`、`gender`、`isNeutered`、`currentWeightKg`、`bcsScore`、`activityLevel`（`CreateGuestDogDto` 现有口径）。
- 建完返回 `{ customerId }` / `{ dogId }`，前端拿它继续第②步。

### 6.4 新增：给指定顾客建收货地址

`POST /api/v1/staff/customer-service/customers/:customerId/addresses`（`AdminGuard`）

- 入参：`recipientName`、`phone`、`region{province,city,district}`、`detail`、`isDefault`。
- 内部复用 `AddressService.createAddress({ userId: customerId, ... })`，校验顾客存在。
- 返回新建地址（含 id），前端直接选中，不用回头再拉一次列表。

### 6.5 新增：饭量预览

`GET /api/v1/staff/customer-service/dogs/:dogId/portion-preview?recipeId=xxx&days=7`

```jsonc
{
  "dailyIntakeG": 447,
  "perMealIntakeG": 224,
  "mealsPerDay": 2,
  "totalG": 3129,
  "suggestedPackagePlan": [{ "packageSpecG": 224, "packageCount": 14 }],
  "minOrderG": 1000,
  "notes": ["按体重 12.4kg、每天 2 餐计算"]
}
```

- 复用 `order.service` 里已有的 `calculateDogEnergy` → `resolvePlanAwareFinalKcal` → `calculateDailyIntakeG`，**不新写一套算法**。
- 默认分装按"1 袋 = 1 顿"给建议，与顾客端一致。
- 体重缺失或档案不全时返回明确错误，不返回 0。

### 6.6 新增：员工报价预览

`POST /api/v1/staff/customer-service/orders/pricing-preview`

入参：`{ customerId, dogId, addressId?, items: [{ recipeId, quantityG, packageSpecG, packageCount, packagePlan, cycleDays }] }`

返回：`{ amountProduct, amountShipping, amountTotal }`

- 内部调 `orderService.previewPricing`，`customerId` 取自入参而不是登录人。
- **不写价格快照**：`pricingPurpose` 类型现在是 `'ORDER' | 'DIY_SHEET'`（`order.service.ts:117`、`dto/orders/pricing-preview.dto.ts:144`），
  扩成三值并加一个 `STAFF_PREVIEW`；`previewPricing` 里跟 `DIY_SHEET` 一样在落快照之前 `return pricingResult`。
- 校验 `dogId` 归属 `customerId`。

### 6.7 改：创建代客单

`POST /api/v1/staff/customer-service/orders/assisted`（现有接口，扩两个字段；**本期加 `AdminGuard`**）

| 新字段 | 说明 |
|---|---|
| `amountAdjustReason` | 实收≠系统报价时必填；为空且金额不一致 → 400 |
| `recipeSource` | `WINDOW` / `OWN_CUSTOM` / `OTHER_CUSTOM`，仅用于审计留痕 |

- 保留现有行为：`createOrderDraft(actorRole)` → `confirmOrder` → `updateOrderAmount` → 记 `ASSISTED_ORDER` 操作日志 → `processPayment(OFFLINE)`。
- 审计日志里补上食谱来源与归属，事后能查到"这单用的是别人家的定制食谱"。

---

## 7. 前端设计

### 7.1 新增分包 `pages/staff-assisted-order/`

| 页面 | 职责 | 关键点 |
|---|---|---|
| `index` | 搜顾客、选狗 | 搜索防抖；选中狗带出上次订单摘要 |
| `recipe` | 选食谱 | 筛选 + 搜索 + 归属标签 + 适配提示；分页 |
| `confirm` | 确认下单 | 饭量/分装/日期/地址/报价/实收；任何影响价格的改动都要重算 |
| `guest-customer` | 新建无账号顾客 | 只要姓名 + 电话（微信可选）；建完回选狗 |
| `guest-dog` | 新建狗狗档案 | 8 项（J17）；建完回选食谱 |
| `address` | 新增收货地址 | 复用 `address-edit` 的省市区选择与校验，落库到该顾客名下 |

### 7.2 改动

| 文件 | 改动 |
|---|---|
| `miniapp/src/pages/staff-order-center/index.vue` | 顶部加「＋ 代客下单」卡片，跳新流程；**仅 `role === ADMIN` 渲染** |
| `miniapp/src/pages/staff-customer-service/customers.vue` | 「代客下单」按钮改跳新流程（带 `customerId`+`dogId`，跳过选狗）；**仅 `role === ADMIN` 渲染** |
| `miniapp/src/pages/staff-customer-service/assisted-order.vue` | 下线 |
| `miniapp/src/pages.json` | 注册新分包 |
| `miniapp/src/api/orders.ts` | 新增三个接口封装，扩展 payload 类型 |

### 7.3 可复用的现成件

| 组件 / 逻辑 | 用途 |
|---|---|
| `components/package-plan/QuickCyclePackagePlan.vue` | 确认页的分装编辑，顾客端同款，不要另写一套 |
| `components/recipe/RecipeCover.vue` | 食谱封面（含兜底图） |
| `composables/usePackagePlan.ts` | 1 袋 = 1 顿 / 最低 1000g 的规则与校验 |
| `components/staff/StaffBottomBar.vue`、`StaffEmptyState.vue` | 员工端底部按钮与空态，保持视觉一致 |
| `backend/src/application/recipe-designer/order-recipe-template.service.ts` | 已有"其他狗狗的私密食谱 + 阶段不符提示"的现成实现，适配提示优先复用它，不要另写一套判定 |

### 7.4 状态传递
页面间只传 ID（`customerId`、`dogId`、`recipeId`），不传整坨对象；每一步自己按 ID 拉数据，避免"上一页数据过期"。

---

## 8. 边界与风险

| 风险 | 处理 |
|---|---|
| 员工把别人家狗的定制食谱用于当前狗，配方其实不适用 | 卡片必须显示归属；确认页把归属再显示一次；J2 只提示不拦 |
| 定制食谱可能已被改版 / 下架 | 只列 `PRIVATE_CUSTOM` 且未删除的当前版本；已作废的不出现 |
| 报价与实收不一致导致对账混乱 | J5 强制填写差额原因，写进操作日志 |
| 饭量算不出来（体重缺失、生日缺失） | 明确报错并提示去补档案，不静默给默认值 |
| 一次报价要跑原料与运费计算，可能慢 | 确认页做加载态；改分装时防抖 300ms 再请求 |
| `quantityG` / `packageCount` / `packageSpecG` 与 `packagePlan` 对不上会被后端直接拒 | `resolveOrderItemPackageInput` 会校验总和；前端由同一份分装状态派生这几个值，不各自维护 |
| 员工能在列表里看到别人家狗的定制食谱名 | 属老板明确要求；仅 STAFF/ADMIN 可见（现有守卫已保证） |
| 只藏前端入口，员工仍可直接调接口下单 | 后端同步收口到 `AdminGuard`（J19），前端另外不渲染入口 |
| **无账号顾客收不到任何微信通知**（发货通知、物流、售后提醒都依赖 openid） | 确认页与建单成功页都明确写「这单不会给顾客发微信通知，需人工告知」，不假装发了 |
| 同一个电话被建两次顾客 | 建顾客前先按电话搜一次，命中就提示"已有同名/同号顾客，直接用"；不自动合并 |
| 建狗信息是电话口述的，饭量可能不准 | 表单标注"口述录入"，并在确认页说明饭量按此体重计算；后台可随时改档案 |
| 旧页面下线导致书签失效 | 旧路径保留一个跳转页，跳到新流程第一步 |
| 旧页面被现有回归脚本断言（`miniapp/src/pages/staff-customer-service.regression.spec.ts` 有 12 条 `expect` 指向 `assisted-order.vue`） | 下线时同一条提交里改这个 spec：删掉针对旧页面的断言，改成断言"旧路径跳新流程" |

---

## 9. 测试

**基线（2026-11-08 22:22 在干净 `origin/main` 上实测）**：`staff-order-center.regression.spec.ts` 里
「★ 员工端不展示退款金额」这一条**本来就是红的**（`supplementDetail` 那边已经不再有该字样），与本需求无关，
实施时不背这个锅，也不顺手改。

### 后端
- `recipe-options?scope=all` 能返回**别人家**的 `PRIVATE_CUSTOM`，`scope=own` 不返回。
- `scope=all` 不返回系列未发布的食谱、不返回已删除的。
- `portion-preview` 对体重缺失的狗返回 4xx 而不是 0。
- `pricing-preview` **不新增** `pricing_snapshot` 记录。
- `orders/assisted`：金额不一致且没填 `amountAdjustReason` → 400；填了 → 成功且日志里有该原因。
- 回归：现有 `scope` 缺省行为不变（客服工作台旧调用不炸）。
- `customers/search` 传一个只存在于 `guestContactPhone` 的号码，能搜到该无账号顾客，且 `isGuest=true`。
- `customers/:customerId/addresses` 建出来的地址，`userId` 是顾客而不是操作人。
- 无账号顾客建单：`orders/assisted` 用 `isGuest` 顾客 + 新建的狗 + 新建的地址，能正常建单并置为已收款。
- **员工令牌调 `orders/assisted` → 403**；管理员令牌 → 成功（J19）。

（落点：`backend/tests/interfaces/controllers/staff-assisted-order.controller.spec.ts`、`backend/tests/application/order/order-assisted-*.spec.ts`，与现有 `order-staff-*.spec.ts` 同一目录习惯。）

### 小程序
- 回归脚本：`miniapp/src/pages/staff-assisted-order.regression.spec.ts`（沿用仓库现有"读源码断言"的写法）
  - 订单中心有「代客下单」入口
  - 食谱页四档筛选的取值与分页参数
  - 选「其他定制」时出现提示
  - `amountAdjustReason` 为空的提交被前端拦住
  - 「新建无账号顾客 / 新建狗狗 / 新增地址」三个入口只对管理员渲染
  - 员工身份登录时，订单中心不渲染「＋ 代客下单」，客户与狗狗页也不渲染「代客下单」
  - 无账号顾客的卡片有「无账号」标

---

## 10. 上线顺序

1. 后端先上（接口向后兼容，旧页面仍可用）。
2. 小程序跟上，上传体验版给老板验。
3. 验收通过后再下线旧页面（本次一并下线，因为只有一处入口）。

---

## 11. 留给实施阶段决定

1. 分装默认值到底给"1 袋 = 1 顿"还是"100g/袋"——以顾客端 `usePackagePlan` 的实际默认值为准。
2. 适配提示的文案模板（现在只有示例，最终以营养/合规口径为准）。
3. 食谱列表是否需要显示价格（¥/100g）——老板没提，默认不显示。

---

## 12. 无账号顾客（已定：本期**必须支持**）

2026-11-08 22:46 老板决定：**这期必须要接无账号顾客**。同一天 22:33 的另一句"只有我自己用"依然成立 ——
所以做法是「**只有管理员能建档**，但整条流程必须走得通」。

### 12.1 为什么这件事不小

无账号顾客（`User.isGuest = true`）在小程序里是三处空白：

| 空白 | 现状 | 本期补法 |
|---|---|---|
| 搜不到 | 顾客搜索只查 `phone` / `nickname` / 狗名 / 订单号；无账号顾客的 `phone` **恒为 null**，电话只在 `guestContactPhone` | 搜索加两条 OR（§6.2） |
| 建不了 | 建顾客 / 建狗接口存在，但只在后台用，小程序里没有入口 | 新增两个录入页，复用现有 `GuestCustomerService`（§6.3） |
| 没有地址 | 无账号顾客不可能自己在小程序里加地址；员工端只有 `PUT /orders/:id/address`（下单**之后**才能改） | 新增「给指定顾客建地址」接口（§6.4）+ 页面 |

### 12.2 权限边界

| 动作 | 谁能做 |
|---|---|
| 进「代客下单」、给已有顾客下单 | **只有 ADMIN**（J19） |
| 新建无账号顾客、新建狗狗、新建地址 | **只有 ADMIN**（沿用现有 `AdminGuard`；前端按角色隐藏按钮） |
| 搜顾客、看狗狗、看订单中心 | STAFF / ADMIN（不变） |

想放开给员工，只改前端按钮显隐 + 后端四个 `AdminGuard`（含 `orders/assisted`），不涉及表结构。

### 12.3 一条必须说清的产品事实

无账号顾客**没有 openid**，所以：发货通知、物流查询、售后提醒、订单详情这些"顾客自己看"的东西，对他们全部不成立。
这单的履约靠**人工告知**（微信/电话）。确认页和建单成功页都要写这句话，不能让人误以为系统会通知到顾客。

后续如果这类顾客变多，再考虑「让顾客扫码认领这单」的绑定流程 —— 本期不做。
