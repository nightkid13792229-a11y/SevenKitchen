# API 契约与接口索引

> 状态：2026-11-03 重整。
> 本文只保留**跨接口约定**和**模块索引**；逐接口的请求/响应、字段、示例以 **Swagger** 为准。
> 旧版详细接口清单已归档到 `docs/_archive/legacy/05_API_Specs.pre-2026-11-03.md`，只作历史参考。

---

## 1. 接口文档在哪里

### 本地

```bash
cd backend
npm run start:dev:miniapp     # 默认 http://127.0.0.1:3011
```

- Swagger UI：`http://127.0.0.1:3011/api/docs`
- OpenAPI JSON：`http://127.0.0.1:3011/api/docs-json`

### 生产

生产是否开放 Swagger，以部署配置为准；不要假设线上一定可访问。
需要离线查看时，可以从本地 Swagger 导出：

```bash
curl -s http://127.0.0.1:3011/api/docs-json > /tmp/sevenkitchen-openapi.json
```

> **接口的唯一真源是 controller + DTO + Swagger 注解，不是本文。**
> 本文只负责“全局约定 + 去哪个前缀找哪类接口”。

---

## 2. 全局约定

### 2.1 Base URL 与版本

- Base path：`/api/v1`
- 所有对外接口必须带版本号，禁止无版本路径。
- 新增破坏性变更时，优先加新路径/新字段；不要直接改旧字段含义。

### 2.2 认证与身份

- 客户端类型：`CUSTOMER`（顾客端）、`STAFF`（员工端）、`ADMIN`（后台）。
- Swagger 里配置了 `JWT` 和 `X-Customer-Id` 两种鉴权入口；
  具体某个 controller 用哪个 guard，以代码为准。
- 需要登录的接口必须携带身份上下文；不要在 query/body 里自报 `userId` 代替鉴权。

### 2.3 统一响应结构

所有接口返回：

```json
{
  "code": 0,
  "message": "Success",
  "data": {}
}
```

- `code = 0` 表示成功。
- 非 0 表示业务错误或系统错误；异常由 `AllExceptionsFilter` 统一包装。
- `data` 可以为 `null`。
- 分页、筛选、排序参数以具体接口的 DTO / Swagger 为准，不要凭旧文档猜。

### 2.4 查询 vs 命令

- **GET**：只读，不改变状态，不触发领域事件。
- **POST / PUT / PATCH / DELETE**：命令，改变状态；必须走 Domain Service / 状态机校验。
- 任何接口都不允许直接拼 SQL 改业务表；结构变更只走 Prisma migration。

---

## 3. 模块索引

> 这张表只解决“去哪个前缀找”，不替代 Swagger。新加 controller 时补一行即可。

| 域 | 主要前缀 | 说明 |
|---|---|---|
| 认证 / 用户 / 基础 | `/auth`、`/users`、`/addresses`、`/messages`、`/feedback`、`/media`、`/favorites` | 登录、用户、地址、消息、反馈、媒体、收藏 |
| 狗狗档案 / 健康 | `/dogs`、`/shared-health`、`/shared-photos`、`/allergen-vocabulary` | 档案、健康记录、疫苗、过敏、体重目标、时间线、分享 |
| 食谱 / 营养 | `/recipes`、`/recipe-designer`、`/custom-recipe`、`/custom-recipe-config`、`/nutrition-foods` | 食谱、食谱设计器、定制食谱、营养库 |
| 营养治理 / 标准 | `/admin/nutrition-governance`、`/admin/nutrition-standards`、`/admin/nutrition-calculation` | 营养治理、标准、计算 |
| 订单 / 支付 / 售后 | `/orders`、`/payments/wechat`、`/aftersales`、`/admin/orders`、`/admin/order-center` | 下单、支付、售后、订单中心 |
| 生产 / 采购 / 库存 / 物流 | `/staff/kitchen`、`/staff/production`、`/staff/purchasing`、`/staff/inventory`、`/staff/shipping`、`/shipping`、`/admin/purchasing`、`/admin/procurement-skus`、`/admin/shipping-templates` | 厨房、生产、采购、库存、发货 |
| 补剂 | `/supplements`、`/supplement-orders`、`/supplement-aftersales`、`/admin/supplement-shop`、`/admin/supplement-equivalence` | 补剂商品、订单、售后、等价组 |
| 原料 / 知识库 | `/knowledge-source`、`/admin/ingredient-creation`、`/admin/ingredient-suggestions`、`/admin/ingredients` | 知识来源、原料创建/建议、批量替换 |
| 员工工作台 / 客服 | `/staff/workbench`、`/staff/customer-service`、`/customer-service`、`/admin/customer-service` | 员工工作台、客服会话 |
| 运营 / 分析 / 配置 | `/admin`、`/admin/global-config`、`/global-config`、`/admin/platform-config`、`/platform-config`、`/admin/options`、`/admin/search-governance`、`/admin/finance`、`/analytics/*`、`/admin/analytics/*` | 后台配置、搜索治理、财务、分析 |
| 其他 | `/labels`、`/recommended-products`、`/admin/ai-covers`、`/admin/tasting-pack`、`/tasting-packs`、`/admin/recipe-taxonomy`、`/admin/recipe-series` | 标签、推荐商品、AI 封面、试吃装、食谱分类/系列 |

---

## 4. 新增 / 修改接口的流程

1. **DTO 先写清楚**：用 `@ApiProperty` / `@ApiPropertyOptional` 标注字段、类型、是否必填、示例。
2. **Controller 补 Swagger 注解**：`@ApiTags`、`@ApiOperation`、`@ApiResponse`；废弃接口标 `deprecated: true`。
3. **鉴权与角色**：明确是 CUSTOMER / STAFF / ADMIN 哪一端，加对应 guard。
4. **状态变更走 Domain Service**：不要在 controller 里直接操作 Prisma 改多张表。
5. **跑测试**：至少跑该模块的测试；后端全量 `npm test`。
6. **不要手改“接口清单”**：Swagger 会自动生成；本文只在新增**新前缀/新域**时补索引。

---

## 5. 已知的历史包袱

- 旧版 `05_API_Specs` 里的逐接口字段说明大量基于 2025-12 的设计，已经和当前 controller/DTO 不一致；已归档，不要作为实现依据。
- 采购、知识库、补剂、疫苗、过敏等板块是后来加的，旧文档没有系统收录；现在统一以 Swagger 为准。
- 个别 controller 前缀有多个（例如 custom-recipe 同时挂顾客端和后台），以 `@Controller` 实际值为准。

---

## 6. 相关文档

- [核心架构](07_Core_Architecture.md)：模块分层、跨模块边界。
- [领域模型与算法](04_Domain_Model_and_Algorithms.md)：状态机、不变量、算法。
- [数据库命名规范](DATABASE_NAMING_CONVENTIONS.md)：字段真源与验证方法。
- [项目规则](../AGENTS.md)：角色、模块边界、部署授权。
