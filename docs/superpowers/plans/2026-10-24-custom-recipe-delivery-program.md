# 定制食谱交付流程重构 · 执行方案

> 日期：2026-10-24
> 设计定稿：`docs/superpowers/specs/2026-10-24-custom-recipe-delivery-redesign-design.md`
> 线框：`docs/prototypes/2026-10-24-delivery-wireframe.html`

---

## 总览

一次设计透，分两期上线，视觉最后做。

| 期 | 内容 | 交付物 | 预估 |
|---|---|---|---|
| **P1** | 交付页合并、版本锁、Seven爸爸客服入口、文案改名 | 体验版可点：定制食谱 → DIY 配置 → 制作单 | 3–4 天 |
| **P2** | 补剂锁营养目标、产品/原料实时解析 | 缺货自动换等价原料并重算克数 | 5–7 天 |
| **P3** | 视觉统一（交付页、DIY 配置、制作单、订单页） | 一套字号/间距/颜色规矩 | 2–3 天 |
| **P4** | 验收、部署、上传体验版 | 真机可验收的版本 | 1 天 |

**为什么分两期：** P2 要先补“可替换补剂”的数据、再改设计器和解析逻辑；P1 不依赖它，能先把“同一页两份清单”“页面重复”“没有客服入口”这三个最刺眼的问题解决掉。两期共用同一套设计，不是两个方向。

---

## P0 · 开工前定稿（0.5 天，不写代码）

- [x] 成品鲜食可按定制配方生产，入口写「订购成品」（2026-10-24 已定）
- [x] “采购与制作单”交付物标签保留（2026-10-24 已定）
- [ ] 营养师定稿等价组 taxonomy（组名、成员、是否允许跨组）
- [ ] 确认老订单也切新页面（数字仍用老快照，不重算）
- [ ] 确认定制配方成品下单的验证方式（本地测试单 / 生产小额单）

---

## P1 · 页面合并 + 版本锁 + 客服入口

### P1-A 后端：交付版本解析

| # | 任务 | 文件 | 验收 |
|---|---|---|---|
| A1 | 新增“按订单解析交付版本”服务：校验订单归属，从交付记录取 `recipeVersion`；批次单查明细，老单查交付表 | 新建 `backend/src/application/custom-recipe/delivered-recipe-version.service.ts`；测试同目录 `*.spec.ts` | 本人订单返回版本号；他人订单返回 null；无交付返回 null |
| A2 | 食谱详情接口加可选 `orderId`：带则按交付版本取，不带取最新 | `backend/src/interfaces/controllers/recipes.controller.ts`、`business/recipe.service.ts` | 两条路径都有测试；不带参数结果与今天一致 |
| A3 | 制作单生成接口加可选 `orderId`，按交付版本生成 | 同上、`backend/src/application/recipe/diy-sheet.service.ts` | 带/不带参数各一条测试 |
| A4 | 生命阶段匹配接口加可选 `orderId`，按交付版本判断 | `backend/src/interfaces/controllers/recipes.controller.ts` | 带/不带参数各一条测试 |
| A5 | 计数副作用：生成制作单时给**被取用的那一版**加计数，不是最新版 | `backend/src/application/recipe/diy-sheet.service.ts` | 测试断言计数落在指定版本 |
| A6 | 回归：橱窗流程（不带 orderId）全绿 | 现有 recipe/diy 测试 | `npx jest` 相关用例通过 |

**硬约束：** 同一请求内所有取数走同一版；带 orderId 但查不到交付时**返回 404，不回退最新版**。

### P1-B 小程序：交付页与路由

