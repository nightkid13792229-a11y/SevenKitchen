# 顾客「我的订单」卡片收尾 · 2026-11-02 会话收尾

> 本文件记录本会话（2026-11-02 21:36–23:10）在顾客端「我的订单 / 鲜食订单详情」上的全部改动、提交、上传、验证与遗留。
> 归档前请以 `origin/main` 为准；主工作区里其它会话的未提交改动不在本记录范围内。

## 一、本会话完成的改动

### 1. 鲜食卡片：运单号只留「复制」

- 去掉「物流详情 ›」入口，也不再弹「物流信息」弹窗（原来点整行弹的是含快递公司名的对话框）。
- 运单号右侧新增「复制」小胶囊；点按钮或整行，**只复制单号本身**（模拟器实测剪贴板为 `SF0205870623120`，不含「顺丰速运」）。
- 点复制不会误跳详情页（`@tap.stop`）。

### 2. 鲜食订单详情页空白 —— 真 bug

- 现象：进详情页**一片空白**，控制台没有任何报错；接口其实成功返回了完整数据。
- 根因：生命阶段那一轮（提交 `dd5637c2`，已进入 `origin/main`）把 `recipeVersionLabel()` **误粘贴进 `orderCenterTitle` 这个 computed 的函数体**，模板 `v-if="recipeVersionLabel(item)"` 一求值就抛错 → 整页重渲染失败；生产包不打印渲染异常，所以只剩空白。
- 修复：把函数提到 `<script setup>` 顶层，computed 恢复成原来的三行。
- 定位方式：用微信开发者工具模拟器 + 真实生产数据先复现空白，再换非压缩构建看到渲染错误，最后对照 `origin/main` 源码找出误粘贴。
- 影响面：**线上体验版 `.19`（提交 `cf395c91`）就是坏的包**，不是本地环境问题。

### 3. 订单号统一到卡片头（老板两问）

- 卡片头改成两行：
  - 第一行「类型 + 下单时间」；
  - 第二行「订单号 + 复制」。
- 鲜食 / 食谱定制 / 预分装补剂**共用同一段模板**（不按 `_orderType` 分叉）；单号为空时整行不渲染。
- 补剂卡片原来把单号塞在标题下的概要小字里（「订单号 SP… · 6 种 · 共 6 袋」），现在概要只留「6 种 · 共 6 袋」，单号不再出现两遍。
- 卡片底部只留「查看详情 ›」。
- 代价：卡片高约半行（老板已确认）。

### 4. 守卫加固（防止同类空白页再上线）

- `template-bindings.regression.spec.ts` 改用 TypeScript 语法树，只认 `<script setup>` 的**顶层绑定**；写在别的函数里不算"模板可见"。
- 旧判据只查"脚本里出现过 `function recipeVersionLabel`"，所以这个 bug 照样通过 —— 现在不会了。
- 实测：把旧代码放回去，守卫立刻报
  `src/pages/order-detail/index.vue → recipeVersionLabel()`；改好后通过。
- 只解析 `<script>` 块（不再把 `<style>` 喂给解析器），耗时 2.9s → 1.3s。
- 全量并行跑时机器忙会被拖到 14s，已被误判超时，故给两条守卫加了显式 30s 超时。

## 二、提交记录（均在 origin/main）

| 提交 | 内容 |
|---|---|
| `f57e483a` | 运单号直接复制；修鲜食详情页空白；模板守卫改为只认顶层绑定 |
| `f157bb92` | 订单号统一到卡片头（三类订单同一套 UI）；守卫加超时 |

## 三、体验版

| 项目 | 状态 |
|---|---|
| 小程序体验版 | `2026.11.02.23`，对应提交 `f157bb92` |
| 本会话前一次上传 | `2026.11.02.20`，对应提交 `f57e483a` |
| 正式版 | **未发布**（按规则只传体验版） |
| 状态文件 | `.wechat-trial-state` → `2026.11.02 23 f157bb92…` |
| 开发者工具目录 | `miniapp/dist/build/mp-weixin`（上传脚本已把官方产物放到这里） |
| 后端 / 管理后台 | 本会话**未改**，未部署 |

