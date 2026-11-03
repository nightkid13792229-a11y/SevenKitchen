# 免费重做改造 · 方案 B 详细设计（0 元重做单）

> 日期：2026-09-19
> 上游：`2026-09-19-aftersale-chain-audit.md`（发现「免费重做」静默失败）
> 状态：**✅ 已实施并部署（2026-09-19）**
>
> 已按第九节建议全部落地：B1 顾客只看到原单 / 管理员手选制作日 / 重做完成后原单自动结案 / 一并修了 P2。
> 端到端验证 **17/17 项通过**（见 `backend/prisma/verify-remake-flow.ts`）。

---

## 一、先讲清楚依赖：订单的完整生命周期

排查中发现，采购与生产**各取不同状态的订单**，这决定了重做单必须从哪一步进入：

```
下单 → PENDING_PAYMENT ──支付──▶ PAID
                                   │
                    采购清单只取 PAID 订单（按 targetProductionDate）
                                   ▼
                              （采购完成）→ PURCHASING
                                   │
                    生产排产只取 PURCHASING 订单（且条目 productionBatchId 为空）
                                   ▼
                       分配条目 → IN_PRODUCTION → FREEZING → SHIPPED → COMPLETED
```

**证据**：
- `purchasing.service.ts:2068 / 2306 / 2439` → 查询条件 `status: OrderStatus.PAID`
- `production.service.ts:137 / 153` → 查询条件 `status: OrderStatus.PURCHASING`，且非 PURCHASING 直接抛错
- `prisma-production.repository.ts:93` → 只分配 `production_batch_id IS NULL` 的条目

### 由此得出的关键结论

> **重做单必须建成 `PAID` 状态**，才能自动被采购清单接手，走完后面全部环节。
> （我原先设想的"直接置为 PURCHASING"会**跳过采购**，是错的。）

---

## 二、为什么现状会静默失败（回顾）

`resolveAftersale('remade')` 目前只做 `order.transitionTo(IN_PRODUCTION)`：

| 关卡 | 结果 |
|------|------|
| 采购清单只取 PAID | 重做单是 IN_PRODUCTION，跳过 |
| 生产排产只取 PURCHASING | 不在候选，且显式校验会抛错 |
| 只分配未分配条目 | 原条目**还挂着上一批的批次号** |

→ 订单显示"生产中"，但**没有任何批次产生，货永远不会产出**。

---

## 三、数据模型

`Order` 表加一对**自关联**：

```prisma
model Order {
  // ...既有字段...

  /// 本单是"原单的重做"：指向原单；为空表示这是一张正常订单
  remakeFromOrderId String? @unique @map("remake_from_order_id")
  remakeFromOrder   Order?  @relation("OrderRemake", fields: [remakeFromOrderId], references: [id], onDelete: SetNull)
  /// 原单反向指向它的重做单
  remakeOrder       Order?  @relation("OrderRemake")
}
```

| 设计点 | 理由 |
|--------|------|
| `@unique` | **数据库级**保证"一张原单最多被重做一次"，防重复 |
| 自关联而非新表 | 重做单本来就是一张订单，复用全部既有能力（采购/生产/物流/售后） |
| `onDelete: SetNull` | 删原单不会连带删重做单 |

**重做单的识别**：`remakeFromOrderId IS NOT NULL`。这一个条件同时解决"是不是重做单"和"报表要不要排除"。

---

## 四、字段取值对照

| 字段 | 原单 | 重做单 |
|------|------|--------|
| `status` | 保持 `AFTERSALE` | **`PAID`**（进采购清单） |
| `amountProduct` / `amountShipping` / `amountTotal` | 不变 | **全部 0** |
| `paymentStatus` | 不变 | `SUCCESS`（否则与 PAID 不自洽） |
| `paidAt` | 不变 | 创建时间 |
| `paymentMethod` | 不变 | `null`（0 元单不产生真实支付流水） |
| `targetProductionDate` | 不变 | **下一个制作日**（需你确认口径） |
| `remakeFromOrderId` | `null` | **原单 id** |
| `items` | **完全不动**（历史完整保留） | **复制原单条目**，`productionBatchId = null`（新条目天然为空） |
| `dogId` / `addressId` / 地址快照 | 不变 | 复制原单 |

> ⚠️ **重做单必须复制原单的 `recipeSnapshot`**，而不是按当前食谱重新生成。
> 重做的语义是"**同样的东西再做一份**"，即使这段时间食谱改过版本，也应还原原单那一版。

