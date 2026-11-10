# 快递电子存根识别 → 自动填写发货表单（含硬锁） 设计方案

- 日期：2026-11-10
- 状态：**已确认**（2026-11-10 22:4x，老板拍板 §1；待办只剩实施）
- 工位：`task/20261110-waybill-ai-ship`
- 旁证：`2026-11-04-procurement-reimbursement-ai-design.md`（识别只出草稿的口径）
- 证据来源：本仓库代码实测（`backend/src`、`miniapp/src`、`schema.prisma`），2026-11-10 21:30–22:40

---

## 0. 一句话

员工发货时传一张顺丰（或其它快递）的**电子存根**，AI 读出「承运商 / 运单号 / 实际运费」自动填进发货表单，
**填之前先拿存根上的收件人跟这单的收货人比一遍**：对得上才允许发货；对不上就拦住、不许发。

**这不是"加个上传块"，是改发货主链路** —— 服务端要能证明「这个运单号，是对着这单的收货人核对过的」。

---

## 1. 老板已拍板的事（2026-11-10）

| # | 议题 | 决定 |
|---|---|---|
| 1 | 入口 | 订单中心点「发货」时的发货表单里，加上传电子存根的入口 |
| 2 | 模型配置 | **复用采购管理那份**（`PROCUREMENT_SKU_DRAFT` 用途），不新增一套要配的密钥 |
| 3 | 填哪几项 | 物流公司 / 运单号 / 实际运费 |
| 4 | 要不要自动提交 | **不要**。最后一下「确认发货」永远由人点 |
| 5 | 读不出来的字段 | **留空，不猜** |
| 6 | 收件人对不上 | **硬拦** —— 不是"红条提示一下"，是**真的发不出去** |
| 7 | 拦住之后怎么办 | 先回订单**改收货地址**，改对了再回来传这张存根 |
| 8 | 拦截强度 | **没验过存根、或验完对不上 → 不许发货**（服务端拒） |
| 9 | AI 完全认不出来时 | **留一条口子**：允许「手打单号 + 二次确认」，留痕可查 |
| 10 | 拆包（1 单几箱） | 一箱一张存根，可传多张 |
| 11 | 合并（几单 1 箱） | 一箱一张存根，这个号要落到这几张单上 |
| 12 | 补剂单 | 一起做；**并在补剂发货弹窗里补一个改收货地址的小面板**（现在只能看不能改） |
| 13 | 历史背景 | 至今没贴错过单 —— 目标是省事；硬锁是为了不让新入口带来新风险 |

---

## 2. 现状证据（代码实测）

| 事实 | 位置 |
|---|---|
| 发货表单只有三个填项：物流公司（picker）/ 物流单号 / 实际运费 | `miniapp/src/pages/staff-orders/detail.vue` §发货弹窗 |
| 补剂单发货弹窗是同一套三个字段 | `miniapp/src/pages/staff-supplement-orders/detail.vue` §发货弹窗 |
| 「合并发货」页每个包裹各有 承运商 / 运单号 / 运费 | `miniapp/src/pages/staff-orders/batch-ship.vue` |
| 一票里包裹可跨订单：`order_shipment_package_item` 记着「这包里有哪张单的几袋」 | `order-shipment.service.ts` |
| 提交时**每张订单的单号取「这单自己所在的最靠前那个包裹」** | 同上（`ownPackage`） |
| 所以「几单合并成一箱 → 一个号落到几张单」**已是现有行为** | 同上 |
| **运单号有三个写入点，互不相通**：① 单笔发货只写 `order.tracking_number`（不建包裹）② 合并发货写 `order_shipment_package` 再回写 `order` ③ 补剂单写 `supplement_order.tracking_number` | `order.service.ts` / `order-shipment.service.ts:222,313` / `supplement-order.service.ts` |
| 订单收货信息：`Order.shippingAddressSnapshot`（下单快照）+ `Order.address` | `schema.prisma` |
| 补剂单：`SupplementOrder.shippingAddressSnapshot`，形状与鲜食**完全一致** | `supplement-order.service.ts:1260` |
| 地址快照形状：`{recipientName, phone, region:{province,city,district}, detail}` | `order.entity.ts` `updateAddress` |
| **鲜食单**发货前可改地址（状态不是 SHIPPED/COMPLETED/CANCELLED 即可） | `staff-orders/detail.vue` `canEditAddress` |
| **补剂单在小程序里只能看地址，没有任何编辑入口** | `staff-supplement-orders/detail.vue`（全文无 address form） |
| 补剂单代改地址**只有后台网页有**，且 `@UseGuards(AdminGuard)` **仅管理员** | `admin-supplement-shop.controller.ts:384`、`SupplementOrdersPanel.vue:227` |
| 采购识图已有整套可复用：上传 COS → 视觉模型 → 只出草稿不落库 | `procurement-sku-draft.service.ts` |
| 模型配置走 `AgentProviderConfigService`，采购用途 purpose = `PROCUREMENT_SKU_DRAFT` | `agent-provider-config.service.ts:21` |
| 采购配额 **30 次/人/天**、3000 次/系统/月 | `procurement-sku-draft-quota.service.ts` |
| 承运商清单**不一致**：鲜食/补剂弹窗 6 家，合并发货页 8 家（多申通、邮政包裹） | `staff-orders/detail.vue:1030` vs `batch-ship.vue:125` |
| 一票内两个包裹禁止同号；**跨票不查重** | `order-shipment.service.ts:150` |

