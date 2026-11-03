# 预分装补剂 × 定制食谱 · 并行开发与体验版工作流（2026-10-20）

> 目的：两个会话同时改 SevenKitchen 时，不互相覆盖、不产生“后上传的体验版把前一个模块吃掉”的问题。
>
> 当前事实：
> - 主工作区 `/Users/zhaochen/Documents/SevenKitchen`：`main`，代码干净；补剂文档已提交 `48dcfdb6`。
> - 补剂开发 worktree：`/Users/zhaochen/Documents/SevenKitchen-supplement-prepack`，分支 `feat/supplement-prepack-20261020`。
> - 定制食谱 worktree：`/Users/zhaochen/Documents/SevenKitchen-custom-recipe-optimize`，分支 `feature/custom-recipe-weight-ux-20261004`；当前干净、无未提交代码。

---

## 一、硬规则

1. **两个会话不共用同一个 worktree 写代码**。各自在自己的 worktree/分支开发。
2. **不让两个会话各自上传微信体验版**。微信小程序只有一个体验版；后上传会覆盖前一个。必须由**一个会话/一个人**做“合并 + 构建 + 上传”。
3. **后端/admin-web 不从 feature 分支直接部署**。先合并到 `main`、推到 `origin/main`，再从 `origin/main` 部署。
4. **共享文件一次只让一个会话改**；另一个会话通过合并/补丁处理，不并发编辑同一段。
5. **迁移只追加，不改别人的 migration**；合并后在 integration 上按时间顺序 `prisma migrate deploy`。
6. **每次体验版上传必须记录版本号 + 包含哪两个分支的哪些提交**。

---

## 二、分支/worktree

| 用途 | 路径 | 分支 |
|---|---|---|
| 集成/生产 | `/Users/zhaochen/Documents/SevenKitchen` | `main` |
| 补剂开发 | `/Users/zhaochen/Documents/SevenKitchen-supplement-prepack` | `feat/supplement-prepack-20261020` |
| 定制食谱开发 | `/Users/zhaochen/Documents/SevenKitchen-custom-recipe-optimize` | 定制会话自己的分支 |

### 合并节奏

- 补剂每完成一个阶段（P0/P1/…），提交并合并到 `main`。
- 定制食谱每完成一批，提交并合并到 `main`。
- **不要等所有阶段做完才合并**；越晚合并，`schema.prisma`/`pages.json`/router 冲突越大。
- 合并前各自先 `git fetch origin`，在自己的 worktree 里 merge `origin/main`，解决冲突后再合回。

### 合并顺序

1. 定制先合：`feature/custom...` → `main`。
2. 补剂后合：`feat/supplement...` → `main`。
3. 或反过来；**同一时间只允许一个人合 `main`**。
4. 合并后立刻跑：后端 `npx tsc --noEmit` + 相关测试；admin-web build；miniapp build。

---

## 三、共享文件清单（高危）

以下文件两边都可能改，合并时必须人工看：

| 文件 | 风险 | 约定 |
|---|---|---|
| `backend/prisma/schema.prisma` | 两边都加 model/field/enum | 只追加；合并后 `prisma format/validate`；字段名以字典为准 |
| `backend/prisma/migrations/**` | 两边都加 migration | 不改旧 migration；只追加新目录；按时间戳排序 |
| `backend/src/app.module.ts` | 两边都注册 module/provider | 只加自己的 import/module；合并后 `tsc` |
| `backend/src/application/payment/wechat-payment.service.ts` | 补剂退款/定制退款都在这 | 补剂只加 case 分支；定制只加定制分支；合并后回归支付/退款 |
| `backend/src/interfaces/controllers/admin.controller.ts` | 后台路由可能都加 | 尽量新控制器；必须改时只加自己的路由 |
| `admin-web/src/router/index.ts` | 两边都加页面 | 只加自己的 route；合并后 build |
| `admin-web/src/views/Orders/index.vue` | 鲜食/补剂/定制都可能改 | 补剂订单中心优先新页面；不改旧 tab 逻辑 |
| `admin-web/src/views/Aftersale/RefundManagement.vue` | 补剂/定制退款都可能改 | 补剂加 case 数据源；定制加自己的来源；合并后手工回归 |
| `miniapp/src/pages.json` | 两边都加页面 | 只加自己的 pages；合并后 build |
| `miniapp/src/pages/staff-workbench/index.vue` | 两边都可能加入口 | 入口用 feature flag/条件；合并后真机走查 |
| `miniapp/src/pages/order-detail/index.vue` | 鲜食/定制/补剂详情可能都改 | 补剂优先新页面；必须改时只加分支 |
| `miniapp/src/utils/jcing-printer.ts` | 补剂标签尺寸 | 补剂改 40×60；不影响鲜食标签；定制若也用需先对齐 |