---

## 五、业务流程改动

### 5.1 后台点「安排重做」

```
resolveAftersale(orderId, 'remade')
  1. 校验原单：status = AFTERSALE 且 aftersaleType = REMAKE 且 尚无重做单
  2. 创建重做单（复制条目、0 元、PAID、指定制作日）
  3. 原单关联 remakeOrderId
  4. 两边各写一条状态流转历史
```

### 5.2 采购与生产侧：**零改动**

重做单就是一张普通 `PAID` 订单，采购清单与排产会自动接手。

### 5.3 顾客侧

- **订单列表**过滤掉重做单（`remakeFromOrderId = null`）
- **原单详情**展示"已安排重做" + 重做进度

---

## 六、顾客可见性（需要你选）

| 方案 | 顾客看到 | 实现成本 |
|------|----------|----------|
| **B1（推荐）** | **只有原单**，状态随重做单推进（重做中 → 已发货 → 已完成） | 中：列表过滤 + 详情做状态映射 |
| B2 | **两张单**：原单（售后中）+ 重做单（¥0） | 低：只做列表不过滤 |
| B3 | 重做单可见但**不作为独立卡片**，只在原单详情里列出 | 中低 |

> **我推荐 B1**：顾客申请的是"把这一单重做"，他关心的是"我那一单什么时候到"，
> 而不是"多了一张 0 元的单"。B2 会让顾客困惑（"为什么多了一个不要钱的订单？"）。

---

## 七、改动清单

| 层 | 文件 | 改动 |
|----|------|------|
| 库 | `prisma/schema.prisma` + migration | Order 自关联两字段 + 唯一索引 |
| 后端 | `order.service.ts` `resolveAftersale()` | remade 分支改为"创建重做单 + 关联" |
| 后端 | 新增 `createRemakeOrderFrom()` | 复制条目/地址/狗狗，0 元，PAID |
| 后端 | `orders.controller.ts` | resolve 返回体重做单号 |
| 后端 | C 端订单列表查询 | 过滤 `remakeFromOrderId IS NULL` |
| 后台 | `AftersaleManagement.vue` | 成功后提示"已生成重做单 SO-xxx" |
| 前台 | 订单详情（B1 需要） | 展示重做进度 |
| — | 统计查询 | 重做率 = 重做单数 ÷ 已完成订单数 |

---

## 八、风险与对策

| 风险 | 对策 |
|------|------|
| 0 元单污染**营收**统计 | 营收按 `amountTotal` 求和 → 加 0 无影响；报表另可用 `remakeFromOrderId IS NULL` 排除 |
| 0 元单污染**支付流水**统计 | `paymentMethod` 留空 + 按 `remakeFromOrderId` 识别 |
| 同一单被重做多次 | `remakeFromOrderId @unique` 数据库级阻断 |
| 原单批次/成本历史被破坏 | **完全不动原单**（这正是 B 优于 A 的核心） |
| 重做成本统计 | 重做单走正常流程，成本自动进 `costSettlements` ✓ |
| 制作日期选哪天 | 见第九节待定项 |
| 原有测试受影响 | `resolveAftersale` 行为改变，需同步更新相关测试 |

---

## 九、需要你定的 4 件事

| # | 问题 | 我的建议 |
|---|------|----------|
| 1 | **顾客可见性**：B1 / B2 / B3 | **B1**（只给顾客看原单，进度随重做单走） |
| 2 | **制作日期**：默认"下一个制作日"，还是让管理员在弹窗里**手动选**？ | **让管理员选**（重做常出现在生产排期紧的时候，需要人工判断插到哪天） |
| 3 | **原单最终状态**：重做完成后，原单要不要自动变成 `COMPLETED`？ | 建议**要**（否则顾客的订单列表会永远挂着一张"售后中"） |
| 4 | **是否同时修 P2**（订单列表的「申请售后」写死 REFUND） | 建议一并修，改动很小 |

---

## 十、实施分期

| 期 | 内容 | 结果 |
|----|------|------|
| **一期** | 库 + 后端创建逻辑 + 顾客列表过滤 + 后台提示 | **重做能真正走通**（核心问题解决） |
| 二期 | 原单详情展示重做进度（B1 完整体验）+ 原单自动完成 | 顾客体验闭环 |
| 三期 | 重做率统计 | 数据可追溯 |
