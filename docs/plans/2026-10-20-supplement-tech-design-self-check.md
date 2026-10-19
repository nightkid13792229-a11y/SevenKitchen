# 技术方案自检报告（2026-10-20）

> 自检对象：[预分装补剂 · 技术方案 v1](2026-10-20-supplement-prepack-tech-design.md)
> 对照：[需求 v2](2026-10-19-supplement-prepack-requirements-v2.md)、[字段与模块字典](2026-10-19-supplement-field-module-dictionary.md)、当前后端代码与 Prisma schema。
>
> **结论：方案主体可开发；但有 1 个 P0 业务边界必须先拍板，2 个 P2 口径需要确认。未改任何业务代码。**

---

## 一、自检范围

| 维度 | 检查内容 |
|---|---|
| 需求一致性 | 字段、状态、默认值、权限、售后、自动完成、标签、快照、订单中心 |
| 字段/模块 | 是否重复新增、是否与字典冲突、是否漏定义、是否有第二落点 |
| 现有代码 | 实际方法/字段/守卫/支付回调/库存/制作单/标签/小程序传参 |
| 数据迁移 | 新表/新列/索引/部分唯一索引/回填/回滚 |
| 并发/异常 | 排期、分装、退款、补发、重复回调、并发操作 |
| 上线 | 配置旧默认值、特性开关、灰度、监控、回滚 |

---

## 二、P0：必须你拍板才能写代码

### SC-01 “已分装未发货”（PACKED）的退款/补发/发货边界

**问题**

需求 v2 3.8.1 允许 `PACKED / SHIPPED / COMPLETED` 申请售后，3.8.2 又说“原订单履约状态不变”。但 `PACKED` 还没发货：

- 如果退款成功还保持 `PACKED`，仓库可能继续发货；
- 如果允许 `PACKED` 补发，原单还没发，会出现“补发一张、原单又发一张”；
- 如果 `PACKED` 部分退款后仍发货，剩下一部分货怎么处理，没有规则；
- `PACKED` 的售后窗口从 `shippedAt` 起算，但此时 `shippedAt` 为空。

**方案里建议的默认规则（老板已确认，2026-10-20）**

| 场景 | 建议 |
|---|---|
| `PACKED` 申请类型 | **只允许全额退款**；不允许部分退款、不允许补发 |
| `PACKED` 有未完结退款 | `shipOrder` 拒绝发货，直到退款完成/驳回 |
| `PACKED` 全额退款成功 | 订单置 `CANCELLED`，写 `CANCELLED` 事件；**库存已在分装时消耗，不释放**（异常未扣减才释放） |
| `PACKED` 退款被驳回 | 允许正常发货 |
| `PACKED` 售后窗口 | 从 `packedAt` 起算 7 天；发货后仍按 `shippedAt` |
| `PACKED` 补发 | 不允许；提示“还未发货，直接等发货或申请全额退款” |
| `SHIPPED / COMPLETED` | 退款/补发都允许；订单履约状态不变；部分退款可做 |

**已确认口径**

- 已按建议执行：PACKED 只全额退款、不补发、退款成功取消、不释放已消耗库存、窗口按 packedAt；
- 需求 v2 3.8.1/3.8.2/3.8.3 已同步；
- P4 售后代码可以按此开工。

---

## 三、P1：已修正/已确认（不需要你拍板，但要知道）

