# E6 · 疫苗板块第一条端到端自动化（2026-10-16 跑通）

> **一句话**：用**微信开发者工具自带的自动化接口**（不新建工程、不新开窗口）在模拟器里
> **真点**了一遍「健康管理 → 疫苗 → 记一条接种记录」，并断言**免疫计划真的跟着变了**，
> 跑完把那条测试记录**删干净**、并断言数据回到与跑之前**逐字段一致**。
> 可重复运行的脚本：`miniapp/scripts/e6-vaccine-plan-e2e.mjs`。

| 项 | 值 |
|---|---|
| 跑的机器 | 本机（macOS），微信开发者工具 + 模拟器 |
| 跑的项目 | `/Users/zhaochen/Documents/SevenKitchen/miniapp`（老板已打开的那个窗口，`miniprogramRoot = dist/build/mp-weixin/`） |
| 连的后端 | **生产** `https://api.sevenkitchen.cloud/api/v1`（下面第三节解释为什么**不用改 storage**） |
| 页面路径 | `pages/dog-profile-health/index`（健康管理）→「疫苗」书签 |
| 用的狗 | **测49·核心落后钩端超前（不提示）**（`f8b46112-…`）—— 只碰测试档案 |
| 生产数据改动 | 写 **1 条**（狂犬 / 2026-10-16），跑完**已删**；删后与跑之前逐字段一致 ✓ |
| 代码改动 | **0 处**（`miniapp/src`、`backend/src` 一个字没动；只新增 1 个脚本 + 本文） |
| storage 改动 | **0 处**（`api_base_url` 从头到尾是 `''`） |

---

## 一、这次跑通了什么（真实输出）

```
── 2. 小程序运行时：登录态 / 后端地址 ──
   ✓ 实际请求的后端：https://api.sevenkitchen.cloud/api/v1
   ✓ api_base_url（storage）：''（空 = 用默认）
── 3. 打开 健康管理 → 疫苗书签 ──
   ✓ 页面上显示的狗狗：测49·核心落后钩端超前（不提示）
   ✓ 已切到「疫苗」书签
── 4. 快照 A（写之前）──
   ✓ 免疫计划 6 项，下一针：core_early|早期一针|OVERDUE|2026-07-05|2026-07-19
   ✓ 接种记录 7 条，抗体检测 2 份
── 5. 录一条接种记录（真点击）：狂犬 / 2026-10-16 ──
   ✓ 录入卡已打开：记一条接种记录       ← 底部「记一条」真点
   ✓ 已勾病种：狂犬病                   ← 名字不在产品库里 → 按需求 R10 勾病种
   ✓ 接种日期就是今天：2026-10-16       ← 日期栏默认今天，没动它
   ✓ 已点「保存」                       ← 真点
── 6. 快照 B（写之后）：免疫计划有没有跟着变 ──
   ✓ 接种记录 7 → 8 条（新增 1 条）
     + 狂犬 2026-10-16 rabies（id=4b695136-…）
   ✓ 免疫计划变了 2 处：
     - rabies/首针/OVERDUE/2026-10-16/2026-11-15
     + rabies/每年一次/UPCOMING/2027-10-16/2027-11-15
── 7. 页面上那一段文字也跟着变了吗 ──
   ✓ 页面上「免疫计划」重画了，具体这几行换了：
     - 已过 / 狂犬疫苗 · 首针 / 原建议时间 2026/08 已过
     + 2027/10/16 / ~ 11/15 / 狂犬疫苗 · 每年一次
── 8. 清场：把这一次新加的那条删掉 ──
   ✓ 已删除：狂犬 2026-10-16 id=4b695136-…
── 9. 快照 C（清场之后）：和写之前是不是一模一样 ──
   ✓ 与写之前完全一致 ✓（生产库没留下痕迹）
```

**这就是"录一条接种记录 → 免疫计划跟着变"**：同一只狗、同一天，写之前狂犬那一行是
`尽快 / 已过 · 狂犬疫苗 · 首针 · 原建议时间 2026/08 已过`；写完变成
`2027/10/16 ~ 11/15 · 狂犬疫苗 · 每年一次`。删掉记录、刷新页面，那一行又变回"首针"。

> 断言分两层，**不是只看接口**：
> ① 结构化数据（走小程序**自己的** api 层 `api/vaccines.js`：计划 / 记录 / 抗体检测 三份快照）
> ② **页面上真实渲染出来的字**（读 WXML 元素的文本，例如 `.vk-plan` 那一段）
> 两者都变了才算过；只变一个会打印告警。

---