**结论**：三个填项正好是存根上印着的东西；合并/拆包的数据模型天然「一包一号」，
本期不用动 `order_shipment` 那套表。真正要加的是两件事：**怎么把图变成值**、**怎么证明这个值验过**。

---

## 3. 数据流

```
员工点「发货」
   ↓ 存根上传块：拍照 / 从相册选
uni.uploadFile → POST /staff/shipping/upload-receipt
   ↓ COS：shipping-waybill-receipts/<时间>-<随机>.jpg（读完即弃，不落库）
POST /staff/shipping/receipt-recognize  { imageUrl, orderIds: [...] }
   ↓ 后端：取地址 → 查重 → 调模型 → 归一 → 比对 → **落一行结论**
   ↓ { checkId, receipt, match }
前端按 match.status 渲染：
   match   → 绿条，三项填进去，「确认发货」可用
   unknown → 黄条，三项填进去，提醒自己看一眼
   mismatch → 红条，一项都不填，「确认发货」不可用
   duplicate → 红条，说明这个号已在哪张单上
   degraded/not_waybill → 红条 + 「手动填写」出口
   ↓
点「确认发货」→ 命中已有发货接口
   ↓ 服务端**再验一遍**：这单 + 这个号，必须有一条验过的记录
   不通过 → 400「这单的运单号还没核对过」，单据一律不落库
```

---

## 4. 识别字段与提示词口径

模型输出（读不到一律 `null`，**绝不编造**）：

```json
{
  "documentType": "waybill_receipt",
  "carrierName": "顺丰速运",
  "trackingNumber": "SF0204691009893",
  "shippingFee": 56,
  "recipient": {
    "name": "张赛珺",
    "phoneMasked": "186****2107",
    "address": "上海市上海市普陀区礼泉路700弄55号703"
  },
  "sender": { "name": "赵晨", "address": "四川省成都市锦江区牡丹街257号…" },
  "productName": "肉食品",
  "weightKg": 3.5,
  "shippedAt": "2026-11-10 19:54:58",
  "confidence": { "trackingNumber": "high", "shippingFee": "high", "recipient": "high" }
}
```

提示词里必须写死的几条：

| 规则 | 理由 |
|---|---|
| 运单号**只认图上真的印着的那串**，不许按「SF + 13 位」的常识补位 | 补一位就是一个不存在的号 |
| 顺丰单号可能带 `SF` 前缀也可能不带，**照抄** | 不同渠道单据写法不一样 |
| 运费只取「运费 / 寄付现结」那一笔；有保价费、合计、原价多个金额时取**这单实际支付的运费** | 拿错一个金额，成本统计就错 |
| 图上没有运费（月结账号常见）→ `null` | 空着让人填 |
| 承运商看不出就给 `null`，不许按单号前缀硬猜 | 猜错会填成别家 |
| 不是快递存根/面单 → `documentType: "other"` | 传错图要当场说清楚 |
| 收件人手机通常是打码的（`186****2107`），**照抄打码后的样子** | 还原不了，也涉及隐私 |