| # | 任务 | 文件 | 验收 |
|---|---|---|---|
| B1 | 新增 `buildDeliveryDiyUrl(orderId, recipeId?)`，替换 `buildDeliveryShoppingUrl` | `miniapp/src/utils/custom-recipe-delivery.ts` + `.spec.ts` | 单份/多份都带对 recipeId |
| B2 | 第 1 页重排：封面 → 一句话 → 喂食建议 → 配方组成 → 补剂 → 核心营养 → 页脚 | `miniapp/src/pages/custom-recipe/delivery.vue` | 页面无第二份清单；标题为“喂食建议” |
| B3 | “喂食建议”去掉“按 X 天配的”，加“份量可自行调整”；补剂只留名称+怎么加 | 同上 | 文案断言 |
| B4 | “食材”改“配方组成”，新增“共 N 种”；`<1%` 不再显示 0% | `delivery.vue`、`components/recipe/RecipeIngredientRatioTable.vue` + spec | 0.12% → `<1%` |
| B5 | 底部栏：[找 Seven爸爸] [自己做] [订购成品]；自己做跳 DIY 配置并带 `orderId`，订购成品跳成品订购页 | `delivery.vue` | URL 断言 |
| B6 | 删除第 2 页与路由 | 删 `delivery-shopping.vue`、`pages.json` 路由、`utils/delivery-print.ts` | `pages.json` 无该路由 |
| B7 | 改名：导航标题、订单详情卡片、交付物标签、打印单、订单列表占位 | `pages.json`、`order-detail.vue`、`orders.vue`、`orders-list/index.vue`、`custom-recipe/index.vue`、`delivery.vue` | 全仓无“我的专属食谱” |
| B8 | 更新受影响的回归测试：`delivery.regression.spec.ts`、`multi-recipe-delivery.spec.ts`、`equipment.spec.ts`、`__supplementBuy.guard.spec.ts`、`custom-recipe-delivery.spec.ts`、`custom-recipe.regression.spec.ts` | 同名测试文件 | `npx vitest run` 全绿 |
| B10 | 第 1 页固定底栏定稿：`[找 Seven爸爸]` `[自己做]` `[订购成品]`，订购成品实心；制作单“怎么做”后保留一条“订购成品”文字入口 | `delivery.vue`、`diy-sheet/index.vue` | 三颗按钮都可点；小屏不挤；只有一颗实心 |
| B11 | 端到端验证：定制配方能报价、能下单（本地测试单；生产小额单按 P0 结论） | 手工 + 截图留档 | 报价金额与下单成功页正确 |

### P1-C 小程序：DIY 两页接参数

| # | 任务 | 文件 | 验收 |
|---|---|---|---|
| C1 | DIY 配置页读 `orderId`，传给详情、生命阶段、生成制作单、跳转制作单 | `miniapp/src/pages/recipe-diy/index.vue`、`utils/life-stage-match.ts` | 四个请求都带 orderId |
| C2 | DIY 配置页顶部加来源提示（“来自定制订单 CR…”），标题按场景切换 | `recipe-diy/index.vue` | 有 orderId 时显示；没有时不显示 |
| C3 | 制作单页读 `orderId`，传给详情请求；后续跳转继续携带 | `miniapp/src/pages/diy-sheet/index.vue` | 详情请求带 orderId |
| C4 | 橱窗进入 DIY 不带 orderId，行为不变 | 回归测试 | 现有测试全绿 |

### P1-D 客服入口（Seven爸爸）

| # | 任务 | 文件 | 验收 |
|---|---|---|---|
| D1 | `CustomerServiceInlineButton` 默认文案改“找 Seven爸爸” | `miniapp/src/components/CustomerServiceInlineButton.vue`、`customer-service-placement.regression.spec.ts` | 所有入口统一 |
| D2 | 交付页底部栏放客服入口，带订单号 | `delivery.vue` | 点开带 orderId |
| D3 | DIY 配置页底部加客服入口（有订单带订单号，无订单走通用） | `recipe-diy/index.vue` | 两种场景各一条 |
| D4 | 制作单页页脚加客服入口 | `diy-sheet/index.vue` | 可达 |
| D5 | 订单详情页加客服入口（带订单号） | `order-detail.vue` | 点开带 orderId |
| D6 | 售后页页脚加“其它问题？找 Seven爸爸” | `aftersale.vue` | 可达 |
| D7 | 列表页客服入口补订单号（现在没带，客服要反问是哪单） | `orders.vue` | `openCustomerServiceChat` 收到 orderId/orderNo |

### P1 验收

1. 定制订单 → 订单详情 → 我的定制食谱 → 点“自己做” → DIY 配置（狗/食谱已预选）→ 生成制作单。
2. 制作单里的食材与交付页“配方组成”同一套；补剂只出现一次。
3. 橱窗 → 食谱详情 → 自己做 → DIY 配置，全程与今天一致。
4. 每一页最多一个客服入口，点开带对应订单号。
5. 交付页底栏三件事都在、都可点：找 Seven爸爸 / 自己做 / 订购成品；只有一个实心主按钮。
6. `npx vitest run`、`npx jest`、`npm run build:mp-weixin` 全绿。

