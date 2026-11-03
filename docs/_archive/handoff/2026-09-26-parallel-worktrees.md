# 并行开发：worktree 分工与环境对照（2026-09-26）

> 背景：试吃装（现货）与食谱定制两个功能在同一个工作目录里并行开发过一段时间，
> 期间差点出现「一个会话 `git add -A` 把另一个会话的未提交改动卷进自己提交」的事故。
> 本文记录拆分后的分工与环境差异，避免两边互相踩。

---

## 一、当前分工

| 工作目录 | 分支 | 负责的功能 | 后端端口 |
|---|---|---|---|
| `/Users/zhaochen/Documents/SevenKitchen` | `feature/dog-profile-guidance` | **试吃装（现货）** | **3011** |
| `.worktrees/custom-recipe-paid-flow` | `codex/custom-recipe-paid-flow` | **食谱定制** | **3012** |

两个分支目前都包含**两边已有的全部提交**（线性历史：定制 → 试吃装），
所以共享文件里不会重复出现同一处改动。

### 已提交的历史

```
7c8cf88e  docs(custom-recipe): 记录阶段三完成情况与实测结论
4f765b4d  feat(custom-recipe): 定制费抵扣成品货款（货款端直接减，余额可结转）   ← 食谱定制
8ed8dbe8  feat(tasting-pack): 小程序与后台接入试吃装，含定价成本基数可配
6bf90d13  feat(tasting-pack): 试吃装（现货）后端全链路 —— 定价 / 成品库存 / 现货下单 / 备货生产
a6f2742d  fix(admin-web): 补齐售后「重做制作日期」字段定义，恢复后台构建
b92ed2a0  feat(custom-recipe): 首页食谱定制入口、付费下单闭环与后台定制设置   ← 食谱定制
```

> 本文件写作时两个 worktree 已同步到同一提交（`7c8cf88e`），工作区都干净。

### 接下来怎么用

1. 把**食谱定制**那个会话的工作目录切到 `.worktrees/custom-recipe-paid-flow`
2. 主目录留给**试吃装**
3. 哪天主目录又有新提交、需要让 worktree 跟上时：

   ```bash
   cd .worktrees/custom-recipe-paid-flow
   git merge --ff-only feature/dog-profile-guidance
   ```

   （两边是线性关系，正常情况下都能快进。若提示无法快进，说明两边都提交了，
   这时先别硬合，先把情况说清楚再决定。）

---

## 二、环境对照（新建 worktree 必须自己准备，这几个文件都没进 git）

| 项 | 主目录（试吃装） | 新 worktree（食谱定制） |
|---|---|---|
| 后端端口 | 3011 | **3012**（已写进它的 `.env.development`） |
| 数据库 | `sevenkitchen` | `sevenkitchen`（**共用**，见第三节说明） |
| `backend/.env` | 未跟踪 | 已从主目录复制 |
| `backend/.env.development` | 未跟踪 | 已从主目录复制并改端口 |
| `admin-web/.env.development` | 未跟踪 | 已从主目录复制 |
| `node_modules` | 原装 | 已用 APFS 写时复制克隆（`cp -c`，秒级、不额外占盘） |

### ⚠️ 一个容易踩的坑：两个 env 文件都要改

- **Prisma CLI**（`migrate` / `generate`）通过 `prisma.config.ts` 里的 `import "dotenv/config"` 读 **`backend/.env`**
- **后端运行时**（`main.ts` 的环境加载）读 **`backend/.env.development`**

**只改一个，迁移就会打到另一个库上。** 项目自带的 `npm run env:dev`（`cp .env.development .env`）
就是为了让两者一致，改库名时记得两个文件一起改。

---

## 三、为什么两个 worktree 共用同一个数据库

本来想给新 worktree 建一个独立库做隔离，**实测发现做不到**：

> 迁移链**无法在空库上重放**。历史迁移 `20260109000000_phase9_order_status_optimization`
> 在同一个事务里既 `ALTER TYPE "OrderStatus" ADD VALUE 'PURCHASING'`，
> 又立刻 `UPDATE ... SET status = 'PURCHASING'` 使用这个新值。
> PostgreSQL 规定**新枚举值必须先提交才能被使用**，因此该迁移在新库上必定失败：
>
> ```
> ERROR: unsafe use of new value "PURCHASING" of enum type "OrderStatus"
> HINT:  New enum values must be committed before they can be used.
> ```
>
> （`prisma migrate deploy` 会把整个迁移包在一个事务里，所以同一迁移内无法绕开。）

**结论**：新建开发环境不能靠「跑迁移」建库。**已提供初始化脚本绕过**：

```bash
cd backend
DATABASE_URL="postgresql://…/新库名" \
  npx ts-node -r tsconfig-paths/register scripts/bootstrap-fresh-database.ts --yes
npx prisma generate
```

脚本做三件事：`prisma db push` 按 schema 建表 → 把 149 个迁移标记为已应用 →
校验表数量与 `migrate status`。**只对全新空库生效**（库里已有表会直接拒绝，
防止误操作把有数据的库推平）。

已实测：空库 → 102 张表、149 个迁移全部标记成功、`migrate status` 显示 up to date。

要根治仍需在**新迁移**里处理（直接改老迁移会破坏校验和，让已有环境的 `migrate deploy` 报错）。

因此两边**共用 `sevenkitchen` 库**，代价是需要遵守下面这条纪律。

### 共用库的纪律

> **谁改了 `schema.prisma`，谁先 `npx prisma migrate deploy` 并 `npx prisma generate`；
> 另一边拉代码后也要补跑一次 `npx prisma generate`。**

否则另一边的 Prisma Client 会跟库对不上，报「列不存在」之类的错。

---

## 四、两边的日常命令对照

| 目的 | 主目录（3011） | 新 worktree（3012） |
|---|---|---|
| 起后端 | `cd backend && npm run start:dev:miniapp` | 同（`.env.development` 里已是 3012） |
| 后端测试 | `npx jest` | 同 |
| 后台开发 | `cd admin-web && npm run dev` | 同（Vite 默认 5173，两边同时开需换端口） |
| 后台构建 | `cd admin-web && npm run build` | 同 |
| 小程序联调 | `cd miniapp && npm run preview` | 同 |
| 小程序发布 | `cd miniapp && npm run build:mp-weixin` | 同 |

### 小程序 API 地址要指向各自的端口

小程序的地址优先级是：生产构建 → 生产域名；真机 → 局域网 IP；**开发者工具 → 本地存储里的值，否则默认值**。

两个 worktree 的**小程序 appid 相同**（`wx92924e25093f8f18`），
而微信开发者工具的本地存储是**按 appid 隔离**的 ——
所以两边同时开时，「网络设置」里改地址会互相影响。

**建议**：一次只开一边的微信开发者工具项目；或在网络设置里明确切到 3011 / 3012。

---

## 五、主目录与 worktree 的文件不要互相手改

`.worktrees/` 下的目录是**独立的检出**：
在主目录里改代码不会影响 worktree，反之亦然。切换工作时请确认自己在哪个目录，
`pwd` 与 `git branch --show-current` 是最快的确认方式。
