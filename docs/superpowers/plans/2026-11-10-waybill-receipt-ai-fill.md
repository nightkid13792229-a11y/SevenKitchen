# 快递存根识别自动填单 + 发货硬锁 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 员工发货时上传一张快递电子存根，AI 读出承运商/运单号/运费自动填表；服务端在发货时校验「这个号是对着这单收货人核对过的」，没核对或对不上就不许发货。

**Architecture:** 新增一张核对记录表 `waybill_receipt_record`（兼做配额与审计）；识别走采购那套视觉模型配置；发货的三个 service 在事务前调同一个 `WaybillReceiptGuardService.assertVerified`。小程序侧一个共享上传组件接到三个发货入口。

**Tech Stack:** NestJS + Prisma + PostgreSQL（后端）、uni-app / Vue3 + vitest（小程序）、jest（后端测试）。

**Spec:** `docs/superpowers/specs/2026-11-10-waybill-receipt-ai-fill-design.md`（下称「方案」）

## Global Constraints

- 只出草稿式的「读不出来就 null」，**任何字段都不许猜**（方案 §4）。
- 识别失败一律降级，**不许抛 500**；但 `not_waybill` / `mismatch` / `duplicate` 是**给员工看的结论**，要原样返回（方案 §13）。
- 承运商只认归一字典里的 8 个代码：`SF` `JD` `YTO` `ZTO` `STO` `YD` `EMS` `POSTB`（方案 §5）。
- 确认收货人比对**只比区县 + 详细地址 + 手机后 4 位 + 姓名**，不比省（方案 §6.2）。
- 硬锁只对**小程序来的请求**生效（`enforceWaybillCheck: true`）；admin-web 不受影响（方案 §16 #7）。
- `shippingType = NOT_REQUIRED` 的请求**完全跳过**校验。
- 存根图片**不落库**；只存结论行，且结论行里**不许出现图片 URL**。
- 中文文案里的数字与方案一致；不要新增说明性文案到已上线页面。

## Review Focus

1. **存根图不是存根**（商品截图、聊天截图、身份证）→ 必须判 `not_waybill` 而不是硬读出一个号码。
2. **直辖市地址叠写**（`上海市上海市普陀区`、`北京市北京市朝阳区`）→ 归一后仍要能匹配上，不能误拦。
3. **合并发货复用同一个运单号**（一张存根落到几张单）→ 查重必须排除本票内其他单，否则正确操作被永久拦死。
4. **改过地址之后旧核对记录**→ 必须失效（指纹变），否则「改地址再传存根」这条唯一出路形同虚设。
5. **AI 完全认不出来那天**（模型超时 / 配额用完 / 图太糊）→ 必须有手动出口，否则打包间停摆。

---

### Task 1: 收货人比对纯函数

**Files:**
- Create: `backend/src/application/shipping/waybill-receipt-match.ts`
- Test: `backend/tests/application/shipping/waybill-receipt-match.spec.ts`

**Interfaces:**
- Produces:
  - `export interface AddressView { recipientName: string; phone: string; province: string; city: string; district: string; detail: string }`
  - `export interface ReceiptRecipientView { name: string | null; phoneMasked: string | null; address: string | null }`
  - `export type MatchStatus = 'match' | 'unknown' | 'mismatch'`
  - `export interface MatchConflict { field: 'phone' | 'name' | 'district'; expected: string; actual: string }`
  - `export function buildAddressFingerprint(view: AddressView): string`（`node:crypto` sha1，hex）
  - `export function normalizeName(raw: string | null | undefined): string`
  - `export function phoneTail4(raw: string | null | undefined): string | null`
  - `export function compareRecipient(receipt: ReceiptRecipientView, expected: AddressView): { status: MatchStatus; conflicts: MatchConflict[] }`

- [ ] **Step 1: 写失败的测试**

```ts
// backend/tests/application/shipping/waybill-receipt-match.spec.ts
import { compareRecipient, buildAddressFingerprint, phoneTail4, normalizeName } from '../../../src/application/shipping/waybill-receipt-match';

const expected = {
  recipientName: '张赛珺', phone: '18612342107',
  province: '上海市', city: '上海市', district: '普陀区',
  detail: '礼泉路700弄55号703',
};

it('手机尾号 + 区县都对上 → match', () => {
  expect(compareRecipient({
    name: '张赛珺', phoneMasked: '186****2107',
    address: '上海市上海市普陀区礼泉路700弄55号703',
  }, expected)).toEqual({ status: 'match', conflicts: [] });
});

it('手机尾号不同 → mismatch 并指出手机冲突', () => {
  const r = compareRecipient({ name: '张赛珺', phoneMasked: '186****0011', address: '上海市上海市普陀区礼泉路700弄55号703' }, expected);
  expect(r.status).toBe('mismatch');
  expect(r.conflicts).toEqual([{ field: 'phone', expected: '2107', actual: '0011' }]);
});

it('区县不同 → mismatch', () => {
  const r = compareRecipient({ name: '张赛珺', phoneMasked: null, address: '北京市北京市朝阳区建国路88号' }, expected);
  expect(r.status).toBe('mismatch');
  expect(r.conflicts[0].field).toBe('district');
});

it('只有姓名不同 → unknown，不拦', () => {
  const r = compareRecipient({ name: '张三', phoneMasked: '186****2107', address: '上海市上海市普陀区礼泉路700弄55号703' }, expected);
  expect(r.status).toBe('unknown');
  expect(r.conflicts.filter((c) => c.field === 'name')).toHaveLength(0);
});

it('存根没印地址、手机也读不出 → unknown', () => {
  expect(compareRecipient({ name: null, phoneMasked: null, address: null }, expected).status).toBe('unknown');
});

it('打码姓名只比第一个字', () => {
  expect(compareRecipient({ name: '张*', phoneMasked: '186****2107', address: '上海市普陀区礼泉路700弄55号703' }, expected).status).toBe('match');
});

it('手机打码到只剩两位 → 不参与判定', () => {
  expect(phoneTail4('186****07')).toBeNull();
});

it('地址指纹：空格与全角差异不影响，改详细地址会变', () => {
  const a = buildAddressFingerprint(expected);
  expect(buildAddressFingerprint({ ...expected, detail: ' 礼泉路700弄55号703 ' })).toBe(a);
  expect(buildAddressFingerprint({ ...expected, detail: '礼泉路700弄55号704' })).not.toBe(a);
});

it('normalizeName 去空格并归一全角', () => {
  expect(normalizeName(' 张 赛 珺 ')).toBe('张赛珺');
});
```

