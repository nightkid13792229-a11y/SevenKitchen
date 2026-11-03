# 功能与页面蓝图

> 状态：2026-11-03 重整。本文是**页面/功能地图**，不是字段级 UI 规格。
> 具体交互、组件、文案以代码为准；员工端 UI 规范见 [员工端UI规范](员工端UI规范.md)。
> 旧版 800+ 行字段级蓝图已归档到 `docs/_archive/legacy/03_Features_and_UI_Blueprints.pre-2026-11-03.md`。

---

## 1. 三个客户端

| 端 | 代码 | 用户 | 入口 |
|---|---|---|---|
| 顾客小程序 | `miniapp/` | 狗家长 | 微信小程序 |
| 员工小程序 | `miniapp/`（同一工程） | 厨房/采购/发货/客服 | 员工登录后 |
| 管理后台 | `admin-web/` | 管理员/老板 | 浏览器 |

> 顾客端和员工端共用一个 uni-app 工程，页面在 `miniapp/src/pages.json` 里注册；
> 路由路径就是页面路径。

---

## 2. 顾客端页面地图

| 功能组 | 主要页面 |
|---|---|
| 首页 / 发现 | `pages/home/index`、`pages/recipe-detail/index`、`pages/recipe-nutrition-report/index`、`pages/favorite-recipes/index` |
| 狗狗档案 / 健康 | `pages/dog-profile-list/index`、`pages/dog-profile-health/index`、`pages/weight-goal-plan/index`、`pages/shared-health/index`、`pages/shared-photos/index` |
| 食谱 / DIY | `pages/calculate-portion/index`、`pages/recipe-diy/index`、`pages/diy-sheet-list/index`、`pages/snapshot/index` |
| 订单 / 售后 | `pages/orders-list/index`、`pages/order-shipping-notice/index`、`pages/aftersale-apply/index` |
| 补剂 | `pages/supplement-order/index`、`pages/supplement-orders/index`、`pages/supplement-order-detail/index`、`pages/supplement-aftersale/index` |
| 定制食谱 | `pages/custom-recipe/index`、`confirm`、`order-detail`、`aftersale`、`refund`、`delivery` |
| 地址 / 消息 / 我的 | `pages/address-list/index`、`pages/address-edit/index`、`pages/messages/index`、`pages/customer-service-entry/index`、`pages/me/index` |
| 账号 / 设置 | `pages/login/index`、`pages/login/staff`、`pages/profile-setup/index`、`pages/phone-bind/index`、`pages/network-settings/index`、`pages/privacy/index`、`pages/terms/index`、`pages/feedback-list/index`、`pages/feedback-form/index`、`pages/common/webview` |

---

## 3. 员工端页面地图

| 功能 | 主要页面 |
|---|---|
| 订单中心 | `pages/staff-order-center/index`、`pages/staff-recipe-snapshot/index` |
| 工作台 | `pages/staff-workbench/index` |
| 厨房 / 生产 | 员工工作台内入口 + 后端 `/staff/kitchen`、`/staff/production` |
| 采购 / 库存 | 员工工作台内入口 + 后端 `/staff/purchasing`、`/staff/inventory` |
| 发货 | 员工工作台内入口 + 后端 `/staff/shipping` |
| 狗狗档案（员工视角） | `pages/staff-dog-profile/index` |
| 补剂汇总 | `pages/staff-supplement-summary/index` |
| 食谱设计器（员工） | `pages/recipe-designer/list`、`editor`、`publish`、`supplement-library` |

> 员工端的具体交互和视觉规范，以 [员工端UI规范](员工端UI规范.md) 和代码为准。

---

## 4. 管理后台页面地图

`admin-web/src/views` 下的主要模块：

| 功能组 | 页面/模块 |
|---|---|
| 经营看板 | `Dashboard.vue`、`Analytics` |
| 狗狗 / 品种 | `Dogs`、`Breeds`、`WeightGoalPlan` |
| 食谱 / 营养 | `Recipes`、`RecipeDesigner`、`NutritionGovernance`、`NutritionStandards`、`IngredientTags`、`Ingredients` |
| 订单 / 售后 | `Orders`、`OrderCenter`、`Aftersale`、`AftersaleCenter` |
| 生产 / 采购 / 库存 | `Production.vue`、`Purchasing`、`Inventory.vue` |
| 补剂 / 试吃装 | `SupplementShop`、`TastingPack` |
| 财务 | `Finance` |
| 客服 / 消息 | `CustomerServiceConfig.vue`、`CustomerServiceConversations.vue` |
| 配置 / 权限 | `GlobalConfig.vue`、`PaymentConfig.vue`、`PlatformOptions`、`Settings`、`AgentConfig` |
| 搜索 / 评价 | `SearchGovernance`、`Reviews` |
| 登录 | `Login.vue` |

路由以 `admin-web/src/router/index.ts` 为准。

---

## 5. 功能域索引

| 域 | 顾客端 | 员工端 | 后台 |
|---|---|---|---|
| 档案/健康 | 档案、体重目标、健康记录、疫苗、过敏、分享 | 狗狗档案、健康摘要 | 狗狗、品种、健康治理 |
| 食谱/营养 | 食谱橱窗、详情、DIY、营养报告、收藏 | 食谱快照、设计器 | 食谱管理、设计器、营养治理/标准 |
| 订单/支付/售后 | 下单、支付、订单列表/详情、售后 | 订单中心、厨房/生产/发货 | 订单中心、售后中心、财务 |
| 补剂 | 补剂商品、下单、订单、售后 | 补剂汇总 | 补剂商城、等价组 |
| 定制食谱 | 定制入口、确认、订单、售后、退款、交付 | 设计器/交付 | 定制食谱管理 |
| 采购/库存 | — | 采购、库存 | 采购、SKU、库存 |
| 知识库 | — | — | 知识来源、证据治理 |
| 配置/分析 | 消息、客服、设置 | 工作台 | 全局配置、平台选项、搜索治理、分析 |

---

## 6. UI / 交互规则

- 员工端统一遵守 [员工端UI规范](员工端UI规范.md)（一页纸）。
- 通知触达规则见 [通知矩阵](notification-matrix.md)。
- 页面不得直接写业务公式/价格/状态字符串；走 API 和配置。
- 新增页面要同时更新 `pages.json` 或后台路由，并接入对应 API；不要留“死页面”。

---

## 7. 改页面的顺序

1. 先确认属于哪个域、哪个端。
2. 查 API（Swagger / `05_API_Specs.md`）和领域规则（`04`）。
3. 改页面 + 组件；复用现有组件和设计规范。
4. 顾客端/员工端改动：至少跑一种验证流程（`npm run preview` 或 `npm run build:mp-weixin`）。
5. 后台改动：`npm run build` 通过。
6. 更新本文的页面地图（只在新增/删除页面时）。

---

## 8. 相关文档

- [核心架构](07_Core_Architecture.md)
- [API 文档](05_API_Specs.md)
- [员工端UI规范](员工端UI规范.md)
- [通知矩阵](notification-matrix.md)