## 二、能操作到什么程度（工具能力实测）

开发者工具自带的自动化接口**既能读、也能点**，这次实测用到的：

| 能力 | 工具 | 实测结论 |
|---|---|---|
| 读当前页面 / 页面栈 / 机型 | `automation_runtime_info` | ✓ `currentPage`、`systemInfo`（390×753）都拿得到 |
| 页面导航 | `automation_navigate` | ✓ `navigateTo / redirectTo / navigateBack` 都能用 |
| **点元素 / 输入 / 读文本 / 读属性 / 读位置** | `automation_element_action` | ✓ `tap / input / text / value / attribute / offset / size` 全可用；选择器支持 `:nth-child(n)` |
| 页面级读写 | `automation_page_action` | `querySelector / querySelectorAll / scrollTop / getData` 可用；⚠️ `getData` 对 uni-app + Vue3 的 setup 状态**读不到**（返回 `{}`），`callMethod` 调不到 setup 里的函数（`page.onDogPickerChange not exists`）→ **断言一律走"元素文本 + 小程序自己的 api 层"** |
| 滚动 | `automation_viewport_action --action pageScrollTo` | ✓ 点之前要先把元素滚进视口（底部固定栏会盖住最后一段） |
| 截图 | `simulator_screenshot` | ✓ 存成 jpg（长边 1280） |
| 在运行时跑代码 | `automation_evaluate` | ✓ **支持 Promise**；`require('api/vaccines.js')` 这种模块路径**可直接 require**（= 走小程序自己那份代码，不用脚本另写一套 HTTP） |
| 读 console / network | `get_simulator_console` / `get_simulator_network` | ✓ 能 grep；network 里能直接看到请求落在哪个域名 |
| 元素文本里的"空值" | — | ⚠️ `<input>` 用 `text` 读到的是**空**，要读 `value` |

**做不到的**（这次没绕过去，如实记下）：

1. **`<picker>` 选不了**：「切换狗狗」是个原生 picker，选项不在 WXML 里，
   选择器点不到；`callMethod` 又调不到 setup 里的处理函数 → **改不了当前显示的是哪只狗**。
2. **自动化跑不了真实微信登录**：登录态是 `wx.login` 换的、不在 storage 里，
   必须**人点一次**（老板已经点过了 ✓）。脚本会检查 `token`，没有就直接报错退出。
3. **原生日期选择器**：录入卡的日期是 `<picker mode="date">`。本次用不上 ——
   新建一条记录时日期**默认就是今天**，所以整条链路不需要碰 picker。

---

## 三、连的哪个后端（这条把原来的假设纠正了）

**结论：这份模拟器跑的构建本来就**只连生产**，`api_base_url` 改了也没用，所以这次一个字都没改。**

理由（读构建产物 + 运行时实测两处对上了）：

- 当前项目窗口 = `miniapp/`，`project.config.json` 里 `miniprogramRoot = dist/build/mp-weixin/`
  —— 也就是**生产构建**（`npm run build:mp-weixin` 的产物）。
- `src/utils/config.ts` 里 `IS_PRODUCTION_BUILD` 的**优先级最高**：
  ```ts
  if (IS_PRODUCTION_BUILD) return PROD_BASE_URL   // ← 直接返回，storage 根本不看
  ```
  编译出来就是 `function i(){return h}`，而 `h = "https://api.sevenkitchen.cloud/api/v1"`（写死的）。
- 运行时实测：`require('utils/config.js').getBaseUrl()` → `https://api.sevenkitchen.cloud/api/v1` ✓
  同时 `wx.getStorageSync('api_base_url')` → `''`（**全程没变过**）。
- 也就是说：**只有 `dist/dev/mp-weixin` 那份开发构建**（`uni -p mp-weixin`）才会读 storage 里的
  `api_base_url`、并默认连 `127.0.0.1:3011`。老板现在开着的是生产那份。

**本机后端 / 本机库的实测**（顺带核了一遍 CLAUDE.md 里的说法）：

| 查什么 | 结果 |
|---|---|
| 本机 3011 有没有在跑 | **没有**（`lsof -i :3011` 空、curl 000）。`npm run start:check:miniapp` 是"自己启一个、查完就退"，它会打印 `No running server found, booting app for health check… App health check passed` —— 这句话的意思是**代码和库是好的**，不是"服务在跑" |
| 本机库狗的数量 | **11 只**，名字都是普通狗（Lucky / Star / 咖喱 / 嘟嘟 / 噜噜 …），**没有一只叫「测XX」** |
| 本机库疫苗数据 | `vaccine_record` **1 条**；相关表只有 `vaccine_record` / `vaccine_decision`，**没有疫苗产品目录表** |
| 生产上这个账号能看到几只 | **83 只**，其中 **50 只**是「测01 ~ 测49」测试档案 ✓（另外 33 只是真实档案） |