- [ ] **Step 2: 跑一遍确认它失败**

Run: `cd backend && npx jest tests/application/shipping/waybill-receipt-match.spec.ts`
Expected: FAIL —— `Cannot find module '.../waybill-receipt-match'`

- [ ] **Step 3: 实现纯函数**

规则（必须照做，不要自由发挥）：

- `phoneTail4`：只接受「打码串或完整手机号」里**末尾连续 4 位数字**；若串里 `*` 后面不足 4 位数字 → 返回 `null`；没有任何数字 → `null`。
- `normalizeName`：去所有空白，全角字母数字转半角；长度 ≤ 0 → `''`。
- 姓名比较：两边归一后都非空时，若任一方含 `*`，只比第一个字符；否则逐字相等。
- `compareRecipient` 判定严格按方案 §6.3：
  1. 手机：两边都拿到尾 4 位且不同 → push `{field:'phone', expected:<expected 尾4>, actual:<存根尾4>}`；相同 → `agree += 1`
  2. 区县：存根 `address` 非空且能找到 `expected.district`（district 非空）→ `agree += 1`；能确定区县（命中 `/\d{2,}(区|县|市)$/` 一级的「XX区/XX县」）却与 `expected.district` 不同 → push `{field:'district', ...}`
  3. 姓名：两边都非空且不相等 → `conflict += 1`（**不 push 到 conflicts**）
  4. 有任一 conflict 字段（phone/district）→ `mismatch`
  5. 否则 `agree >= 2 && conflict === 0` → `match`；其余 → `unknown`
  6. 地址归一：先去掉重复的省市前缀（`上海市上海市` → `上海市`），再去掉所有空格与 `,，。、-` 等标点，再比对。
- `buildAddressFingerprint`：对 `[recipientName, phone, province, city, district, detail]` 各自做「去空白 + 全角转半角」后以 `|` 连接，sha1 hex。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest tests/application/shipping/waybill-receipt-match.spec.ts`
Expected: PASS（9 条全绿）

- [ ] **Step 5: 提交**

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/20261110-waybill-ai-ship
bash scripts/session.sh commit -m "feat(shipping): 存根收件人比对纯函数" backend/src/application/shipping/waybill-receipt-match.ts backend/tests/application/shipping/waybill-receipt-match.spec.ts
```

---

### Task 2: 承运商归一字典

**Files:**
- Create: `backend/src/application/shipping/carrier-catalog.ts`
- Test: `backend/tests/application/shipping/carrier-catalog.spec.ts`

**Interfaces:**
- Produces:
  - `export const CARRIER_CODES = ['SF','JD','YTO','ZTO','STO','YD','EMS','POSTB'] as const`
  - `export type CarrierCode = typeof CARRIER_CODES[number]`
  - `export const CARRIER_NAME_BY_CODE: Record<CarrierCode, string>`
  - `export function toCarrierCode(raw: string | null | undefined): CarrierCode | null`

- [ ] **Step 1: 写失败的测试**

```ts
import { toCarrierCode } from '../../../src/application/shipping/carrier-catalog';

it.each([
  ['顺丰速运', 'SF'], ['顺丰', 'SF'], ['SF EXPRESS', 'SF'], ['sf', 'SF'],
  ['京东快递', 'JD'], ['京东物流', 'JD'],
  ['圆通速递', 'YTO'], ['中通快递', 'ZTO'], ['申通快递', 'STO'],
  ['韵达速递', 'YD'], ['EMS', 'EMS'], ['邮政特快专递', 'EMS'], ['邮政包裹', 'POSTB'],
])('%s → %s', (raw, code) => expect(toCarrierCode(raw)).toBe(code));

it('认不出来给 null，不许猜', () => {
  expect(toCarrierCode('某某快运')).toBeNull();
  expect(toCarrierCode('')).toBeNull();
  expect(toCarrierCode(null)).toBeNull();
});
```

- [ ] **Step 2: 跑一遍确认失败**

