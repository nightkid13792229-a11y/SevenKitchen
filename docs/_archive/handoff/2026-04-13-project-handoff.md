# SevenKitchen 续开发交接说明（截至 2026-04-13）

## 当前仓库状态

- 仓库目录：`/Users/zhaochen/Documents/SevenKitchen`
- 远端仓库：`git@github.com:nightkid13792229-a11y/SevenKitchen.git`
- 当前分支：`codex/ingredient-sku-decoupling`
- 最近提交：`9335134fc774f611bf3a6e4f555f7d313d3fe7f7`
- 最近提交说明：`feat: refactor ingredient sku domain and nutrition entry`
- 当前工作区存在未提交改动，主题为“标准原料营养录入改版”

## 先读哪些文档

- `README.md`：项目总入口。
- `CLAUDE.md`：团队在这个仓库里约定的协作规则。
- `docs/DATABASE_NAMING_CONVENTIONS.md`：数据库命名规则，必须先看。
- `docs/07_Core_Architecture.md`：核心架构和业务域划分。
- `docs/05_API_Specs.md`：前后端 API 契约。
- `backend/docs/DEPLOYMENT_TENCENT_LIGHTHOUSE.md`：服务器部署方法。
- `docs/handoff/2026-04-13-project-change-log.md`：从项目初期到现在的改动总览。
- `docs/superpowers/specs/2026-04-11-standard-ingredient-sku-domain-design.md`：最近这轮原料域重构设计。
- `docs/superpowers/specs/2026-04-12-standard-ingredient-nutrition-entry-design.md`：最近这轮营养录入设计。

## 当前项目结构

### 根目录层

- `backend/`：NestJS 后端。
- `admin-web/`：Vue 3 管理后台。
- `miniapp/`：微信小程序。
- `docs/`：业务、部署、验收、设计和交接文档。
- `scripts/`：仓库级辅助脚本。

### 规模概览

- `backend/src`：273 个文件。
- `backend/prisma`：84 个文件。
- `admin-web/src`：82 个文件。
- `miniapp/src`：388 个文件。
- `docs/`：83 个文件。
- 当前完整仓库体积约 `1.7G`，其中大量空间来自 `node_modules`、`dist` 和日志。

### 后端重点目录

- `backend/src/application/`：业务应用层，包含订单、狗狗、原料、采购、生产、发货、财务等模块。
- `backend/src/domain/`：领域模型与类型定义。
- `backend/src/interfaces/`：控制器、DTO、鉴权入口。
- `backend/prisma/`：Schema、迁移和数据回填脚本。
- `backend/scripts/`：校验、验收和部署辅助脚本。

### 管理后台重点目录

- `admin-web/src/api/`：后台接口封装。
- `admin-web/src/views/`：按业务模块划分的页面。
- `admin-web/src/types/`：前端类型定义。
- `admin-web/src/utils/`：通用工具。
- `admin-web/src/views/Ingredients/`：当前这一轮原料域和营养录入改动的集中区域。

### 小程序重点目录

- `miniapp/src/pages/`：用户端和员工端页面。
- `miniapp/src/api/`：接口封装。
- `miniapp/src/components/`：复用组件。
- `miniapp/src/utils/`：通用工具、SDK 与打印相关能力。
- `miniapp/scripts/`：预览、构建和编译辅助脚本。

## 另一台电脑继续开发，建议怎么接手

### 1. 先准备运行环境

- Node.js：当前机器为 `v22.19.0`。
- npm：当前机器为 `10.9.3`。
- pnpm：当前机器为 `10.25.0`。
- 数据库：PostgreSQL。

### 2. 建议的安装方式

- `backend/`：优先使用 `pnpm install`。
- `miniapp/`：优先使用 `pnpm install`。
- `admin-web/`：可以使用 `npm install` 或 `pnpm install`，但建议整台机器固定一种方式，不要来回混用。

### 3. 建议的启动顺序

1. 后端：
   - `cd backend`
   - `pnpm install`
   - `npx prisma generate`
   - `npm run start:check`
   - `npm run start:dev`
2. 管理后台：
   - `cd admin-web`
   - `npm install`
   - `npm run dev`
3. 小程序：
   - `cd miniapp`
   - `pnpm install`
   - `npm run preview`

### 4. 小程序的关键约定

- 默认本地 API 地址是 `http://127.0.0.1:3000/api/v1`。
- 微信开发者工具不要直接打开 `miniapp/` 源码目录。
- 应打开编译产物目录：
  - 开发预览：`miniapp/dist/dev/mp-weixin`
  - 生产构建：`miniapp/dist/build/mp-weixin`

## 这次交接包里，哪些内容被刻意排除了

- `node_modules/`
- `dist/`
- 各类本地日志文件
- `.DS_Store`
- `.claude/`
- `.cursor/`
- `.superpowers/`
- `.worktrees/`

这些内容不属于真正需要迁移的源码。另一台电脑拿到交接包后重新安装依赖、重新构建即可。

## 继续开发时最需要注意的事

### 1. 数据库只能走 Prisma migration

- 不要直接改数据库结构。
- 任何表结构变化都要通过 `backend/prisma` 下的 migration 完成。

### 2. 生产库和本地代码在原料域上并不完全同步

- `docs/reports/2026-04-12-production-ingredient-readonly-audit.md` 已确认：生产库当前仍停留在旧版原料结构。
- 本地代码已经推进到标准原料 / DIY SKU / 采购 SKU 解耦，以及营养档案结构化重构。
- 如果要在生产上真正开始按新模型治理原料，应该先部署当前分支相关 migration 与后台版本。

### 3. 当前工作区里有未提交改动

- 当前未提交改动主要集中在 `admin-web/src/views/Ingredients/` 和营养单位换算相关文件。
- 如果另一台电脑要继续这部分工作，优先从交接包里的源码快照接手，而不是只看 `HEAD` 提交。

### 4. 这个仓库里同时存在 `package-lock.json` 和 `pnpm-lock.yaml`

- 这是历史迭代过程中留下来的状态。
- 继续开发时，建议在每个子项目内尽量固定一种安装方式，避免本地环境反复切换。

## 本次我整理出的交接附件

- `2026-04-13-project-change-log.md`
- `2026-04-13-commit-timeline.tsv`
- `2026-04-13-project-file-manifest.txt`
- `2026-04-13-project-tree.txt`
- `2026-04-13-project-handoff.md`
- `SevenKitchen-source-snapshot-2026-04-13.tar.gz`