---

## 5. 承运商归一 + 清单对齐

### 5.1 归一字典

| 存根上的写法（含别名） | 代码 |
|---|---|
| 顺丰、顺丰速运、SF、SF EXPRESS | `SF` |
| 京东、京东物流、京东快递、JD | `JD` |
| 圆通、圆通速递、YTO | `YTO` |
| 中通、中通快递、ZTO | `ZTO` |
| 申通、申通快递、STO | `STO` |
| 韵达、韵达速递、YD | `YD` |
| EMS、邮政特快、邮政特快专递 | `EMS` |
| 邮政包裹、邮政、POSTB | `POSTB` |

### 5.2 顺手把三处清单对齐（这是修 bug，不是扩范围）

现状：鲜食/补剂弹窗只有 6 家（**没有申通、没有邮政包裹**），合并发货页 8 家。
也就是说今天走申通寄的单，员工根本没法正确记录。

做法：抽一份共享清单（8 家）放在 `miniapp/src/constants/carriers.ts`，
`staff-orders/detail.vue` / `staff-supplement-orders/detail.vue` / `batch-ship.vue` 三处都读它。

> 后端侧：`carrierCode` 是自由字符串，加两家不需要 migration。
> 已经发出去的老订单存的还是老代码，不受影响。

识别出的承运商**不在清单里**（以后出现别家快递）→ 只填单号、运费，承运商下拉不动，挂黄字说明。

---

## 6. 收件人比对

### 6.1 两侧数据

| 存根侧（AI 读） | 订单侧（数据库） |
|---|---|
| `recipient.name` | `shippingAddressSnapshot.recipientName` |
| `recipient.phoneMasked` | `shippingAddressSnapshot.phone` |
| `recipient.address`（一整句） | `region.{province,city,district}` + `detail` |

鲜食/试吃装读 `Order.shippingAddressSnapshot`，为空退回 `Order.address`；
补剂单读 `SupplementOrder.shippingAddressSnapshot`。字段同名，**一份比对代码两种单都能用**。

### 6.2 三项怎么比

| 项 | 规则 | 强度 |
|---|---|---|
| **手机** | 只比**后 4 位**（存根打码只能读到尾巴） | 强 |
| **姓名** | 去空格、全半角归一后逐字相等；`张*` 这类打码只比第一个字 | 中 |
| **地址** | ① 存根地址句子里能否找到订单的 `region.district`<br>② `detail` 去空格标点后互相包含（≥ 8 字）算命中<br>③ 直辖市「上海市上海市」叠写先归一 | 中 |

> 不比省：省的写法差异最大（「上海市」vs「上海」），比了会误拦。
> 员工真正会填错的是「同一个人、换了收件地址」，区县 + 详细地址已经抓得住。

### 6.3 判定（按顺序，命中即停）

```
第 1 步：运单号查重（口径见 §6.4）
   已在别的单 / 别的包裹上   →  duplicate（红，拦）
第 2 步：手机尾号
   都读到且不同              →  mismatch（红，拦）
   都读到且相同              →  agree +1
第 3 步：区县
   都读到且不同              →  mismatch（红，拦）
   都读到且相同              →  agree +1
第 4 步：姓名
   都读到且不同              →  conflict +1（只记录，不拦）
第 5 步：收口
   agree ≥ 2 且 conflict = 0 →  match（绿）
   其它                       →  unknown（黄）
```

**为什么姓名冲突不拦**：代收人很常见（「张赛珺」下单、存根写「张三」）。硬拦会拦住正确的单。
硬拦只给两条铁证：**号被别人用过**、**手机或区县明确不同**。

### 6.4 查重口径（三处写入点都要查）

| 查哪里 | 条件 |
|---|---|
| `order.tracking_number` | 状态不是 `CANCELLED`；排除本次的 `orderIds` |
| `supplement_order.tracking_number` | 状态不是 `CANCELLED`；排除本次的 `orderIds` |
| `order_shipment_package.tracking_number` | 排除「包含本次任一 orderId 的票」（本票自己不算重复） |

- **本单自己的历史单号**不算冲突（重新发货 / 改正单号时会用到）
- **已取消的老单**不算（多半是当时填错作废的）
- 合并发货本来就会几张单共用同一个号，所以必须按「同票排除」而不是「同号即冲突」