Run: `cd backend && npx jest tests/application/shipping/carrier-catalog.spec.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

先做「全角转半角 + 去空白 + 转大写」，再按别名表匹配（别名表放模块内 `const ALIASES: Record<string, CarrierCode>`）。**不要用 `includes` 做模糊包含** —— 「中通」和「中通快运」不是一回事；用精确匹配 + 前缀兜底（`raw.startsWith(alias)`）。认不出来返回 `null`。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest tests/application/shipping/carrier-catalog.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
bash scripts/session.sh commit -m "feat(shipping): 承运商归一字典" backend/src/application/shipping/carrier-catalog.ts backend/tests/application/shipping/carrier-catalog.spec.ts
```

---

### Task 3: 提示词与模型输出收口

**Files:**
- Create: `backend/src/application/shipping/waybill-receipt.prompt.ts`
- Test: `backend/tests/application/shipping/waybill-receipt.prompt.spec.ts`

**Interfaces:**
- Consumes: Task 2 的 `toCarrierCode`
- Produces:
  - `export const WAYBILL_RECEIPT_SYSTEM_PROMPT: string`
  - `export interface ParsedReceipt { documentType: 'waybill_receipt' | 'other'; carrierCode: string | null; trackingNumber: string | null; shippingFee: number | null; recipientName: string | null; recipientPhoneMasked: string | null; recipientAddress: string | null }`
  - `export function parseWaybillReceipt(raw: unknown): ParsedReceipt`

- [ ] **Step 1: 写失败的测试**

```ts
import { parseWaybillReceipt, WAYBILL_RECEIPT_SYSTEM_PROMPT } from '../../../src/application/shipping/waybill-receipt.prompt';

it('正常存根：读出三项 + 收件人', () => {
  expect(parseWaybillReceipt({
    documentType: 'waybill_receipt', carrierName: '顺丰速运',
    trackingNumber: 'SF0204691009893', shippingFee: 56,
    recipient: { name: '张赛珺', phoneMasked: '186****2107', address: '上海市上海市普陀区礼泉路700弄55号703' },
  })).toMatchObject({
    documentType: 'waybill_receipt', carrierCode: 'SF',
    trackingNumber: 'SF0204691009893', shippingFee: 56, recipientName: '张赛珺',
  });
});

it('不是存根 → documentType other，号码一律 null', () => {
  expect(parseWaybillReceipt({ documentType: 'other', trackingNumber: '123' })).toMatchObject({
    documentType: 'other', trackingNumber: null, shippingFee: null,
  });
});

it('没有运费 → null（月结存根）', () => {
  expect(parseWaybillReceipt({ documentType: 'waybill_receipt', trackingNumber: 'SF1', shippingFee: null }).shippingFee).toBeNull();
});

it('运费是字符串也认，负数与 NaN 归 null', () => {
  expect(parseWaybillReceipt({ documentType: 'waybill_receipt', shippingFee: '56.00' }).shippingFee).toBe(56);
  expect(parseWaybillReceipt({ documentType: 'waybill_receipt', shippingFee: -1 }).shippingFee).toBeNull();
  expect(parseWaybillReceipt({ documentType: 'waybill_receipt', shippingFee: 'abc' }).shippingFee).toBeNull();
});

it('承运商认不出来就是 null', () => {
  expect(parseWaybillReceipt({ documentType: 'waybill_receipt', carrierName: '某某快运' }).carrierCode).toBeNull();
});

it('提示词里写死了"不许补位"', () => {
  expect(WAYBILL_RECEIPT_SYSTEM_PROMPT).toContain('不许');
});
```

- [ ] **Step 2: 跑一遍确认失败**

Run: `cd backend && npx jest tests/application/shipping/waybill-receipt.prompt.spec.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

`WAYBILL_RECEIPT_SYSTEM_PROMPT` 照抄方案 §4 的规则表，把「只认图上真的印着的那串，不许按常识补位」「看不到运费给 null」「不是存根就返回 documentType other」等写成明确祈使句，并给出 §4 的 JSON 输出骨架。

`parseWaybillReceipt`：
- `documentType !== 'waybill_receipt'` → 除 `documentType` 外全部 `null`（**这是硬规则**：不是存根就不许往下读）
- `trackingNumber`：`trim()` 后长度 < 5 或含中文 → `null`
- `shippingFee`：数字或数字字符串，`>= 0` 且有限 → 保留两位小数；否则 `null`
- 承运商走 `toCarrierCode`
- 收件人三项各自 `trim()`，空串 → `null`

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest tests/application/shipping/waybill-receipt.prompt.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
bash scripts/session.sh commit -m "feat(shipping): 存根识别提示词与输出收口" backend/src/application/shipping/waybill-receipt.prompt.ts backend/tests/application/shipping/waybill-receipt.prompt.spec.ts
```

---

### Task 4: 核对记录表 + migration

**Files:**
- Modify: `backend/prisma/schema.prisma`（在 `ProcurementSkuDraftUsage` 附近追加 model）
- Create: `backend/prisma/migrations/20261110230000_waybill_receipt_record/migration.sql`

**Interfaces:**
- Produces: `prisma.waybillReceiptRecord`（字段见下）

- [ ] **Step 1: 加 Prisma model**

