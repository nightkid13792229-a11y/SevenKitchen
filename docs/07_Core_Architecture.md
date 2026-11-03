# 核心架构

> 状态：2026-11-03 重整。本文是**架构地图**，不是字段/接口清单。
> 字段以 `backend/prisma/schema.prisma` 为准；接口以 Swagger 为准；算法细节以 `backend/src/domain` 为准。
> 旧版 1,347 行的详细架构文档已归档到 `docs/_archive/legacy/07_Core_Architecture.pre-2026-11-03.md`。

---

## 1. 系统形状

```text
顾客微信小程序 ─┐
员工微信小程序 ─┼─> NestJS 后端 (/api/v1) ─> PostgreSQL (Prisma)
管理后台 (Vue) ─┘         │
                          ├─ 微信支付 / 订阅消息
                          ├─ 腾讯云 COS / CDN
                          ├─ 标签打印机 (JCING)
                          └─ AI 供应商（原料/食谱/封面）
```

三个客户端：

- `miniapp/`：一个 uni-app 工程，同时承载顾客端和员工端页面。
- `admin-web/`：Vue 3 + Element Plus 管理后台。
- `backend/`：唯一后端，所有业务写操作都从这里进。

---

## 2. 后端分层

| 层 | 目录 | 职责 |
|---|---|---|
| 接口层 | `backend/src/interfaces` | controller、DTO、guard、异常过滤器；只做参数校验和编排 |
| 应用层 | `backend/src/application` | 用例编排、跨领域服务、调度器 |
| 领域层 | `backend/src/domain` | 实体、值对象、领域服务、状态机、不变量 |
| 基础设施 | `backend/src/infrastructure` | Prisma repository、外部服务适配 |
| 独立模块 | `backend/src/label` | 标签数据/打印相关 |
| 支撑 | `backend/src/support`、`utils`、`types` | 工具与共享类型 |

**硬边界：**

- controller 不直接写多张表；状态变更走 application/domain service。
- 领域层不依赖 NestJS/HTTP/Prisma 的具体实现。
- 数据库结构变更只走 Prisma migration。

---

## 3. 业务域地图

| 域 | 主要代码 | 说明 |
|---|---|---|
| 狗狗档案 / 健康 | `domain/dog`、`domain/health`、`interfaces/controllers/dogs*`、`health-*`、`vaccine-*`、`allergy-*` | 档案、体重、体况、疫苗、过敏、健康记录、分享 |
| 食谱 / 营养 | `domain/recipe`、`application/recipe*`、`recipe-designer`、`nutrition-*` | 食谱、设计器、营养计算、营养治理、标准 |
| 订单 / 支付 / 售后 | `domain/order`、`application/order*`、`payments`、`aftersale*` | 下单、支付、订单中心、售后 |
| 生产 | `domain/production`、`application/production*`、`staff-production` | 排产、生产批次、厨房任务、照片 |
| 采购 / 库存 | `domain/purchasing`、`domain/inventory`、`staff-purchasing`、`admin-purchasing` | 采购单、收货、库存流水、SKU |
| 物流 / 地址 | `domain/shipping`、`shipping*`、`addresses` | 地址、运费、发货、物流模板 |
| 补剂 | `application/supplement-shop`、`interfaces/controllers/supplement-*`、`admin-supplement-*` | 补剂商品、订单、售后、等价组 |
| 定制食谱 | `application/custom-recipe`、`interfaces/controllers/custom-recipe` | 定制需求、报价、订单、交付、退款 |
| 知识库 | `knowledge-source`、`docs/knowledge-base` | 原文层、来源登记、证据政策、引用锚点 |
| 财务 | `application/finance`、`admin-finance` | 报销、账单、财务报表、预警 |
| 客服 / 消息 | `customer-service`、`customer-message` | 客服会话、站内消息、订阅消息 |
| 分析 | `analytics`、`admin/analytics` | 漏斗、档案分析、经营看板 |
| 配置 / 平台 | `global-config`、`platform-config`、`platform-options` | 全局配置、平台选项、搜索治理 |

> 上表是“找代码的入口”，不是完整 controller 列表；接口前缀见 [API 文档](05_API_Specs.md)。

---

## 4. 关键数据流

### 4.1 狗狗营养计算

`Dog 档案 + 体重/体况/生命阶段 + 活动量 + 营养标准`
→ `DogCalcService`
→ 能量/营养结果
→ 页面展示或写入食谱。

关键点：标准/版本/换算口径不能散落在前端；以 domain service 为准。

### 4.2 食谱 → 快照 → 订单

`Recipe（可编辑）`
→ 发布/下单时生成 `RecipeSnapshot`（不可变）
→ 订单项引用快照
→ 生产/采购按快照展开。

关键点：订单不能在下单后“跟着食谱改”；快照是不可变契约。

### 4.3 订单 → 生产 → 库存 → 发货

`Order / OrderItem`
→ 排产/生产批次
→ 采购与库存流水
→ 打包/发货
→ 售后。

关键点：状态机在 domain 层；库存用流水，不直接改“剩余数量”一个字段。

### 4.4 补剂 / 定制食谱

补剂和定制食谱是独立子域，有自己的订单、定价、交付/售后流程；
不要把它们硬塞进普通鲜食订单的状态机。

### 4.5 知识库

原文/来源 → 结构化条目 → 证据政策 → 引用锚点；
AI 只能用知识库里的内容，不凭模型记忆补营养/医学结论。

---

## 5. 横切关注点

| 关注点 | 位置 | 约束 |
|---|---|---|
| 认证 / 角色 | `interfaces/controllers/auth`、guard | CUSTOMER / STAFF / ADMIN 三端隔离 |
| 统一响应 | `ApiResponseDto`、`AllExceptionsFilter` | `{code,message,data}`，0=成功 |
| 配置 | `global-config`、`platform-config`、`platform-options` | 业务开关/价格/文案尽量不要硬编码 |
| 定时任务 | `application/scheduler` | 订单、补剂、财务等定时任务要幂等 |
| 文件/图片 | COS/CDN、`sensitive-media` | 上传走统一媒体接口；不要把密钥写进代码 |
| 打印 | `label`、JCING SDK | 打印模板/数据与业务解耦 |
| AI | `ingredient-creation`、`recipe-agent`、`ai-cover` | 供应商/模型配置走后台；输出必须可审计 |

---

## 6. 前端结构

- `miniapp/src/pages.json`：顾客端 + 员工端页面清单（页面路径即路由）。
- `admin-web/src/views`：后台页面；`admin-web/src/router/index.ts`：路由。
- 页面只调用 `/api/v1`；不要在页面里直连数据库或写业务规则。
- 页面/功能地图见 [功能与页面蓝图](03_Features_and_UI_Blueprints.md)。

---

## 7. 部署与运行

- 后端：腾讯云 Lighthouse + systemd + rsync/SSH；详见 [生产部署与 SSH](ops/deploy-and-ssh.md)。
- 后台：静态构建后 rsync 到服务器；同样见运维手册。
- 小程序：构建后上传体验版，不直接发布正式版（见 `AGENTS.md`）。

---

## 8. 阅读顺序

1. 本文：知道系统分几层、每个域在哪。
2. [API 文档](05_API_Specs.md)：知道接口在哪、怎么看 Swagger。
3. [领域模型与算法](04_Domain_Model_and_Algorithms.md)：知道状态机/不变量/算法在哪。
4. [数据库命名规范](DATABASE_NAMING_CONVENTIONS.md)：写 SQL/改字段前必读。
5. 具体代码：以 controller/service/domain 为准。