---

## P2 · 补剂锁营养目标

### P2-A 数据与后台：等价组

> 维护单位是**原料**，不是食谱。真实数据：58 条补剂行只用到 12 种补剂原料，原料库共 35 种。
> 组是分类体系，不是库存清单：按“营养素 × 形态”铺开，可增删改，新人原料直接归组。

| # | 任务 | 说明 |
|---|---|---|
| A1 | 起草 taxonomy 文档：按“营养素 × 形态”铺开（钙/锌/碘/铁/铜/锰/硒/镁/维生素/Omega-3/牛磺酸/胆碱/关节/益生菌），每组建组依据 + 文献 | 输出 `docs/design/supplement-equivalence-groups.md`；草稿不算数，等营养师审核 |
| A2 | 新建等价组表 `SupplementEquivalenceGroup`：营养素规范 key、组名、形态类别、定义、分组依据、安全边界、文献、审核状态/人/日期、启停；原料表加 `equivalenceGroupId` | 一次 migration；老数据允许为空；文献与审核字段非空才能“已审核” |
| A3 | 后台等价组管理页：增 / 改 / 停用 / 删除（有原料或历史引用时只能停用）；显示每个组用了哪些原料、被哪些配方引用；留审计记录 | 删除走软删；审计记录谁、何时、改了什么 |
| A4 | 原料档案加“等价组”选择；一页看全 35 种补剂原料的分组状态，支持批量归组 | 未分组单独一列，方便一次补齐 |
| A5 | 营养目标 key 归一：钙/calcium → calcium，碘/iodine → iodine，锌/zinc → zinc | 现在中英混用，不归一则组匹配失败 |
| A6 | 一次性给现有 35 种补剂原料归组；新建/新入库原料必须选组或在“未分组”里可见 | 未分组 = 不自动替换，走原原料 |
| A7 | 配方行例外开关：可关闭自动替换，或保留逐食谱候选（现有“替代补剂”） | 默认开启组替换；例外才逐条配 |
| A8 | 保存校验：同组成员必须有同单位、有效浓度；草稿/未审核组不参与线上替换 | 缺浓度或未审核直接拦下 |

**分组依据的来源等级（写进 A1 文档，缺一不可上线）：**

1. NRC《Nutrient Requirements of Dogs and Cats》、FEDIAF 营养指南、AAFCO 官方出版物、EFSA FEEDAP 意见；
2. 同行评审综述与随机对照试验（钙盐吸收、锌形态、藻类碘等）；
3. 兽医营养学教材。

不接受品牌商页面、博客、论坛、电商详情页。每条依据要能点开原文；营养师签字后才从“草稿”变“已审核”。

### P2-B 后端解析

| # | 任务 | 文件 | 验收 |
|---|---|---|---|
| B1 | 新增“按营养目标解析原料”服务：给定目标、总重、等价组，返回首选与备选及各自克数 | 新建 `backend/src/application/supplement-shop/supplement-target-resolver.service.ts` | 单测覆盖：同组换品牌、同组换原料不同浓度、跨组不换、无可用候选 |
| B2 | 食谱详情返回补剂候选（同组 + 实时可售），不再只依赖快照里的冻结候选 | `recipe.service.ts` | 未分组时回退原原料 |
| B3 | 生成制作单/购买补剂时用同一个解析结果，保证页面与下单一致 | `recipes.controller.ts`、`supplements.controller.ts` | 同一次请求内两处数字一致 |
| B4 | 不可售兜底：返回 `unavailable` + 原因，不返回死链 | 同上 | 前端能渲染“暂时买不到” |

### P2-C 小程序

| # | 任务 | 文件 | 验收 |
|---|---|---|---|
| C1 | 制作单补剂表：名称 + 时机 + 总量；产品名/规格来自实时解析 | `diy-sheet/index.vue` | 换产品后重进页面显示新品牌与重算克数 |
| C2 | “换一个”候选列表：同组实时候选 + 等价克数；无候选时不显示入口 | `diy-sheet/index.vue`、`supplement-alternatives.ts` | 候选 0/1/N 三种态 |
| C3 | 不可售文案：“暂时买不到，找 Seven爸爸” | 同上 | 不出现死链 |
| C4 | 交付页（第 1 页）补剂只显示目标与时机，不显示品牌 | `delivery.vue` | 与 P1 一致 |