```prisma
/// 快递存根核对记录（2026-11-10）：一行 = 一次识别 / 一次手动填写。
/// 兼做配额计数（按 created_by + created_at 数当天行数）与审计。
/// 存根图片不入库，这里只有结论。
model WaybillReceiptRecord {
  id                  String   @id @default(uuid()) @db.VarChar(36)
  /// 识别/手填的运单号；彻底失败为 null
  trackingNumber      String?  @map("tracking_number") @db.VarChar(64)
  carrierCode         String?  @map("carrier_code") @db.VarChar(32)
  orderIds            String[] @map("order_ids")
  /// MATCH / UNKNOWN / MISMATCH / DUPLICATE / MANUAL / DEGRADED / NOT_WAYBILL
  status              String   @map("status") @db.VarChar(20)
  conflicts           Json?    @map("conflicts")
  receipt             Json?    @map("receipt")
  /// orderId → 当时的地址指纹 sha1
  addressFingerprints Json?    @map("address_fingerprints")
  degradedReason      String?  @map("degraded_reason") @db.VarChar(40)
  manualReason        String?  @map("manual_reason") @db.VarChar(200)
  createdBy           String   @map("created_by") @db.VarChar(36)
  createdAt           DateTime @default(now()) @map("created_at")

  @@index([trackingNumber])
  @@index([createdAt])
  @@index([createdBy, createdAt])
  @@map("waybill_receipt_record")
}
```

- [ ] **Step 2: 写 migration SQL**（手写，与 schema 一一对应；`order_ids` 用 `TEXT[]`）

```sql
-- 快递存根核对记录：一行 = 一次识别 / 一次手动填写
CREATE TABLE "waybill_receipt_record" (
  "id" VARCHAR(36) NOT NULL,
  "tracking_number" VARCHAR(64),
  "carrier_code" VARCHAR(32),
  "order_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" VARCHAR(20) NOT NULL,
  "conflicts" JSONB,
  "receipt" JSONB,
  "address_fingerprints" JSONB,
  "degraded_reason" VARCHAR(40),
  "manual_reason" VARCHAR(200),
  "created_by" VARCHAR(36) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "waybill_receipt_record_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "waybill_receipt_record_tracking_number_idx" ON "waybill_receipt_record"("tracking_number");
CREATE INDEX "waybill_receipt_record_created_at_idx" ON "waybill_receipt_record"("created_at");
CREATE INDEX "waybill_receipt_record_created_by_created_at_idx" ON "waybill_receipt_record"("created_by", "created_at");
```

- [ ] **Step 3: 生成 client 并自检**

Run: `cd backend && npx prisma generate && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 4: 本地应用 migration（不碰生产）**

Run: `cd backend && npx prisma migrate deploy`
Expected: `Applying migration 20261110230000_waybill_receipt_record` → `All migrations have been successfully applied.`

- [ ] **Step 5: 提交**

```bash
bash scripts/session.sh commit -m "feat(shipping): 快递存根核对记录表" backend/prisma/schema.prisma backend/prisma/migrations/20261110230000_waybill_receipt_record/migration.sql
```

---

### Task 5: 订单地址读取 + 核对记录读写

**Files:**
- Create: `backend/src/application/shipping/waybill-address.ts`
- Create: `backend/src/application/shipping/waybill-receipt-guard.service.ts`
- Test: `backend/tests/application/shipping/waybill-receipt-guard.service.spec.ts`

**Interfaces:**
- Consumes: Task 1 的 `AddressView` / `buildAddressFingerprint`
- Produces:
  - `export async function loadOrderAddresses(prisma: PrismaService, orderIds: string[]): Promise<Array<AddressView & { orderId: string; kind: 'ORDER' | 'SUPPLEMENT' }>>`（鲜食读 `order.shippingAddressSnapshot`，为空退回 `address` 关系；补剂读 `supplementOrder.shippingAddressSnapshot`）
  - `export class WaybillReceiptGuardService`
    - `assertVerified(input: { orderIds: string[]; trackingNumber: string }): Promise<void>` —— 不通过抛 `BadRequestException`，文案见方案 §7.3

- [ ] **Step 1: 写失败的测试**（用 mock prisma，不打真库）

```ts
it('没有核对记录 → 抛错，文案里带"还没核对过"', async () => {
  await expect(guard.assertVerified({ orderIds: ['o1'], trackingNumber: 'SF1' }))
    .rejects.toThrow(/还没核对过/);
});

it('有 MATCH 记录且指纹一致 → 通过', async () => { /* ... */ });

it('有 MATCH 记录但地址改过（指纹不同）→ 抛错', async () => { /* ... */ });

it('记录是 MISMATCH → 抛错', async () => { /* ... */ });

it('记录是 MANUAL → 通过', async () => { /* ... */ });

it('合并发货：一张记录覆盖两张单，两张都通过', async () => { /* ... */ });
```

- [ ] **Step 2: 跑一遍确认失败**

Run: `cd backend && npx jest tests/application/shipping/waybill-receipt-guard.service.spec.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