---

## 7. 硬锁怎么落地（本方案的核心）

### 7.1 一句话

**发货接口不信前端。** 提交时必须能查到「这单 + 这个运单号」的核对记录，且记录里的地址与当前地址一致。

### 7.2 新表 `waybill_receipt_record`

一行 = 一次识别 / 一次手动填写。**同时承担配额计数与审计**（不再单开配额表）。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | uuid | |
| `tracking_number` | varchar(64)? | 识别/手填的运单号；彻底失败为 null |
| `carrier_code` | varchar(32)? | 归一后的承运商 |
| `order_ids` | varchar[] | 这次针对哪些订单 |
| `status` | varchar(20) | `MATCH` / `UNKNOWN` / `MISMATCH` / `DUPLICATE` / `MANUAL` / `DEGRADED` / `NOT_WAYBILL` |
| `conflicts` | json? | 哪几条对不上（字段、应有值、实读值） |
| `receipt` | json? | 识别出的原始结构（**不含图片**） |
| `address_fingerprints` | json? | `orderId → 当时的地址指纹` |
| `degraded_reason` | varchar(40)? | `model_timeout` / `quota` / `parse_error` |
| `manual_reason` | varchar(200)? | 手填原因（`MANUAL` 时必填） |
| `created_by` | varchar(36) | 员工 |
| `created_at` | datetime | |

索引：`(tracking_number)`、`(created_at)`、`(created_by, created_at)`。

**地址指纹** = `sha1(归一后的 姓名|手机|省|市|区|详细地址)`。
员工改过地址 → 指纹变 → 之前那条核对记录**自动失效**，必须重传存根。
这就是老板说的「改对了再回来传」。

### 7.3 三个发货接口的校验

| 接口 | 位置 | 校验粒度 |
|---|---|---|
| `POST /admin/orders/:id/ship` | `order.service.ts` `shipOrder` | 这 1 张单 × 提交的单号 |
| `POST /admin/order-shipments` | `order-shipment.service.ts` | **每个包裹里的每张单 × 该包裹的单号** |
| `POST /admin/supplement-shop/orders/:id/ship` | `supplement-order.service.ts` `shipOrder` | 这 1 张补剂单 × 提交的单号 |

校验函数（放 `application/shipping/waybill-receipt-guard.service.ts`）：

```
assertVerified({ orderIds: [...], trackingNumber, addressFingerprintOf })
  → 找到 order_ids ⊇ orderIds 且 tracking_number = 该号
    且 status ∈ {MATCH, MANUAL} 且 address_fingerprints 与当前地址一致的记录
  → 找不到就抛 400：
    「这单的运单号还没核对过（或核对没通过）。请先上传电子存根；
      如果存根认不出来，走「手动填写并确认」。」
```

- `shippingType = NOT_REQUIRED`（自用单）**不校验**（没有快递单号）
- 校验在**事务开始之前**做，失败什么都不落库

### 7.4 手动填写出口（老板第 9 条）

只有**AI 完全读不出来**时可用：
`DEGRADED` / `NOT_WAYBILL` / 配额用完 / 承运商不在清单但号没读出来。

前端点「手动填写单号」→ 弹窗「系统没法核对这个号是不是这单的，确定要手动填吗？」→ 填原因 → 
`POST /staff/shipping/manual-waybill { orderIds, trackingNumber, reason }` → 落一行 `MANUAL`。

**mismatch 状态下不提供手动出口**（前端不给按钮，后端也拒）：
服务端检查「同一 trackingNumber + 有交集的 orderIds」是否已存在 `MISMATCH` 记录，
存在就拒。否则硬锁形同虚设。

### 7.5 误拦了怎么办（兜底）

硬拦 + 无强制放行，所以必须有一条真的能走的路：

| 拦的原因 | 出路 |
|---|---|
| 收件人对不上 | 改收货地址（鲜食：页面已有；补剂：本期新加）→ 重新上传存根 |
| 号在别的单上 | 红条直接点名「这个号已经在 单号 XXX 上」；确认是不是拿错存根 |
| AI 认不出来 | 手动填写 + 二次确认 + 留痕 |