> 定制食谱的 `backend/src/application/custom-recipe/**`、`miniapp/src/pages/custom-recipe/**` 归定制会话；补剂只读，不改。

---

## 四、体验版：只能有一个“合并构建”

### 事实

微信小程序**一个 AppID 只有一个体验版**。A 上传后，B 再上传会覆盖 A。所以：

- 不能“补剂会话上传一个、定制会话上传一个，老板两个都看”；
- 只能把两边的代码合到一个构建里，上传一次，老板看到的是**两边最新合并结果**。

### 推荐流程

```text
定制分支 ─┐
          ├─→ main（合并）─→ 构建 miniapp ─→ 上传体验版 2026.10.20.N
补剂分支 ─┘
```

1. 两边把各自阶段合并到 `main`。
2. 在 `main` 工作区执行 `cd miniapp && npm run build:mp-weixin`。
3. 用固定 CLI 上传（版本号当天递增）：
   ```bash
   /Applications/wechatwebdevtools.app/Contents/MacOS/cli upload \
     --project "$(pwd)" --version "2026.10.20.N" \
     --desc "补剂 P0 + 定制第X批" --lang zh
   ```
4. 记录：版本号、`main` 提交、两边分支提交、包含哪些功能。
5. 老板在体验版验收；有问题回到对应分支修，再合并、再上传。

### 只完成一边时

- 如果定制没有新提交：体验版 = 当前 main + 补剂新阶段；可以上传。
- 如果定制有新提交但没合并：体验版**不包含**定制新功能；要么等定制合并，要么明确告诉老板“这版只验收补剂”。
- 不要为了让一边先看，把另一边未合并的代码硬拷进来；会污染提交历史。

### 谁上传

默认由**补剂会话**做合并构建/上传；定制会话只提交/合并，不直接上传。若定制会话要上传，必须先和补剂会话对齐版本号，且同一时间只有一个人上传。

---

## 五、后端/admin 部署

1. 两边代码都合并到 `main` 并推到 `origin/main`。
2. 先判断后端是否真的改了：
   ```bash
   git diff --stat <上次部署提交>..origin/main -- backend/
   ```
3. 后端：`bash backend/scripts/remote_deploy_v2.sh`（从 `origin/main` 构建）。
4. admin-web：`bash deploy-admin-web.sh`。
5. 小程序：只上传体验版，**绝不发布正式版**。
6. 部署后报告：提交号、包含模块、体验版版本号。

> 如果只合并了补剂、定制还没合并，后端部署只包含补剂；定制功能不要在这版验收。等两边都合并再部署一次“合并版”。

---

## 六、冲突处理

1. **schema 冲突**：以字段字典为准；两边字段都保留；不要删除对方 model/field；合并后 `npx prisma format && npx prisma validate`。
2. **migration 冲突**：两边 migration 都保留；按时间戳排序；不要改对方 SQL；在本地/测试库按顺序 `prisma migrate deploy`，失败就停下来修。
3. **pages.json 冲突**：两边 pages 都保留；subPackages 顺序不重要；合并后 miniapp build。
4. **router 冲突**：两边 route 都保留；path 不能重复；合并后 admin build。
5. **payment 冲突**：补剂和定制退款分支都保留；合并后跑支付/退款回归；不要只测一边。
6. **无法判断**：停下来，把冲突文件/行号/两边意图写清楚，交给老板或另一个会话确认；不要猜。

---

## 七、当前补剂阶段

| 阶段 | 内容 | 合并点 |
|---|---|---|
| P0 | schema/migration/DTO 骨架/配置字段 | 合并到 main |
| P1 | 定价/配置/排期/自动完成 | 合并 |
| P2 | 库存预占/扣减 | 合并 |
| P3 | 快照/DIY 冻结/diySheetId | 合并 |
| P4 | 售后/退款/补发/改地址/复购 | 合并 |
| P5 | 订单中心/后台页 | 合并 |
| P6 | 顾客/员工小程序 + 40×60 标签 | 合并 + 上传体验版 |
| P7 | 回填 dry-run/UAT/灰度 | 合并 + 部署 |

> 每个阶段完成即合并、即跑测试；不攒到最后。