`assertVerified` 流程：
1. `loadOrderAddresses`，算出每个 orderId 的指纹
2. `prisma.waybillReceiptRecord.findMany({ where: { trackingNumber, orderIds: { hasEvery: orderIds }, status: { in: ['MATCH','MANUAL'] } } })`
3. 取最新一条，比对 `addressFingerprints[orderId]` 与当前指纹，全部一致才通过
4. 不通过抛 `BadRequestException('这单的运单号还没核对过（或核对没通过）。请先上传电子存根；如果存根认不出来，走「手动填写并确认」。')`

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest tests/application/shipping/waybill-receipt-guard.service.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
bash scripts/session.sh commit -m "feat(shipping): 发货前存根核对校验" backend/src/application/shipping/waybill-address.ts backend/src/application/shipping/waybill-receipt-guard.service.ts backend/tests/application/shipping/waybill-receipt-guard.service.spec.ts
```

---

### Task 6: 识别服务（配额 / 查重 / 降级 / 落库 / 手动出口）

**Files:**
- Create: `backend/src/application/shipping/waybill-receipt.service.ts`
- Test: `backend/tests/application/shipping/waybill-receipt.service.spec.ts`

**Interfaces:**
- Consumes: Task 1/2/3/5 的实现与 `DeepSeekChatOptions`（`application/recipe-designer/deepseek-chat`）、`AgentProviderConfigService`
- Produces:
  - `export const WAYBILL_RECEIPT_MODEL = Symbol('WAYBILL_RECEIPT_MODEL')`
  - `export const WAYBILL_RECEIPT_PURPOSE = PURCHASE_REIMBURSEMENT_AGENT_PURPOSE`
  - `export const DAILY_RECEIPT_LIMIT_PER_USER = 100`
  - `export const MONTHLY_RECEIPT_LIMIT_SYSTEM = 10000`
  - `export class WaybillReceiptService`
    - `recognize(input: { imageUrl: string; orderIds: string[]; userId: string }): Promise<RecognizeResult>`
    - `createManualRecord(input: { orderIds: string[]; trackingNumber: string; carrierCode?: string | null; reason: string; userId: string }): Promise<{ id: string }>`
  - `export interface RecognizeResult { checkId: string; receipt: ParsedReceipt | null; match: { status: 'match'|'unknown'|'mismatch'|'duplicate'|'degraded'|'not_waybill'; conflicts: MatchConflict[]; expected: { recipientName: string; phoneTail4: string | null; regionText: string; detail: string } | null } }`

- [ ] **Step 1: 写失败的测试**（模型端口用假实现注入，不打网络）

```ts
it('核对通过 → 落一行 MATCH，指纹记下当时的地址', async () => { /* ... */ });
it('收件人对不上 → MISMATCH，conflicts 里说是手机还是区县', async () => { /* ... */ });
it('这张图不是存根 → NOT_WAYBILL，三项一律 null', async () => { /* ... */ });
it('运单号已在别的鲜食单上 → DUPLICATE，并指出是哪张单', async () => { /* ... */ });
it('运单号在本票其他单上 → 不算重复', async () => { /* ... */ });
it('运单号在本单自己的历史单号上 → 不算重复', async () => { /* ... */ });
it('模型超时 → DEGRADED(model_timeout)，不抛错', async () => { /* ... */ });
it('当天配额用完 → DEGRADED(quota)，不调模型', async () => { /* ... */ });
it('手动填单号时已有 MISMATCH 记录 → 拒绝', async () => { /* ... */ });
it('手动填单号正常 → 落一行 MANUAL', async () => { /* ... */ });
```

- [ ] **Step 2: 跑一遍确认失败**

Run: `cd backend && npx jest tests/application/shipping/waybill-receipt.service.spec.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

流程严格按方案 §3：配额（数当天行数，先落行再判断，超了返回 `DEGRADED/quota`）→ 查重（方案 §6.4 三条口径）→ 调模型（`callDeepSeekJson`，`temperature: 0`，`extraBody: { thinking: { type: 'disabled' } }`，`userContent` 里带 `image_url`）→ `parseWaybillReceipt` → `compareRecipient` → 落库 → 返回。