三条都不通的极端情况（比如地址改了但快递面单不能重打）：找管理员在后台处理，**不提供一键跳过**。

---

## 8. 界面

### 8.1 单笔发货（鲜食 / 试吃装 / 补剂）

发货弹窗**最上面**加一条横条式上传块（沿用「新增采购商品」那块同视觉语言）：

| 状态 | 样子 | 「确认发货」 |
|---|---|---|
| 空闲 | `📷 传一张快递存根，自动填单号和运费` | 禁用 |
| 识别中 | `识别中…` | 禁用 |
| 绿 · 已核对 | `✓ 已核对 · 顺丰速运 SF0204691009893 · ¥56.00` | **可用** |
| 黄 · 未能核对 | 上行 + `收件人没能核对，请自己看一眼` | **禁用**（要先解决） |
| 红 · 对不上 | 见 §8.3 | **禁用** |
| 红 · 号被占 | `这个号已经在 单号 XXX 上` | 禁用 |
| 红 · 认不出来 | `这张图里没找到运单号` + 「手动填写」 | 禁用 → 手动后可用 |

填进去之后三项**仍然可以改**，但**改单号 = 之前那条核对记录作废**，会重新要求核对。
（改承运商、改运费不影响核对。）

### 8.2 合并 / 拆包发货（`batch-ship`）

每个包裹卡片的字段区顶部各放一个小号上传块（`传这张包裹的存根`）：

- **拆包**：包 1、包 2 各传一张，互不影响
- **合并**：一箱传一张，这一票的号按现有逻辑落到这箱里的每张单上
- **拦住**：只锁那一个包裹；其它包裹照填
- 底部「确认发货」：**只要有一个包裹没核对通过，就点不了**，并指出是第几个包裹

识别时传的 `orderIds` = 这一票的全部订单（它们必然同地址）；落库后每张单都能对上。

### 8.3 拦截文案

```
⚠ 这张存根不是这单的

存根上写的是：张赛珺 · 186****2107 · 上海市普陀区礼泉路700弄55号703
这单的收货人：李四 · 139****0011 · 北京市朝阳区建国路88号

先回订单把收货地址改对，再回来传这张存根。
[ 去改收货地址 ]   [ 知道了 ]
```

「去改收货地址」：鲜食单打开详情页已有的地址面板；补剂单打开**本期新加**的面板（§9）。

---

## 9. 补剂单改收货地址（本期新增）

现状：小程序里补剂单只能看地址；后台网页有「管理员代改收货地址」，但**仅管理员**。

做法：
- 新增 `PATCH /staff/shipping/supplement-orders/:id/address`（`StaffGuard`），
  复用 `supplementOrderService.adminUpdateAddress`（它已经写原/新地址审计）
- 小程序补剂发货弹窗里加一个小面板：收件人 / 手机 / 省市区 / 详细地址 / **原因（必填）**
- 只允许在**未发货**状态改
- 谁改的、改成什么、为什么，都落审计

> ⚠️ 安全提示：这等于让员工也能改收货地址（原来只有管理员能）。
> 拦的是「打包间手上只有手机时被卡死」。如果老板希望只让管理员改，把这里的
> `StaffGuard` 换回 `AdminGuard` 即可 —— 一行的事。

---

## 10. 接口汇总

| 方法 | 路径 | 用途 |
|---|---|---|
| `POST` | `/staff/shipping/upload-receipt` | 上传存根（multipart）→ COS URL |
| `POST` | `/staff/shipping/receipt-recognize` | 识别 + 比对 + 落结论 |
| `POST` | `/staff/shipping/manual-waybill` | 手填单号（AI 认不出来时的出口） |
| `PATCH` | `/staff/shipping/supplement-orders/:id/address` | 补剂单代改收货地址 |

`POST /staff/shipping/receipt-recognize` 请求：

```json
{ "imageUrl": "https://…/shipping-waybill-receipts/1730xxxx-abcd.jpg", "orderIds": ["order-uuid-1"] }
```

响应（`data`）：