序号 .21 / .22 在两次上传之间被其它会话占用（脚本按当天序号递增），本会话最后一次是 .23。

## 四、验证记录

- 小程序测试（本会话相关，全部通过）：
  - `orders-list-header.regression.spec.ts`：5
  - `orders-list-logistics.regression.spec.ts`：4
  - `orders-list.regression.spec.ts`：6
  - `orders-list-merge.regression.spec.ts`：8
  - `template-bindings.regression.spec.ts`：3
  - `order-detail.regression.spec.ts`：28
- 小程序全量：`npx vitest run` → 185 个文件、2162 通过 / 4 失败。
  4 条失败**改动前就存在**（用 `git stash` 回退本会话改动复测仍红）：
  - `staff-order-center`：员工端不展示退款金额
  - `supplement-purchase` ×3：补剂订单详情"七处调整"
  - 另有 `__zhipuImage.guard.spec.ts` 整个文件加载失败：它读的后端文件
    `backend/src/application/recipe-designer/zhipu-image.ts` 在仓库里不存在
- 构建：`npm run build:mp-weixin` 通过（含分包 JS 迁移脚本）。
- 模拟器实测（生产数据）：三类卡片同款单号行；点复制只得到单号；
  鲜食 / 定制 / 补剂详情页正常；从卡片「查看详情」进入详情正常。

## 五、已知遗留 / 后续事项

1. 那 4 条红色测试属于**其它会话正在做的补剂改动**，与本期无关；不要为了"全绿"去改它们的断言。
2. `__zhipuImage.guard.spec.ts` 依赖的后端文件不存在，属历史遗留，建议后来者决定"补文件"还是"删守卫"。
3. 生命阶段版本名（`recipeVersionLabel`）已提升到顶层，但**当前生产数据里没有 `series_life_stage / series_life_stage_label`**，所以卡片和详情暂时不显示版本名；等数据补上会自动出现，不必再改代码。
4. 卡片因为多了一行单号，高度略增；若以后想省高度，可把单号并到「类型 + 时间」同一行（窄屏需实测）。
5. 本地 `main` 与 `origin/main` 已分叉（本地 28 个知识库文档提交 vs 远端 86 个产品提交）；
   **归档 / 部署一律以 `origin/main` 为准**，不要拿本地 main 构建或上传。
6. 主工作区仍有其它会话的未提交改动（食材 AI、补剂、订单中心、`mockups/` 等），本会话未触碰。
   其中 `orders-list/index.vue`、`orders-list-merge.regression.spec.ts` 的未提交内容，
   已核对与 `origin/main` 上的既有提交**重复**（`isSupplementRefunded` / `aftersale-badge` 等），不是丢失的改动。

## 六、本会话产生的文件

- 新增：`miniapp/src/pages/orders-list-logistics.regression.spec.ts`
- 新增：`miniapp/src/pages/orders-list-header.regression.spec.ts`
- 修改：`miniapp/src/pages/orders-list/index.vue`
- 修改：`miniapp/src/pages/order-detail/index.vue`
- 修改：`miniapp/src/template-bindings.regression.spec.ts`
- 修改：`miniapp/src/pages/orders-list-merge.regression.spec.ts`（补剂卡片断言随单号行调整）
- 本文件：`docs/plans/2026-11-02-orders-card-session-closeout.md`

## 七、工作区说明

- 本会话所有代码改动已提交并推送到 `origin/main`；体验版以 `f157bb92` 为基线。
- 本会话创建的两个临时 worktree 已删除，对应本地分支已删除；`.wechat-trial.lock` 无残留。
- 聊天用的对比截图在 `/tmp/sk-card-*.jpg`（临时文件，不入库）。