→ 所以"在模拟器里验疫苗计划"**只能**连生产（本机库既没有测试档案、也没有产品表）。
这次没有为此改任何配置：那份构建本来就是生产。

---

## 四、脚本做了什么（可重复运行的版本）

`miniapp/scripts/e6-vaccine-plan-e2e.mjs`（Node，无依赖，只调 `wechatide` 那个二进制）：

1. **前置检查**：开发者工具登录态 → 小程序有没有 token → `getBaseUrl()` 是不是生产
   （不是生产就**直接退出**并说明原因，绝不偷偷改 storage）
2. `redirectTo` 打开 `pages/dog-profile-health/index?from=home`，读页面上的狗名
   → **名字必须以「测」开头**，否则退出（**绝不碰真狗**）
3. 点第 3 个书签「疫苗」，等到 `.vk-plan` 渲染出来
4. **快照 A**：计划 / 记录 / 抗体检测（走 `api/vaccines.js`）
5. **真点击**：`.sticky-bar__button--primary`（记一条）→ `.vk-editor__input` 输入「狂犬」
   → 逐个读 `.vk-editor__chip:nth-child(n)` 找到「狂犬病」勾上 → `.vk-editor__btn--primary`（保存）
   （点之前先 `pageScrollTo` 把元素滚进视口）
6. **快照 B + 断言**：记录必须 +1；免疫计划必须变（打印"哪一行没了 / 哪一行新来了"）；
   页面上 `.vk-plan` 的文字也必须跟着变
7. **清场**：按"快照 B 新增的 id"删（不看名字猜）；万一 id 没记下来，
   兜底规则是「名字=狂犬 且 日期=今天 且 **不在快照 A 里**」
8. **快照 C + 断言**：与快照 A 逐字段一致（不一致就 `exit 2` 并打印差异）
9. 最后打印一张汇总：**写了什么、删干净没有**（`--keep` 时会明确说"没删，请自己删"）

**幂等 / 安全**：
- 跑一百遍的结果都一样：写一条、删一条，生产库回到原样（快照 C 每次都会核对）
- 出错也会**尽力清场**（`catch` 里不管卡在哪一步，只要写过了就按 id 删）
- 只写 `测XX`（否则退出）；只删自己写的那条（快照 A 里有的 id 绝不删）

---

## 五、怎么再跑一遍

```bash
# ① 前置：开发者工具开着、已经登录、并且那个项目窗口开着（miniapp/）
#    —— 自动化跑不了"微信登录"，这一步必须是人点的

# ② 只读一遍（不写不删，最安全；先拿它确认环境和当前那只狗）
node miniapp/scripts/e6-vaccine-plan-e2e.mjs --dry-run

# ③ 跑完整条（写一条 → 断言计划变了 → 删掉 → 断言复原）
node miniapp/scripts/e6-vaccine-plan-e2e.mjs

# 想看它写进去的那条长什么样（不删）：跑完请手动删掉那条记录
node miniapp/scripts/e6-vaccine-plan-e2e.mjs --keep
```

退出码：`0` 跑通；`1` 卡住；`2` 清场后与跑之前不一致；`3` 没删到东西（都要人看一眼）。

---

## 六、卡点与做不到的（如实说）

| # | 卡点 | 为什么 | 现在怎么办 |
|---|---|---|---|
| 1 | **选不了"哪只狗"** | 「切换狗狗」是原生 `<picker>`，选择器点不到 | 脚本用"页面上显示的那只"，并要求它以「测」开头；要换狗只能**人在模拟器里点一下** |
| 2 | **`?dogId=` 参数被忽略**（见下节，这是个 bug） | 页面 `onLoad` 和 `onShow` **各拉了一次狗狗列表**，后返回的那次不带 dogId → 选中列表第 1 只 | 脚本不依赖 dogId；已把现场证据写进第七节 |
| 3 | 微信登录 | `wx.login` 换的，不在 storage | 人点一次；脚本检查 `token` 并给出明确报错 |
| 4 | 原生日期 picker | 选项不在 WXML 里 | 本次用不到（新建记录默认今天）；真要改日期只能人点 |
| 5 | 并发写入 | 跑的时候生产库上**有别人在动**（见第七节） | 脚本按 id 精确删 + 快照 C 核对；条数不是 +1 会打印告警 |

