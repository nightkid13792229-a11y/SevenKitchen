# 技术栈与工程约定

> 状态：2026-11-03 重整。版本以各目录 `package.json` 为准；本文只做总览。
> 旧版详细技术栈文档已归档到 `docs/_archive/legacy/00_Tech_Stack_Standards.pre-2026-11-03.md`。

---

## 1. 技术栈

### 后端

| 项 | 当前 |
|---|---|
| 框架 | NestJS 11 |
| 语言 | TypeScript 5.7 |
| ORM | Prisma 6.1 |
| 数据库 | PostgreSQL |
| 测试 | Jest 30 |
| 部署 | 本地构建 → SSH/rsync → 生产 systemd |

### 管理后台

| 项 | 当前 |
|---|---|
| 框架 | Vue 3.5 |
| 构建 | Vite 7 |
| UI | Element Plus 2.13 |
| 状态 | Pinia 3 |
| 路由 | Vue Router 4.6 |
| 测试 | Vitest 4 |
| 语言 | TypeScript 5.9 |

### 小程序

| 项 | 当前 |
|---|---|
| 框架 | uni-app 3（Vue 3） |
| 构建 | Vite 5 |
| 测试 | Vitest 3 |
| 语言 | TypeScript 5 |
| 平台 | 微信小程序（顾客端 + 员工端同一工程） |

### 外部服务

- 微信支付 / 订阅消息
- 腾讯云 COS / CDN（图片）
- 精臣 JCING 标签打印机
- AI 供应商（原料、食谱、封面等，配置在后台）

---

## 2. 仓库结构

```text
backend/       NestJS API + Prisma schema + 迁移 + 测试
admin-web/     Vue 3 管理后台
miniapp/       uni-app 小程序（顾客端 + 员工端）
docs/          文档（活文档在顶层，历史资料在 _archive/）
scripts/       运维/协作脚本
.agents/       DSH 技能与技能索引
AGENTS.md      项目规则真源
```

---

## 3. 常用命令

### 后端

```bash
cd backend
npm run start:check:miniapp   # 检查本地后端是否已可用
npm run start:dev:miniapp     # 本地联调后端（默认 3011）
npx tsc --noEmit              # 只做类型检查，不产出、不删 dist
npm test                      # Jest
npx prisma validate           # 校验 schema
npx prisma studio             # 查看真实表结构
```

> ⚠️ 联调期间不要跑 `npm run build`：`nest-cli.json` 里 `deleteOutDir: true` 会删 `dist/`，
> 正在跑的 `start:dev` 会直接死掉。

### 管理后台

```bash
cd admin-web
npm run dev
npm run build          # 类型检查 + 构建
npm run build:prod     # 生产构建（部署脚本用这个）
npm run test           # Vitest
```

### 小程序

```bash
cd miniapp
npm run preview            # 联调预览 → dist/dev/mp-weixin
npm run build:mp-weixin    # 发布构建 → dist/build/mp-weixin
npm run test               # Vitest
```

---

## 4. 工程约定

1. **模块边界**：`backend/`、`admin-web/`、`miniapp/` 三选一；跨模块改动先拆任务。
2. **数据库**：只走 Prisma migration；禁止直连改结构；字段以 `schema.prisma` 为准。
3. **接口**：以 controller + DTO + Swagger 为准；不手抄接口清单。
4. **测试**：改动前先跑基线；改完跑目标模块测试；不要用“应该能过”代替真实输出。
5. **文档**：只写代码里看不出来的约束/取舍；字段、接口、页面清单尽量生成或链接。
6. **多会话**：一个任务一个工位；合并/部署走门禁，见 [多会话协作](MULTI_SESSION_WORKFLOW.md)。

---

## 5. 质量门

| 改动 | 最低验证 |
|---|---|
| 后端 | `npx tsc --noEmit` + 目标模块 Jest |
| 管理后台 | `npm run build`（自检）；部署脚本用 `npm run build:prod` |
| 小程序 | `npm run preview` 或 `npm run build:mp-weixin` |
| 数据库 | `npx prisma validate` + migration |
| 部署 | 合并 main、跑部署脚本、回读健康检查 |

---

## 6. 相关文档

- [项目概览](01_Project_Overview.md)
- [核心架构](07_Core_Architecture.md)
- [API 文档](05_API_Specs.md)
- [数据库命名规范](DATABASE_NAMING_CONVENTIONS.md)
- [部署与 SSH](ops/deploy-and-ssh.md)