`documentType === 'other'` 时**跳过查重**（没有号码可比），直接落 `NOT_WAYBILL`。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest tests/application/shipping/waybill-receipt.service.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
bash scripts/session.sh commit -m "feat(shipping): 存根识别服务（查重/配额/落库/手动出口）" backend/src/application/shipping/waybill-receipt.service.ts backend/tests/application/shipping/waybill-receipt.service.spec.ts
```

---

### Task 7: 三个发货接口接入硬锁

**Files:**
- Modify: `backend/src/application/order/order.service.ts:3166`（`shipOrder` 的 options 增加 `enforceWaybillCheck?: boolean`）
- Modify: `backend/src/application/shipping/order-shipment.service.ts:134`（`createShipment` 增加 `enforceWaybillCheck?: boolean` 参数）
- Modify: `backend/src/application/supplement-shop/supplement-order.service.ts:1000`（`shipOrder` 的 dto 增加 `enforceWaybillCheck?: boolean`）
- Modify: `backend/src/interfaces/controllers/admin.controller.ts:2210`、`:2375`（透传）
- Modify: `backend/src/interfaces/dto/supplement-shop.dto.ts:236`（加字段）
- Modify: `backend/src/interfaces/controllers/admin-supplement-shop.controller.ts:341`（透传）
- Modify: `backend/src/app.module.ts`（provider 注册）
- Test: `backend/tests/application/shipping/waybill-lock-wiring.spec.ts`

**Interfaces:**
- Consumes: Task 5 的 `WaybillReceiptGuardService.assertVerified`
- Produces: 三个发货入口在 `enforceWaybillCheck === true` 时，**事务开始之前**调 `assertVerified`

- [ ] **Step 1: 写失败的测试**

```ts
it('鲜食单笔：enforce 且没核对过 → 抛错，订单状态不变', async () => { /* ... */ });
it('鲜食单笔：enforce 且核对过 → 正常发货', async () => { /* ... */ });
it('鲜食单笔：不 enforce（后台来的）→ 不校验，正常发货', async () => { /* ... */ });
it('NO_REQUIRED：无论 enforce 与否都不校验', async () => { /* ... */ });
it('合并发货：任一包裹任一单未核对 → 整票拒绝，什么都没落库', async () => { /* ... */ });
it('合并发货：每个包裹的号都要各自核对过', async () => { /* ... */ });
it('补剂单：enforce 且没核对过 → 抛错', async () => { /* ... */ });
```

- [ ] **Step 2: 跑一遍确认失败**

Run: `cd backend && npx jest tests/application/shipping/waybill-lock-wiring.spec.ts`
Expected: FAIL

- [ ] **Step 3: 接入**

- `order.service.shipOrder`：`shippingType === 'NORMAL' && options.enforceWaybillCheck` 时，在 `order.markAsShipped(...)` **之前**调 `guard.assertVerified({ orderIds: [orderId], trackingNumber })`
- `order-shipment.service.createShipment`：在 `this.prisma.$transaction` **之前**，对每个 `pkg` 的 `pkg.items` 里的每个 `orderId` 调一次 `assertVerified({ orderIds: [item.orderId], trackingNumber: pkg.trackingNumber })`
- `supplement-order.service.shipOrder`：同鲜食
- 控制器把 `body.enforceWaybillCheck === true` 透传下去；`admin-web` 不传 → 不锁

- [ ] **Step 4: 跑测试确认通过 + 回归**

Run: `cd backend && npx jest tests/application/shipping tests/application/order tests/application/supplement-shop`
Expected: 全绿（若个别老用例红，先在干净 `origin/main` 上复跑同一条命令做对照）

- [ ] **Step 5: 提交**

```bash
bash scripts/session.sh commit -m "feat(shipping): 发货接口接入存根硬锁"
```

---

### Task 8: 四个新端点 + 模块装配

**Files:**
- Modify: `backend/src/interfaces/controllers/staff-shipping.controller.ts`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/src/application/supplement-shop/supplement-order.service.ts`（新增 `staffUpdateAddress`，复用 `adminUpdateAddress` 的落库与审计）
- Test: `backend/tests/controllers/staff-shipping.receipt.spec.ts`

**Interfaces:**
- Consumes: Task 6 的 `WaybillReceiptService`
- Produces（方案 §10）:
  - `POST /api/v1/staff/shipping/upload-receipt` → `{ url, key }`
  - `POST /api/v1/staff/shipping/receipt-recognize` → `RecognizeResult`
  - `POST /api/v1/staff/shipping/manual-waybill` → `{ id }`
  - `PATCH /api/v1/staff/shipping/supplement-orders/:id/address` → 订单视图

- [ ] **Step 1: 写失败的测试**

```ts
it('缺 imageUrl → 400', async () => { /* ... */ });
it('缺 orderIds → 400', async () => { /* ... */ });
it('非员工 → 403', async () => { /* ... */ });
it('上传存根落 shipping-waybill-receipts 目录', async () => { /* ... */ });
it('手动填写缺 reason → 400', async () => { /* ... */ });
```

- [ ] **Step 2: 跑一遍确认失败**

Run: `cd backend && npx jest tests/controllers/staff-shipping.receipt.spec.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

`upload-receipt` 用 `FileInterceptor('file')` + `cosService.uploadImage(file, file.originalname, 'shipping-waybill-receipts')`，与 `staff-purchasing.controller.ts:110` 同一写法。

`receipt-recognize` 的 body 用 `@Body() body: { imageUrl?: string; orderIds?: string[] }`，校验后调 service；**不要**把 `degraded` 吞成 200 + 空，要按方案 §10 原样返回状态。

`app.module.ts` 里注册 `WaybillReceiptService`、`WaybillReceiptGuardService`、`{ provide: WAYBILL_RECEIPT_MODEL, useValue: { callDeepSeekJson } }`。

- [ ] **Step 4: 跑测试确认通过 + 类型检查**

Run: `cd backend && npx jest tests/controllers/staff-shipping.receipt.spec.ts && npx tsc --noEmit`
Expected: PASS，无类型错误

- [ ] **Step 5: 提交**

```bash
bash scripts/session.sh commit -m "feat(shipping): 存根上传/识别/手动/补剂改地址端点"
```

---

### Task 9: 小程序共享承运商清单

**Files:**
- Create: `miniapp/src/constants/carriers.ts`
- Modify: `miniapp/src/pages/staff-orders/detail.vue:1030`
- Modify: `miniapp/src/pages/staff-supplement-orders/detail.vue:381`
- Modify: `miniapp/src/pages/staff-orders/batch-ship.vue:125`
- Test: `miniapp/src/constants/carriers.spec.ts`

**Interfaces:**
- Produces:
  - `export interface CarrierOption { code: string; name: string }`
  - `export const CARRIERS: CarrierOption[]`（8 家，顺序：SF JD YTO ZTO STO YD EMS POSTB）
  - `export function carrierIndexOf(code: string | null | undefined): number`（找不到返回 0）

- [ ] **Step 1: 写失败的测试**

```ts
it('8 家，顺序固定，SF 在 0', () => {
  expect(CARRIERS.map((c) => c.code)).toEqual(['SF','JD','YTO','ZTO','STO','YD','EMS','POSTB']);
});
it('按代码找下标', () => {
  expect(carrierIndexOf('STO')).toBe(4);
  expect(carrierIndexOf('NOPE')).toBe(0);
  expect(carrierIndexOf(null)).toBe(0);
});
```

- [ ] **Step 2: 跑一遍确认失败**

Run: `cd miniapp && npx vitest run src/constants/carriers.spec.ts`
Expected: FAIL

- [ ] **Step 3: 实现并替换三处**

三个页面**只改数据来源，不改任何交互**：把本地 `const carriers = [...]` 换成 `const carriers = CARRIERS`（`batch-ship.vue` 里是 `{code,name}` 同形，直接可用）。**不要**改动其它任何逻辑。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd miniapp && npx vitest run src/constants/carriers.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
bash scripts/session.sh commit -m "feat(miniapp): 承运商清单统一为一份（补申通/邮政包裹）" miniapp/src/constants/carriers.ts miniapp/src/constants/carriers.spec.ts miniapp/src/pages/staff-orders/detail.vue miniapp/src/pages/staff-supplement-orders/detail.vue miniapp/src/pages/staff-orders/batch-ship.vue
```