| # | 问题 | 处理 |
|---|---|---|
| SC-02 | 订单中心统一状态组有“待处理 INIT”，但 `UnifiedStatusGroup` 类型漏了 `PENDING` | 已加 `PENDING`，映射 `OrderStatus.INIT` |
| SC-03 | 预占开关开启但分装时没有 ACTIVE allocation，可能静默不扣库存 | 正常分装拒绝并告警；管理员强制必须补 ledger + 事件 |
| SC-04 | 管理员改期没有限制状态，可能改已分装/已发货单 | 只允许 `PAID`；`PACKED/SHIPPED/COMPLETED/CANCELLED` 拒绝 |
| SC-05 | 自动完成时如果有未完结退款，是否跳过没写 | 不跳过；订单中心同时显示“已完成 + 售后中”，不隐藏 case |
| SC-06 | 快照后自动保存每次都新建制作单 | 冻结后先比内容哈希：一样返回旧单，变了才新建；查最新一张 |
| SC-07 | 补发单/0 元单再次购买可能复制 0 元价格 | 再次购买一律按当前商品价报价，不复制 0 元 |
| SC-08 | 员工金额可见性 | 已确认：员工不看订单金额/退款金额/管理员备注；staff DTO 脱敏 |
| SC-09 | 平勺库存单位 | 已确认：平勺按 `PCS` 入库，1 平勺=1 PCS，2000 平勺/瓶=2000 PCS；不换算成克 |
| SC-10 | `AftersaleCase.refundOutNo` 没唯一约束，且重复索引 | 改为 `@unique`，删除冗余 `@@index` |
| SC-11 | 历史 `amountGoods` 含服务费/包材，新单语义不同 | 旧单不重算；报表商品金额用 `amountSupplement`；新单 `pricingSnapshot.pricingVersion=2` |
| SC-12 | `InventorySourceType` 新值会让 `resolveSourceLabel` 的穷举 Record 报错 | 方案里明确要补映射，否则 `tsc` 不过 |
| SC-13 | 快照 recipeId 可能是 `Recipe.id` 或逻辑 id | 先按 `Recipe.id` 查，查不到按 `Recipe.recipeId` 取最新版本 |
| SC-14 | 快照 recipe/dog 与订单不一致 | 拒绝下单，不能冻结错单 |
| SC-15 | 快照 JSON 可能超 200KB | 截断非必填长文本 + 告警，不丢核心字段 |
| SC-16 | 退款回调先查旧订单字段，新 case 可能找不到 | 先查 `AftersaleCase.refundOutNo`，再回退旧 `SupplementOrder.refundOutNo` |
| SC-17 | `packOrder` 仍允许 `PACKING` | 保留 `PAID/PACKING` 兼容旧数据；新代码不写 `PACKING` |
| SC-18 | 现有后台旧接口 `/aftersale` `/refund` `/reship` 会断 | 过渡版本保留薄适配器，后台切新接口后删除 |
| SC-19 | 员工详情复用 admin `getOrderById` 会带金额 | 新增 staff DTO，不用原接口原样返回 |
| SC-20 | `CustomerMessage.linkType` 类型没有 `SUPPLEMENT_ORDER` | 补类型 union；跳转校验归属 |

---

## 四、P2：默认口径（你不反对就按这个做）

| # | 事项 | 默认 |
|---|---|---|
| SC-21 | `Order.type=CUSTOM_SERVICE` 在订单中心归哪类 | 归 `FOOD`，显示子类型“定制服务”；`CUSTOM_RECIPE` 只指 `CustomRecipeOrder` 表 |
| SC-22 | 退款管理页是否本轮接定制退款 | 本轮接补剂 + 现有鲜食；定制先只读/跳原页面，第二批迁移 |
| SC-23 | 订单中心路由 | 新建 `/orders/center`；旧 `/orders`、`/custom-recipes` 保留为处理页 |
| SC-24 | 售后 case 是否迁移鲜食/定制旧数据 | 本轮只迁移补剂；旧数据只读，第二批做 |
| SC-25 | 包邮门槛是否含包材 | 按纯商品金额；包材本轮 0，不影响当前数字 |
| SC-26 | 自动完成 10 天与售后 7 天 | 售后 7 天从发货起算；自动完成 10 天；两者独立 |
| SC-27 | 标签字体/排版 | 方案给了 40×60 字号，但**必须实物打样**才算验证；屏幕通过不等于纸上通过 |

---

## 五、自检发现但不需要改方案的事项

1. **现有 `quantityG/deltaG` 命名债**：不改字段名，按 base unit 用；代码注释/字典/UI 显示统一写清。
2. **历史 `amountGoods` 语义**：不重算，避免改历史财务数据。
3. **旧 `AFTERSALE` 状态**：不新写，只兼容；新售后用 `AftersaleCase`。
4. **旧 `refund*` 字段**：不新写，只读；退款回调保留兼容。
5. **`OrderCenterService` 命名**：不是补剂专用，独立 `order-center` 只读模块；不再叫 `SupplementOrderCenterService`。

---

## 六、结论与下一步

### 结论

- 技术方案与需求 v2/字段字典**主体一致**；
- 字段/模块没有发现重复新增；
- 现有代码的 14 个冲突已列入方案；
- **唯一阻塞开发的是 SC-01：PACKED 退款/补发/发货边界**；
- SC-21/22/23/24 是默认口径，你不反对就按默认做。

### 下一步

1. 你确认 SC-01 的建议规则（或给出你的规则）；
2. 确认 SC-21/22/23/24 默认口径没有异议；
3. 我进入 P0：Prisma schema + migration + DTO 骨架；
4. 迁移只生成、不 apply；先给你看 SQL 和 dry-run 报告，再决定是否执行。

> 本报告生成前没有改任何后端/小程序/admin-web 代码；只改了技术方案/需求/字典三类文档。