```json
{
  "checkId": "…",
  "receipt": {
    "documentType": "waybill_receipt",
    "carrierCode": "SF",
    "carrierName": "顺丰速运",
    "trackingNumber": "SF0204691009893",
    "shippingFee": 56.0,
    "recipientName": "张赛珺",
    "recipientPhoneMasked": "186****2107",
    "recipientAddress": "上海市上海市普陀区礼泉路700弄55号703"
  },
  "match": {
    "status": "match",
    "conflicts": [],
    "expected": { "recipientName": "张赛珺", "phoneTail4": "2107",
                  "regionText": "上海市普陀区", "detail": "礼泉路700弄55号703" }
  }
}
```

`match.status` ∈ `match` / `unknown` / `mismatch` / `duplicate` / `degraded` / `not_waybill`。
`conflicts` 每项 `{ field, expected, actual }`，前端据此说清「哪一条对不上」。

---

## 11. 后端结构

| 文件 | 职责 |
|---|---|
| `application/shipping/waybill-receipt.prompt.ts` | 提示词 + 模型输出收口 |
| `application/shipping/waybill-receipt-match.ts` | **纯函数**：姓名/手机/区县/详细地址比对与判定（单测主战场） |
| `application/shipping/carrier-catalog.ts` | 承运商归一 |
| `application/shipping/waybill-receipt.service.ts` | 编排：配额 → 查重 → 调模型 → 归一 → 比对 → 落库 |
| `application/shipping/waybill-receipt-guard.service.ts` | **发货前校验**（三个发货接口共用） |
| `interfaces/controllers/staff-shipping.controller.ts` | 四个新端点 |

模型注入：`@Inject(WAYBILL_RECEIPT_MODEL)`，`app.module.ts` 里 `useValue: { callDeepSeekJson }`（与采购同一种写法，测试里替换掉）。

模型配置：`agentConfig.getEnabledDeepSeekRuntimeConfig({ purpose: PURCHASE_REIMBURSEMENT_AGENT_PURPOSE })`。

---

## 12. 配额

不用单独的配额表 —— 直接数 `waybill_receipt_record` 当天的行数（`created_by` + `created_at`）。

上限：**每人每天 100 次**、**全系统每月 10000 次**。

- 先落行再判断（被拒那次也计数），与采购口径一致
- **超了不等于发不了货**：降级成 `DEGRADED`，走「手动填写」出口
- 配额只是挡住刷 AI 的钱，不挡发货

---

## 13. 失败与降级总表

| 情况 | 表现 | 填了吗 | 能发货吗 |
|---|---|---|---|
| 核对通过 | 绿条 | 三项 | ✅ |
| 承运商不在清单 | 黄字说明 | 单号、运费；承运商不动 | 需先核对（属 unknown → 需手动出口） |
| 运费读不到 | 黄字 | 承运商、单号 | 同上 |
| 收件人没能核对 | 黄条 | 三项 | ❌ 需手动出口 |
| 收件人明确不同 | **红条拦住** | 一项都不填 | ❌ 只能改地址后重传 |
| 号已被别的单用过 | **红条拦住 + 点名** | 一项都不填 | ❌ 只能换存根 |
| 不是快递存根 | 红字 | 不填 | ❌ 需手动出口 |
| 模型超时/报错 | 红字 | 不填 | ❌ 需手动出口 |
| 配额用完 | 红字 | 不填 | ❌ 需手动出口 |
| 无需发货 | 不出现上传块 | — | ✅（不校验） |

> 「需手动出口」= 员工点「手动填写单号」→ 二次确认 → 填原因 → 才能发货。
> 这一条是为了「AI 抽风那天打包间不至于停摆」，老板 2026-11-10 22:4x 明确保留。

---

## 14. 测试计划