---

### Task 10: 小程序存根上传 API + 状态文案纯函数

**Files:**
- Create: `miniapp/src/api/waybillReceipt.ts`
- Create: `miniapp/src/utils/waybill-receipt-view.ts`
- Test: `miniapp/src/utils/waybill-receipt-view.spec.ts`

**Interfaces:**
- Produces:
  - `uploadReceiptImage(filePath: string): Promise<{ url: string; key: string }>`
  - `recognizeReceipt(input: { imageUrl: string; orderIds: string[] }): Promise<RecognizeResponse>`
  - `createManualWaybill(input: { orderIds: string[]; trackingNumber: string; reason: string }): Promise<{ id: string }>`
  - `export type ReceiptUiState = 'idle' | 'recognizing' | 'match' | 'unknown' | 'mismatch' | 'duplicate' | 'failed'`
  - `export function buildReceiptView(input: { state: ReceiptUiState; carrierName?: string | null; trackingNumber?: string | null; shippingFee?: number | null; conflicts?: Array<{field:string;expected:string;actual:string}>; message?: string | null }): { tone: 'neutral'|'ok'|'warn'|'error'; title: string; desc: string; canShip: boolean; canManual: boolean }`

- [ ] **Step 1: 写失败的测试**

```ts
it('match → 绿，能发货，不用手动', () => {
  const v = buildReceiptView({ state: 'match', carrierName: '顺丰速运', trackingNumber: 'SF0204691009893', shippingFee: 56 });
  expect(v.tone).toBe('ok');
  expect(v.canShip).toBe(true);
  expect(v.canManual).toBe(false);
  expect(v.title).toContain('SF0204691009893');
});

it('mismatch → 红，不能发货，且不给手动后门', () => {
  const v = buildReceiptView({ state: 'mismatch', conflicts: [{ field: 'phone', expected: '2107', actual: '0011' }] });
  expect(v.tone).toBe('error');
  expect(v.canShip).toBe(false);
  expect(v.canManual).toBe(false);
  expect(v.desc).toContain('2107');
});

it('duplicate → 红，不能发货，不给手动', () => {
  expect(buildReceiptView({ state: 'duplicate' })).toMatchObject({ tone: 'error', canShip: false, canManual: false });
});

it('failed（AI 认不出来）→ 不能发货，但给手动出口', () => {
  expect(buildReceiptView({ state: 'failed' })).toMatchObject({ tone: 'error', canShip: false, canManual: true });
});

it('unknown → 黄，不能直接发，需要手动确认', () => {
  expect(buildReceiptView({ state: 'unknown' })).toMatchObject({ tone: 'warn', canShip: false, canManual: true });
});

it('idle → 不能发货', () => {
  expect(buildReceiptView({ state: 'idle' }).canShip).toBe(false);
});
```

- [ ] **Step 2: 跑一遍确认失败**

Run: `cd miniapp && npx vitest run src/utils/waybill-receipt-view.spec.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

`uploadReceiptImage` 照抄 `miniapp/src/pages/staff-purchasing/api/purchasing.ts:1099` 的 `uni.uploadFile` 写法，只换 URL 与错误文案。文案严格按方案 §8.1 表格。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd miniapp && npx vitest run src/utils/waybill-receipt-view.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
bash scripts/session.sh commit -m "feat(miniapp): 存根上传 API 与状态文案" miniapp/src/api/waybillReceipt.ts miniapp/src/utils/waybill-receipt-view.ts miniapp/src/utils/waybill-receipt-view.spec.ts
```

---

### Task 11: 鲜食单发货弹窗接入

**Files:**
- Modify: `miniapp/src/pages/staff-orders/detail.vue`（发货弹窗模板 ~582-640；`confirmShipping` ~2320）

**Interfaces:**
- Consumes: Task 10 的 `uploadReceiptImage` / `recognizeReceipt` / `buildReceiptView` / `createManualWaybill`；Task 9 的 `CARRIERS`

- [ ] **Step 1: 加状态**

