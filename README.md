# SevenKitchen

狗狗鲜食 SaaS & ERP：顾客小程序 + 员工小程序 + 管理后台 + 一套 NestJS 后端。

覆盖「狗狗档案 → 食谱/营养 → 下单/支付 → 采购/生产/库存 → 发货 → 售后」的完整链路。

---

## 快速开始

### 后端

```bash
cd backend
npm install
npm run start:check:miniapp   # 先看本地后端是否已可用
npm run start:dev:miniapp     # 本地联调（默认 3011）
```

### 管理后台

```bash
cd admin-web
npm install
npm run dev
```

### 小程序

```bash
cd miniapp
npm install
npm run preview            # 联调预览 → dist/dev/mp-weixin
npm run build:mp-weixin    # 发布构建 → dist/build/mp-weixin
```

---

## 先读什么

| 想知道 | 看 |
|---|---|
| 项目规则/角色/部署授权 | [AGENTS.md](AGENTS.md) |
| 文档总索引（活文档/历史） | [docs/README.md](docs/README.md) |
| 系统架构/模块地图 | [docs/07_Core_Architecture.md](docs/07_Core_Architecture.md) |
| API 约定/Swagger | [docs/05_API_Specs.md](docs/05_API_Specs.md) |
| 字段命名/怎么查表 | [docs/DATABASE_NAMING_CONVENTIONS.md](docs/DATABASE_NAMING_CONVENTIONS.md) |
| 部署/SSH | [docs/ops/deploy-and-ssh.md](docs/ops/deploy-and-ssh.md) |
| 多会话协作 | [docs/MULTI_SESSION_WORKFLOW.md](docs/MULTI_SESSION_WORKFLOW.md) |

---

## 仓库结构

```text
backend/      NestJS API + Prisma schema/migrations + Jest
admin-web/    Vue 3 + Element Plus 管理后台
miniapp/      uni-app 小程序（顾客端 + 员工端）
docs/         活文档；历史资料在 docs/_archive/
scripts/      协作/运维脚本
.agents/      DSH 技能
AGENTS.md     项目规则真源
```

---

## 三条硬规则

1. **字段不猜**：以 `backend/prisma/schema.prisma` 为准；写 SQL 前先查。
2. **一个任务一个工位**：不在主工作区直接改/提交；合并走 `scripts/session.sh merge`。
3. **部署先合并 main**：后端/后台按 `AGENTS.md` 授权部署；小程序只上传体验版，不发布正式版。

---

## 测试

```bash
cd backend && npm test
cd admin-web && npm run test
cd miniapp && npm run test
```

> 联调期间不要跑后端 `npm run build`（会删 `dist/`，把 `start:dev` 弄死）；自检用 `npx tsc --noEmit`。