### P2 验收

1. 把鸡蛋壳粉下架，制作单自动落到同组的碳酸钙（或柠檬酸钙），克数按浓度重算。
2. 恢复鸡蛋壳粉，制作单回到原原料。
3. 骨粉与碳酸钙**不**自动互换（跨组）。
4. 所有同组成员都不可售时，显示“暂时买不到”，客服入口可达。
5. 橱窗 DIY 与定制 DIY 行为一致。

---

## P3 · 视觉统一

> 前提：P1、P2 的结构不再变。

| # | 任务 | 说明 |
|---|---|---|
| A1 | 定一套规矩：字号 4 档、间距 3 档、颜色 3 个 + 提示色、圆角/描边/阴影各一档 | 写成 `docs/design/delivery-visual-tokens.md` |
| A2 | 黑白线框确认（已有一版，按 P1/P2 结果更新） | 先看结构再上色 |
| A3 | 上色与排版：交付页、DIY 配置、制作单；底栏三颗按钮的主次（实心只有一个） | 每页一个主操作 |
| A4 | 顺带对齐：订单详情、订单列表、确认页 | 同一套规矩 |
| A5 | 真机走查：iPhone / Android 各一台，检查字号、换行、安全区 | 截图留档 |

**验收：** 同一屏字号不超过 4 档；主按钮唯一；卡片间距一致；小字对比度可读。

---

## P4 · 验收与上线

- [ ] 后端：`npx tsc --noEmit`、`npx jest`、构建通过
- [ ] 小程序：`npx vitest run`、`npm run build:mp-weixin` 通过
- [ ] 开发者工具用真实测试单走完整流程（CR202610230224）
- [ ] 后端合并 main → push → `bash backend/scripts/remote_deploy_v2.sh`
- [ ] 小程序构建 → 上传体验版（版本号递增，不发布正式版）
- [ ] 向老板报告：部署了哪个提交、体验版版本号、验收路径

**顺序硬约束：** 后端先上，小程序后传。反过来会出现小程序带 `orderId`、后端不认，静默退回最新版。

---

## 风险与对策

| 风险 | 后果 | 对策 |
|---|---|---|
| 只有部分接口认 orderId | 同一页混着两个版本的数据 | 一个共享解析服务；集成测试断言三处一致 |
| 橱窗流程被误伤 | 所有 DIY 用户数字变化 | 不带参数路径保持原逻辑；回归测试 + 手走一遍 |
| 等价组划错（形态不同却归一组） | 换到不适用的原料 | 营养师定稿；跨组不自动；组可停用/回滚；保留逐食谱例外 |
| 分组依据不充分/来源不可靠 | 规则站不住，出问题无法追溯 | 每组必须带文献、安全边界、审核人；草稿不参与线上替换；来源等级写死 |
| 删除仍在使用的分组 | 历史配方/原料指向空组 | 有原料或历史引用只能停用（软删）；删除前提示影响范围 |
| 底栏三颗按钮小屏挤 | 文案换行、误触 | 375pt 校过；小屏退化为两行；服务入口用图标+短文案 |
| 营养目标 key 中英混用 | 组匹配失败、静默不替换 | P2-A3 先做 key 归一，再加组 |
| 候选数据为空 | P2 做完仍只能回退原原料 | 未分组按原逻辑走；后台有一页看全 35 种原料的分组状态 |
| 冻结的产品/链接继续显示 | 顾客点进 404 | P1 先去掉冻结产品与链接；购买只走实时报价 |
| 删页面漏改测试 | 构建绿但测试红 | 同一任务里删页面+改测试+跑全量 |
| 部署顺序反了 | 静默退回最新版 | 写进上线清单，后端先行 |

---

## 交付节奏

- **P1 结束**：老板能在体验版上看到合并后的交付页、可改天数的 DIY 配置，客服入口到位。
- **P2 结束**：补剂换产品不再需要重新交付，缺货自动换等价原料。
- **P3 结束**：视觉统一，交付页达到可对外展示的精细度。
- **P4**：上线并留验收记录。