`receiptState`、`receiptView`、`receiptDraft`、`manualReason`、`manualVisible` 五个 ref；打开发货弹窗时全部复位。

- [ ] **Step 2: 模板**

在「物流公司」上方插入上传块（`v-if="shippingType === 'NORMAL'"`），按 `receiptView.tone` 上色；`mismatch`/`duplicate` 时在块下方渲染「存根上写的是…／这单的收货人…」两行 + 「去改收货地址」按钮（复用本页已有的地址面板：`addressFormVisible = true` + `openEditAddressForm()`）。

- [ ] **Step 3: 填值**

`match`/`unknown` 时把 `carrierCode`（`carrierIndexOf` 定位下拉）、`trackingNumber`、`shippingFee` 写进已有字段；`mismatch`/`duplicate`/`failed` 时**一个都不写**。

- [ ] **Step 4: 提交时带上开关**

`confirmShipping` 的请求体加 `enforceWaybillCheck: true`；`receiptView.canShip === false && !manualConfirmed` 时按钮 `disabled`。

- [ ] **Step 5: 预览构建验证**

Run: `cd miniapp && npm run preview`
Expected: 构建成功；微信开发者工具打开 `miniapp/dist/dev/mp-weixin`

- [ ] **Step 6: 提交**

```bash
bash scripts/session.sh commit -m "feat(miniapp): 鲜食发货弹窗接入存根识别与硬锁" miniapp/src/pages/staff-orders/detail.vue
```

---

### Task 12: 补剂单发货弹窗 + 改地址面板

**Files:**
- Modify: `miniapp/src/pages/staff-supplement-orders/detail.vue`（发货弹窗 ~220-270；`confirmShip` ~608）

**Interfaces:**
- Consumes: Task 10、Task 9；Task 8 的 `PATCH /staff/shipping/supplement-orders/:id/address`
- Produces: 发货弹窗里新增「改收货地址」面板（收件人/手机/省市区/详细地址/原因必填）

- [ ] **Step 1: 上传块**（与 Task 11 同一套状态与渲染，字段名换成补剂页的 `shipCarrierIndex`/`shipTracking`/`shipFee`）
- [ ] **Step 2: 改地址面板**：从 `order.shippingAddressSnapshot` 预填；保存调新端点；成功后刷新订单并**清空存根状态**（地址变了，旧核对作废）
- [ ] **Step 3: 提交时 `enforceWaybillCheck: true`**
- [ ] **Step 4: 预览构建验证**

Run: `cd miniapp && npm run preview`
Expected: 构建成功

- [ ] **Step 5: 提交**

```bash
bash scripts/session.sh commit -m "feat(miniapp): 补剂发货弹窗接入存根识别 + 改收货地址" miniapp/src/pages/staff-supplement-orders/detail.vue
```

---

### Task 13: 合并发货页逐包裹接入

**Files:**
- Modify: `miniapp/src/pages/staff-orders/batch-ship.vue`（`PackageState` 增加 `receiptState` / `receiptView` / `manualReason`；模板包裹卡片字段区上方加上传块；`submit` 校验）

**Interfaces:**
- Consumes: Task 9、Task 10

- [ ] **Step 1: `PackageState` 加三个字段**，`addPackage` / `resetPackages` 初始化
- [ ] **Step 2: 每包裹一个上传块**，识别时 `orderIds` 传这一票全部订单 id
- [ ] **Step 3: 底部「确认发货」**：任一包裹 `receiptView.canShip === false` 且未手动确认 → `disabled`，并提示「包裹 N 还没核对」
- [ ] **Step 4: 提交体加 `enforceWaybillCheck: true`**
- [ ] **Step 5: 发布构建验证**

Run: `cd miniapp && npm run build:mp-weixin`
Expected: 构建成功；微信开发者工具打开 `miniapp/dist/build/mp-weixin`

- [ ] **Step 6: 提交**

```bash
bash scripts/session.sh commit -m "feat(miniapp): 合并/拆包发货逐包裹接入存根识别与硬锁" miniapp/src/pages/staff-orders/batch-ship.vue
```

---

### Task 14: 全量自检与验收

- [ ] **Step 1: 后端类型 + 全量测试**

Run: `cd backend && npx tsc --noEmit && npm test`
Expected: 类型无错；测试全绿（个别老用例若红，先在干净 `origin/main` 复跑对照）

- [ ] **Step 2: 小程序测试**

Run: `cd miniapp && npm test`
Expected: 全绿

- [ ] **Step 3: 发布构建**

Run: `cd miniapp && npm run build:mp-weixin`
Expected: 成功；产物在 `miniapp/dist/build/mp-weixin`

- [ ] **Step 4: 真机四项自查**（微信开发者工具，复用老板已打开的那个项目）
  1. 鲜食单传存根 → 三项自动填、能发货
  2. 补剂单传存根 → 同上；改地址后要求重传
  3. 拆成 2 包各传一张 → 各自成功
  4. **故意传上一单的存根** → 红条拦住，且点「确认发货」被服务端拒

- [ ] **Step 5: 合并与部署**

```bash
bash scripts/session.sh finish
bash scripts/session.sh merge
# 后端有改动 → 部署
bash backend/scripts/remote_deploy_v2.sh
# 小程序 → 上传体验版（不要发正式版）
bash scripts/upload-trial.sh "快递存根识别自动填单 + 发货硬锁"
```