---

## 七、顺带发现的两件事（只报告，没动代码）

### 7.1 【bug】带 `?dogId=` 打开健康管理页，显示的却是列表第 1 只狗

- **复现**：`redirectTo`/`navigateTo` 到
  `/pages/dog-profile-health/index?dogId=4bd68bcc-…（测48）&from=overview`
  → 页面上显示的是 **测49**（列表第 1 只），不是测48。**跑了两次、两种 `from`，结果一样。**
- **证据**：把 `dogApi.list` 打了个计数补丁后再进页面 → **1 毫秒内被调了两次**，
  两次参数都是空（都不带"想选哪只"）：
  ```
  calls: [ {t: 1792160530291, args:"[]"}, {t: 1792160530292, args:"[]"} ]
  ```
  对应代码：`onLoad` → `loadDogs(options.dogId)`，紧接着 `onShow` → 此时 `dogs.value` 还是空的
  → `if (!dogs.value.length) loadDogs()`（**不带 dogId**）。两次请求都完成后，
  后到的那次把选中项改成第 0 只 → `resolveDogHealthSelectionState(…, '测48')` 明明返回
  `selectedIndex: 1`（实测确认过），页面还是显示第 0 只。
- **影响**：从「爱犬概览」点进健康管理，可能**看到的不是刚才那只狗**（会看到最近更新的那只）。
  这次实测里它正好是"看着像小事、真机上会让人吓一跳"的那种问题。
- **怎么改**（留给 MiniApp 开发）：`onShow` 那次重载加一个"已经加载过就不重复拉"的条件
  （例如 `if (!dogs.value.length && !isLoading.value)`），或用 `latestRequestedDogId` 把
  不带偏好的那次结果丢掉。
- **我没有改代码**（老板的规矩：发现 bug 只报告）。

### 7.2 生产库上有并发写入 / 仓库里有并发改动

- 跑之前，**测49** 的接种记录从走查文档里记的 3 条变成了 **7 条**：其中 3 条
  （`2026-04-05 / 04-30 / 05-15`）的 `createdAt` 是 **今天 13:40Z**（= 本地 21:40，就在我跑之前），
  也就是**有人/有别的会话在删了又重建**这几条。另有 1 条 `2026-10-16 03:10Z` 的"卫佳伍"。
- 同一时间，仓库里 `backend/src/domain/health/vaccine/engine.ts` 与
  `backend/tests/.../missed-window.spec.ts` 在 **22:28** 被改动（未提交），22:23 还多了一个提交
  `2f7191d5 fix(vaccine): 两个忽略原因的区别写在界面上`。
  → 说明**还有人在同时动疫苗这块**；我这条 E2E 打的是**已部署到生产的后端**，
  不受本地未提交改动影响，但如果同时有人也在生产库上写，条数断言可能被干扰
  （脚本对此只会打印告警，不会误删别人的记录）。

---

## 八、生产数据改动清单（这次到底写了什么）

| 项 | 内容 |
|---|---|
| 写到哪只狗 | **测49·核心落后钩端超前（不提示）**，`dogId = f8b46112-7ada-4df6-a05e-3629f3d4848d` |
| 写了什么 | 1 条接种记录：`狂犬` / `2026-10-16` / 归类 `rabies`（一共写了 3 遍：手工验证 1 遍 + 脚本验证 2 遍，每遍都当场删掉） |
| 删干净没有 | **干净** ✓ 每条都按 id 删掉，删完复查"与该狗接种记录剩 7 条"，并且**计划/下一针/记录/抗体检测与写之前逐字段一致** |
| 删掉的记录 id | `c7a60b5f-02b6-48d9-81f6-8087aae1ebf7`（手工那遍）、`4b695136-e5f1-47fe-ba1c-04e805dd307b`、`901c9afb-cef9-40bf-8554-47f5f595d10a`（脚本两遍） |
| 真实用户的狗 | **一条都没碰**（脚本第一道闸就是"狗名必须以「测」开头"） |
| storage | 没改（`api_base_url` 一直是 `''`） |

---

## 附：相关文件

- 脚本：`miniapp/scripts/e6-vaccine-plan-e2e.mjs`
- 疫苗走查（12 条验收场景）：`docs/plans/2026-10-16-vaccine-acceptance-walkthrough.md`
- 自动化使用规则：仓库根 `CLAUDE.md` 的「开发者工具自动化」一节
- 截图（跑完自动存 `/tmp`）：`/tmp/e6-vaccine-after-save-<时间戳>.jpg`