| 层 | 用例 |
|---|---|
| 比对纯函数（重点） | 全等 / 手机不同 / 区县不同 / 只有姓名不同（→ unknown 不拦）/ 存根没印地址 / 直辖市叠写 / 打码姓名「张*」/ 订单地址为空 / 手机只剩 2 位 |
| 承运商归一 | 顺丰速运 / 顺丰 / SF EXPRESS / 京东快递 / null / 没见过的名字 |
| 查重 | 号在别的鲜食单 / 别的补剂单 / 别的包裹 / **本票其他单（不算）** / 本单自己历史号（不算）/ 已取消单（不算） |
| **发货硬锁** | 鲜食单笔：没记录 → 400；记录 match → 通过；**改过地址后旧记录失效** → 400；mismatch 记录在手 → 400 |
| | 合并发货：每个包裹每张单逐个校验；一包裹缺记录整票 400 且不落库 |
| | 补剂单：同上 |
| | `NOT_REQUIRED` 不校验 |
| 手动出口 | 有 DEGRADED 记录 → 可手动；有 MISMATCH 记录 → 拒绝手动 |
| 地址指纹 | 改了详细地址 / 只改了空格 → 指纹是否该变 |
| 接口层 | 缺参 400；非员工 403；补剂改地址非本人顾客 400 |
| 回归 | 三个发货入口的原有字段、原有校验一个字不变；后台网页发货不受影响（后台走同一 service，会一起被硬锁） |
| 真机 | 鲜食传存根发货 / 补剂传存根发货 / 拆 2 包各传一张 / 故意传上一单的存根（必须被拦且发不出去） |

> ⚠️ **回归重点**：硬锁挂在这三个 service 上，**后台网页（admin-web）的发货也会被拦**。
> 后台那条路上没有上传存根的入口，所以只能走「手动填写」——
> 要么给后台也留手动出口，要么后台发货保持旧行为（不校验）。
> **本方案选后者**：`order.service.ts` / `supplement-order.service.ts` 的校验里，
> 只有「员工小程序来的请求」才强制（用一个显式参数区分），后台网页不受影响。
> 理由：后台是管理员在操作，本来就该有最终裁量权；硬锁要防的是打包间批量发货时的错手。

---

## 15. 非目标（本期不做）

- **不保存存根图片**（只用来读；COS 里按目录定期清）
- 不做「识别完自动提交发货」
- 不做一键强制放行
- 不做顺丰官方面单下单 / 面单打印 / 轨迹查询
- 不支持「一张存根对应两个包裹」
- 不改 `order_shipment` 那套表
- 不把存根上的托寄物、重量、寄件时间写进订单
- 不做 admin-web 的上传入口

---

## 16. 我替你做的决定（可以推翻）

| # | 决定 | 理由 |
|---|---|---|
| 1 | 存根图**不留档**，但结论行留档 | 图要权限、清理、隐私三摊事；结论行能回答「当时为什么放过/拦住」，几乎零成本 |
| 2 | 核对结论表**兼做配额计数**，不另开表 | 少一张表少一次迁移，量级（百/天）完全够 |
| 3 | 承运商清单**对齐成 8 家**并抽共享常量 | 现状是 bug：走申通的单根本没法正确记录 |
| 4 | 比对**只比区县 + 详细地址**，不比省 | 省写法差异大，比了会误拦 |
| 5 | 姓名冲突**只降级 unknown，不拦** | 代收人常见，硬拦会拦正确的单 |
| 6 | 改单号 = 核对记录作废，改承运商/运费不作废 | 只有号是"要验的东西" |
| 7 | 后台网页（admin-web）发货**不受硬锁约束** | 管理员本来就该有最终裁量权；硬锁防的是打包间批量错手 |
| 8 | 上传块做成**一个共享组件**，三个入口共用 | 三处视觉和行为必须一致 |
| 9 | 补剂改地址**也允许员工**（原仅管理员），必填原因 + 落审计 | 打包间手上只有手机；要收口就换回 `AdminGuard`，一行的事 |

---

## 17. 与上一版（21:30 稿）的差异

| 项 | 上一版 | 现在 | 原因 |
|---|---|---|---|
| 拦截 | 只拦「自动填」，手填照样能发 | **服务端硬锁**，没验过/对不上就发不出去 | 老板 22:4x 拍板 |
| 数据表 | 只有配额表 | 一张 `waybill_receipt_record` 兼做结论/审计/配额 | 硬锁需要"提交时能查到验过" |
| AI 认不出来 | 退回手填（无条件） | 手填要**二次确认 + 留痕**，且 mismatch 状态下**不给**手填 | 老板保留了口子，但不能是后门 |
| 补剂改地址 | 说"已有，不用做" | **实测没有**，本期新加 | 复核发现文档断言不实 |
| 承运商 | 只说"降级 + 黄字" | **同时把三处清单对齐成 8 家** | 现状缺申通/邮政，是 bug |
| 后台网页 | 没提 | 明确**不受硬锁约束** | 否则后台发不了货 |
