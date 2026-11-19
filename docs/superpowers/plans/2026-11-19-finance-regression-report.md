# Task 17 全量回归记录（2026-11-19）

- 分支：`task/20261119-t075731`（工位 `.worktrees/20261119-t075731`）
- 提交：`8f32e761`（finance 相关提交共 41 个，`origin/main..8f32e761`）
- 环境：本地 macOS，Node/npm 按仓库现有版本
- 结论：**本次改动未引入新的失败**；所有新增财务用例全绿。

## 一、后端全量 `cd backend && npx jest`

| 口径 | 套件（失败/通过/总数） | 用例（失败/通过/总数） |
|---|---|---|
| 当前分支 | **6 / 643 / 649** | **80 / 6823 / 6903** |
| 基线 `origin/main`（`8fd75f07`） | **6 / 634 / 640** | **80 / 6683 / 6763** |
| 差值 | 失败 0，通过 +9 | 失败 0，通过 +140 |

基线复跑方式：工作区无未提交改动，`git stash` 返回「No local changes to save」，
因此在临时 worktree 检出 `origin/main`（`8fd75f07`）跑同一条命令对照，跑完删除临时 worktree，未改动主工作区。

**两边完全相同的 6 个红色套件（基线既有，与本次财务改动无关）：**

1. `tests/application/purchasing/replenishment.service.spec.ts`
2. `src/application/purchasing/tests/reimbursement-claim-number.spec.ts`
3. `tests/application/custom-recipe/custom-recipe-aftersale.service.spec.ts`
4. `tests/application/supplement-shop/supplement-order.service.spec.ts`
5. `tests/application/standard-ingredient-import/local-ingredient-import.spec.ts`
6. `tests/interfaces/controllers/recipes.controller.spec.ts`

失败用例标题逐条比对也一致（80 条对 80 条）；当前分支多出来的 9 个套件 / 140 条用例全部通过，均为本次新增的 finance 用例。

## 二、小程序单测 `cd miniapp && npx vitest run`

- **231 个测试文件全部通过，2841 条用例全部通过，0 失败。**

## 三、后台构建 `cd admin-web && npm run build`

- **成功**（`✓ built in 7.23s`），无报错。

## 四、小程序发布构建 `cd miniapp && npm run build:mp-weixin`

- **成功**，产物 `miniapp/dist/build/mp-weixin`。
- `app.json` 分包含 `pages/staff-finance`，四个页面均在产物中：
  `index` / `entries` / `manual-entry` / `bills`。

## 五、已确认未纳入回归的风险

- 6 个红色套件在 `origin/main` 上同样红，属于既有基线，不作为本次阻塞项；财务相关套件（`tests/application/finance/*` 与小程序 finance 回归 spec）全绿。
