# 财务模块重做（小程序端）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在小程序里给老板一本能看懂、能核对的经营账：打开就看到本月至今的收入、支出、结余，所有收支都有出处，固定费用自动生成。

**Architecture:** 不建全量流水表。后端按业务源表（订单、补剂单、定制食谱单、退款、采购单、账单、手工条目）实时聚合，一个 `FinanceSummaryService` 出汇总、一个 `FinanceEntriesService` 出明细，两者用同一批取数函数保证「汇总 = 明细相加」。旧的后台财务接口与页面整块删除。

**Tech Stack:** NestJS + Prisma + Jest（后端）；uni-app（Vue 3）+ vitest 回归 spec（小程序）；Vue 3 + Element Plus（后台，只删不建）。

**Spec:** `docs/superpowers/specs/2026-11-19-finance-miniapp-ledger-design.md`

**原型:** `mockups/finance-2026-11-19.html`

## Global Constraints

- 起账日 `2026-11-01`。任何查询区间早于该日一律裁到该日。
- 一切按上海时区切日、切月（沿用 `src/utils/timezone.util.ts` 的既有做法）。
- 收入口径：`Order.paymentMethod ∈ {WECHAT_PAY, WECHAT}` 记线上；`{ADMIN, OFFLINE_WECHAT, OFFLINE_ALIPAY, OTHER}` 记线下；`RESHIP`、金额为 0、`remakeFromOrderId`/`reshipFromOrderId` 非空的单**排除**。
- 退款是收入减项，按退款成功日归月，独立成行，不修改历史。
- 手续费率默认 `0.006`，配置键 `finance.wechatFeeRate`；只对线上支付计算，公式 `(实收 − 已退) × 费率`，四舍五入到分。补剂单、定制食谱单的收费渠道为空时按**线上**处理（历史数据默认微信支付）；线下代客的补剂/定制单误差记在已知限制里。
- 支出只有五类来源：采购单实付、订单真实快递费、固定费用账单、支付手续费、手工条目。**订单不产生支出。**
- 采购支出分两条路（同一单只走一条）：**补货单**（`kind = STOCK_REPLENISHMENT`）= `paidAmount − personalAmount`，按「商品行 + 运费 + 包装费」权重摊，个人消费不得专项冲运费/包装费（`paidAmount` 为空时用 `subtotalAmount + shippingFee + packagingFee − discountAmount` 兜底）；**日采单**（`ORDER_DEMAND`）= Σ`PurchaseRecord.actualCost`，按行类型归类。排除 `isDraft`、`voidedAt` 非空。
- 报销单、提现、内部转账**不进财务**。
- 固定费用按「费用所属月」整月计入；跨月账单按服务期月数平均分摊。月初查「本月至今」也会包含整月固定费用，页面必须有一行说明。
- 财务接口与页面**仅 ADMIN**；`STAFF` 一律 403。
- 金额单位：数据库 `Decimal`，接口一律返回 `number`（两位小数）。
- 小程序 UI 沿用 `docs/员工端UI规范.md`：主色 `#1E3A2F`、底色 `#FBFCF7`、卡片 `#FFFFFF`、分隔线 `#EEF1E2`、次要文字 `#6B6653`、警示 `#B08D4F`/`#F6EFE0`、危险 `#B4453A`。

## Review Focus

1. **跨日/跨月边界（上海时区）**：11-30 23:30 的付款必须落在 11 月，不能因为 UTC 换算跑到 12 月。
2. **退款大于实收**：线下退款登记必须拒绝「累计退款 > 该单实收」，否则收入会被冲成负数。
3. **手续费重复冲回**：同一订单两次部分退款，每次只冲回该次退款对应的手续费，不能重复冲。
4. **采购单金额兜底**：`paidAmount` 为空时按四项组合计算；四项也缺时按 0 计并让该行在明细里可见，不能静默吞掉。
5. **月初读数**：11 月 2 日打开首页，收入只算两天、但已含整月房租，结余会很难看 —— 页面必须明确写出「已含本月固定费用 ¥X」，避免老板误判亏损。

---

## Task 1: 口径工具（期间、手续费、分类表）

**Files:**
- Create: `backend/src/application/finance/finance-period.ts`
- Create: `backend/src/application/finance/finance-fee.ts`
- Modify: `backend/src/application/finance/finance-categories.ts`
- Test: `backend/tests/application/finance/finance-period.spec.ts`
- Test: `backend/tests/application/finance/finance-fee.spec.ts`

**Interfaces:**
- Produces:
  - `FINANCE_START_DATE = '2026-11-01'`
  - `type FinancePeriod = { from: Date; to: Date }`
  - `resolvePeriod(from?: string, to?: string, now?: Date): FinancePeriod`
  - `monthRange(month: string): FinancePeriod`（`'2026-11'` → 11-01 00:00 ~ 11-30 23:59:59.999 上海时间）
  - `computeFeeAmount(paid: number, refunded: number, rate: number): number`
  - `FINANCE_EXPENSE_CATEGORY_LABELS` 增加 `SUPPLEMENT`/`TAX`/`SOCIAL_INSURANCE`/`EQUIPMENT`/`PAYMENT_FEE`
  - `FINANCE_INCOME_CATEGORY_LABELS`：`ONLINE_ORDER`/`OFFLINE_ORDER`/`SUPPLEMENT`/`CUSTOM_RECIPE`/`REFUND`/`OTHER_INCOME`
  - `OFFLINE_PAYMENT_METHODS = ['ADMIN','OFFLINE_WECHAT','OFFLINE_ALIPAY','OTHER']`
  - `ONLINE_PAYMENT_METHODS = ['WECHAT_PAY','WECHAT']`

- [ ] **Step 1: 写期间工具的失败测试**

```ts
// backend/tests/application/finance/finance-period.spec.ts
import { resolvePeriod, monthRange, FINANCE_START_DATE } from 'src/application/finance/finance-period';

const sh = (iso: string) => new Date(`${iso}+08:00`);

describe('finance-period', () => {
  it('默认给本月至今，且起点不早于起账日', () => {
    const p = resolvePeriod(undefined, undefined, sh('2026-11-05T10:00:00'));
    expect(p.from.toISOString()).toBe(sh('2026-11-01T00:00:00').toISOString());
    expect(p.to.toISOString()).toBe(sh('2026-11-05T23:59:59.999').toISOString());
  });

  it('早于起账日的区间被裁到起账日', () => {
    const p = resolvePeriod('2026-10-01', '2026-10-31', sh('2026-11-05T10:00:00'));
    expect(p.from.toISOString()).toBe(sh(FINANCE_START_DATE + 'T00:00:00').toISOString());
  });

  it('指定月份返回整月边界', () => {
    const p = monthRange('2026-11');
    expect(p.from.toISOString()).toBe(sh('2026-11-01T00:00:00').toISOString());
    expect(p.to.toISOString()).toBe(sh('2026-11-30T23:59:59.999').toISOString());
  });

  it('11 月 30 日深夜的付款仍落在 11 月', () => {
    const p = monthRange('2026-11');
    expect(sh('2026-11-30T23:30:00').getTime()).toBeLessThanOrEqual(p.to.getTime());
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/finance/finance-period.spec.ts -v`
Expected: FAIL，提示找不到 `finance-period` 模块。

- [ ] **Step 3: 实现 `finance-period.ts`**

导出上面列出的四个符号。日期边界用「上海时间当天 00:00 / 23:59:59.999」，即 `new Date(y, m, d)` 手工构造后加 8 小时偏移的方式与现有 `timezone.util.ts` 保持一致；`resolvePeriod` 的 `to` 缺省为 `now` 当天结束，`from` 缺省为 `max(当月 1 日, FINANCE_START_DATE)`。

- [ ] **Step 4: 写手续费的失败测试**

```ts
// backend/tests/application/finance/finance-fee.spec.ts
import { computeFeeAmount } from 'src/application/finance/finance-fee';

describe('finance-fee', () => {
  it('无退款时按全额计', () => expect(computeFeeAmount(1000, 0, 0.006)).toBe(6));
  it('退款部分不计手续费', () => expect(computeFeeAmount(1000, 500, 0.006)).toBe(3));
  it('全额退款得到负数，等于把手续费退回', () => expect(computeFeeAmount(0, 500, 0.006)).toBe(-3));
  it('四舍五入到分', () => expect(computeFeeAmount(428, 0, 0.006)).toBe(2.57));
  it('同一单两次部分退款，冲回之和等于全额退款的手续费', () => {
    const a = computeFeeAmount(0, 200, 0.006);
    const b = computeFeeAmount(0, 300, 0.006);
    expect(Number((a + b).toFixed(2))).toBe(computeFeeAmount(0, 500, 0.006));
  });
});
```

- [ ] **Step 5: 跑测试确认失败 → 实现 → 再跑至全绿**

Run: `cd backend && npx jest tests/application/finance/finance-fee.spec.ts tests/application/finance/finance-period.spec.ts -v`
Expected: PASS（4 + 5 个用例）。

- [ ] **Step 6: 提交**

```bash
bash scripts/session.sh commit -m "feat(finance): 期间/手续费口径与分类表"
```

---

## Task 2: 数据库迁移（枚举、两张新表、付款方字段）

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20261119120000_finance_ledger_v2/migration.sql`

**Interfaces:**
- Produces 供后续任务使用的模型：
  - `FinanceManualEntry`（表 `finance_manual_entry`）
  - `OrderOfflineRefund`（表 `order_offline_refund`）
  - `PurchaseList.payerType: string`（默认 `PERSONAL`）、`PurchaseList.payerUserId: string | null`
  - `ExpenseBill.payerType` / `ExpenseBill.payerUserId`，`ExpenseBillPayment.payerType`
  - `FinanceExpenseCategory` 增加 5 个值；`ExpenseTemplateInterval` 增加 `QUARTERLY`

- [ ] **Step 1: 改 schema（枚举）**

在 `enum FinanceExpenseCategory` 末尾加：`SUPPLEMENT`、`TAX`、`SOCIAL_INSURANCE`、`EQUIPMENT`、`PAYMENT_FEE`。
在 `enum ExpenseTemplateInterval` 末尾加：`QUARTERLY`。

- [ ] **Step 2: 改 schema（两张新表）**

```prisma
model FinanceManualEntry {
  id             String                  @id @default(uuid()) @db.VarChar(36)
  direction      String                  @db.VarChar(10)   // INCOME | EXPENSE
  amount         Decimal                 @db.Decimal(12, 2)
  occurredAt     DateTime                @map("occurred_at") @db.Date
  category       FinanceExpenseCategory?
  incomeCategory String?                 @map("income_category") @db.VarChar(30)
  payerType      String                  @default("PERSONAL") @map("payer_type") @db.VarChar(10)
  payerUserId    String?                 @map("payer_user_id") @db.VarChar(36)
  title          String                  @db.VarChar(200)
  note           String?
  proofKeys      String[]                @default([]) @map("proof_keys")
  createdById    String                  @map("created_by_id") @db.VarChar(36)
  createdAt      DateTime                @default(now()) @map("created_at")
  updatedAt      DateTime                @updatedAt @map("updated_at")
  voidedAt       DateTime?               @map("voided_at")
  voidReason     String?                 @map("void_reason") @db.VarChar(200)

  @@index([occurredAt])
  @@index([direction, occurredAt])
  @@map("finance_manual_entry")
}

model OrderOfflineRefund {
  id          String    @id @default(uuid()) @db.VarChar(36)
  orderId     String    @map("order_id") @db.VarChar(36)
  amount      Decimal   @db.Decimal(10, 2)
  refundedAt  DateTime  @map("refunded_at") @db.Date
  method      String    @db.VarChar(20)   // WECHAT | ALIPAY | CASH | OTHER
  note        String?
  proofKeys   String[]  @default([]) @map("proof_keys")
  createdById String    @map("created_by_id") @db.VarChar(36)
  createdAt   DateTime  @default(now()) @map("created_at")
  voidedAt    DateTime? @map("voided_at")
  voidReason  String?   @map("void_reason") @db.VarChar(200)

  order       Order     @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@index([orderId, refundedAt])
  @@map("order_offline_refund")
}
```

在 `model Order` 的关系区加 `offlineRefunds OrderOfflineRefund[]`。

- [ ] **Step 3: 改 schema（付款方字段）**

`PurchaseList`、`ExpenseBill` 各加：

```prisma
  payerType   String  @default("PERSONAL") @map("payer_type") @db.VarChar(10)
  payerUserId String? @map("payer_user_id") @db.VarChar(36)
```

`ExpenseBillPayment` 加 `payerType String @default("PERSONAL") @map("payer_type") @db.VarChar(10)`。

- [ ] **Step 4: 生成迁移（迁移是共享出口，先看门禁）**

Run: `bash scripts/gate.sh status`，确认没有其他会话占着；占着就等，不要绕过。

Run: `cd backend && npx prisma migrate dev --name finance_ledger_v2 --create-only`
Expected: 生成 `prisma/migrations/<时间戳>_finance_ledger_v2/migration.sql`；把目录名改成 `20261119120000_finance_ledger_v2` 并确认 SQL 里同时包含 `CREATE TABLE`、`ALTER TYPE ... ADD VALUE`、`ALTER TABLE ... ADD COLUMN`。

- [ ] **Step 5: 应用迁移并生成 client**

Run: `cd backend && npx prisma migrate dev && npx prisma generate`
Expected: 迁移应用成功，`@prisma/client` 里出现 `financeManualEntry`、`orderOfflineRefund`。

- [ ] **Step 6: 提交**

```bash
bash scripts/session.sh commit -m "feat(finance): 手工记账/线下退款表与付款方字段"
```

---

## Task 3: 收入与退款聚合

**Files:**
- Create: `backend/src/application/finance/finance-income.service.ts`
- Test: `backend/tests/application/finance/finance-income.service.spec.ts`

**Interfaces:**
- Consumes: Task 1 的 `FinancePeriod`、`OFFLINE_PAYMENT_METHODS`、`computeFeeAmount`
- Produces:
  - `type FinanceIncome = { orderOnline: number; orderOffline: number; supplement: number; customRecipe: number; grossTotal: number; refundTotal: number; historicalRefundTotal: number; netTotal: number; fee: number }`
  - `FinanceIncomeService.getIncome(period: FinancePeriod, feeRate: number): Promise<FinanceIncome>`

- [ ] **Step 1: 写失败测试（用 mock prisma，每个用例只喂一类源表）**

```ts
// backend/tests/application/finance/finance-income.service.spec.ts
import { FinanceIncomeService } from 'src/application/finance/finance-income.service';
import { monthRange } from 'src/application/finance/finance-period';

const period = monthRange('2026-11');

const makePrisma = (data: any = {}) => ({
  order: { findMany: jest.fn().mockResolvedValue(data.orders ?? []) },
  supplementOrder: { findMany: jest.fn().mockResolvedValue(data.supplements ?? []) },
  customRecipeOrder: { findMany: jest.fn().mockResolvedValue(data.customRecipes ?? []) },
  orderRefundRecord: { findMany: jest.fn().mockResolvedValue(data.orderRefunds ?? []) },
  orderOfflineRefund: { findMany: jest.fn().mockResolvedValue(data.offlineRefunds ?? []) },
});

describe('FinanceIncomeService', () => {
  it('区分线上与线下收款', async () => {
    const prisma: any = makePrisma({
      orders: [
        { id: 'o1', amountTotal: 100, paymentMethod: 'WECHAT_PAY', paidAt: new Date('2026-11-02T02:00:00Z'), remakeFromOrderId: null, reshipFromOrderId: null },
        { id: 'o2', amountTotal: 200, paymentMethod: 'OFFLINE_WECHAT', paidAt: new Date('2026-11-02T03:00:00Z'), remakeFromOrderId: null, reshipFromOrderId: null },
      ],
    });
    const r = await new FinanceIncomeService(prisma).getIncome(period, 0.006);
    expect(r.orderOnline).toBe(100);
    expect(r.orderOffline).toBe(200);
    expect(r.grossTotal).toBe(300);
  });

  it('排除 0 元单、补发单、重做单与 RESHIP', async () => {
    const prisma: any = makePrisma({
      orders: [
        { id: 'a', amountTotal: 0, paymentMethod: 'RESHIP', paidAt: new Date('2026-11-03T02:00:00Z'), remakeFromOrderId: null, reshipFromOrderId: 'x' },
        { id: 'b', amountTotal: 500, paymentMethod: 'WECHAT_PAY', paidAt: new Date('2026-11-03T02:00:00Z'), remakeFromOrderId: 'y', reshipFromOrderId: null },
        { id: 'c', amountTotal: 300, paymentMethod: 'WECHAT_PAY', paidAt: new Date('2026-11-03T02:00:00Z'), remakeFromOrderId: null, reshipFromOrderId: null },
      ],
    });
    const r = await new FinanceIncomeService(prisma).getIncome(period, 0.006);
    expect(r.orderOnline).toBe(300);
  });

  it('补剂与定制食谱分别计入，退款冲减并区分历史订单退款', async () => {
    const prisma: any = makePrisma({
      supplements: [{ id: 's1', amountTotal: 400, paidAt: new Date('2026-11-04T02:00:00Z') }],
      customRecipes: [{ id: 'c1', actualPaidAmount: 299, amount: 300, paymentConfirmedAt: new Date('2026-11-04T03:00:00Z') }],
      orderRefunds: [
        { amount: 50, success: true, order: { paidAt: new Date('2026-10-20T03:00:00Z') } },
        { amount: 20, success: true, order: { paidAt: new Date('2026-11-01T03:00:00Z') } },
      ],
    });
    const r = await new FinanceIncomeService(prisma).getIncome(period, 0.006);
    expect(r.supplement).toBe(400);
    expect(r.customRecipe).toBe(299);
    expect(r.refundTotal).toBe(70);
    expect(r.historicalRefundTotal).toBe(50);
  });

  it('补剂退款冲减收入，手续费按线上基数计', async () => {
    const prisma: any = makePrisma({
      orders: [{ id: 'o1', amountTotal: 1000, paymentMethod: 'WECHAT_PAY', paidAt: new Date('2026-11-02T02:00:00Z'), remakeFromOrderId: null, reshipFromOrderId: null }],
      supplements: [{ id: 's1', amountTotal: 400, paidAt: new Date('2026-11-04T02:00:00Z'), refundAmount: 100, refundedAt: new Date('2026-11-06T02:00:00Z'), paymentMethod: 'WECHAT_PAY' }],
      orderRefunds: [{ amount: 500, success: true, order: { paidAt: new Date('2026-11-02T02:00:00Z') } }],
    });
    const r = await new FinanceIncomeService(prisma).getIncome(period, 0.006);
    expect(r.supplement).toBe(400);
    expect(r.refundTotal).toBe(600);
    // (1000 订单 + 400 补剂 − 500 订单退款 − 100 补剂退款) × 0.006 = 4.8
    expect(r.fee).toBe(4.8);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/finance/finance-income.service.spec.ts -v`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 `FinanceIncomeService`**

四个私有取数方法（订单、补剂、定制食谱、退款）各自 `findMany`，统一 `select` 最小字段。筛选条件写在查询里（`paidAt: { gte, lte }`），排除条件见 Global Constraints。退款三处：`orderRefundRecord`（微信原路）、`orderOfflineRefund`（线下登记，Task 9 接入）、`supplementOrder.refundAmount`；按退款成功日落在区间取。`historicalRefundTotal` = 退款对应订单的 `paidAt` 早于 `FINANCE_START_DATE` 的部分。`fee` 用 `computeFeeAmount` 对「订单线上 + 补剂线上 + 定制食谱线上」的实收与该部分退款计一次。

- [ ] **Step 4: 跑测试至全绿**

Run: `cd backend && npx jest tests/application/finance/finance-income.service.spec.ts -v`
Expected: 5 个用例 PASS。

- [ ] **Step 5: 提交**

```bash
bash scripts/session.sh commit -m "feat(finance): 收入/退款/手续费聚合"
```

---

## Task 4: 支出聚合

**Files:**
- Create: `backend/src/application/finance/finance-expense.service.ts`
- Test: `backend/tests/application/finance/finance-expense.service.spec.ts`

**Interfaces:**
- Consumes: `FinancePeriod`、`FINANCE_EXPENSE_CATEGORY_LABELS`
- Produces:
  - `type FinanceExpenseCategoryAmount = { category: FinanceExpenseCategory; label: string; amount: number }`
  - `type FinanceExpense = { total: number; byCategory: FinanceExpenseCategoryAmount[] }`
  - `FinanceExpenseService.getExpense(period: FinancePeriod, fee: number): Promise<FinanceExpense>`

- [ ] **Step 1: 写失败测试**

```ts
// backend/tests/application/finance/finance-expense.service.spec.ts
import { FinanceExpenseService } from 'src/application/finance/finance-expense.service';
import { monthRange } from 'src/application/finance/finance-period';

const period = monthRange('2026-11');

const makePrisma = (data: any = {}) => ({
  purchaseList: { findMany: jest.fn().mockResolvedValue(data.purchaseLists ?? []) },
  order: { findMany: jest.fn().mockResolvedValue(data.orders ?? []) },
  expenseBill: { findMany: jest.fn().mockResolvedValue(data.bills ?? []) },
  financeManualEntry: { findMany: jest.fn().mockResolvedValue(data.manualEntries ?? []) },
});

describe('FinanceExpenseService', () => {
  it('补货单按权重摊实付：个人消费只冲商品，不冲运费', async () => {
    const prisma: any = makePrisma({
      purchaseLists: [
        // 数据形状：subtotal 900 = 商品行 800 + 个人 100；实付 1000 = subtotal 900 + 运费 100
        { id: 'p1', kind: 'STOCK_REPLENISHMENT', paidAmount: 1000, personalAmount: 100, subtotalAmount: 900, shippingFee: 100, packagingFee: 0, discountAmount: 0,
          items: [{ type: 'FOOD', estimatedCost: 800 }] },
        { id: 'p2', kind: 'STOCK_REPLENISHMENT', paidAmount: 200, personalAmount: 0, subtotalAmount: 200, shippingFee: 0, packagingFee: 0, discountAmount: 0,
          items: [{ type: 'PACKAGING', estimatedCost: 200 }] },
      ],
    });
    const r = await new FinanceExpenseService(prisma).getExpense(period, 0);
    // 可分摊 900：商品行权重 800、运费权重 100（合计 900）→ 食材 800、物流 100
    expect(r.byCategory.find((c) => c.category === 'RAW_MATERIAL')!.amount).toBe(800);
    expect(r.byCategory.find((c) => c.category === 'LOGISTICS_DELIVERY')!.amount).toBe(100);
    expect(r.byCategory.find((c) => c.category === 'PACKAGING_SUPPLIES')!.amount).toBe(200);
    expect(r.total).toBe(1100);
  });

  it('日采单按采购记录实际成本计入，不与补货口径重复', async () => {
    const prisma: any = makePrisma({
      purchaseLists: [
        { id: 'd1', kind: 'ORDER_DEMAND', paidAmount: null, personalAmount: 0, subtotalAmount: null, shippingFee: null, packagingFee: null, discountAmount: null,
          items: [{ type: 'FOOD', estimatedCost: 0 }],
          records: [{ actualCost: 300, purchasedAt: new Date('2026-11-08T02:00:00Z') }, { actualCost: 200, purchasedAt: new Date('2026-11-09T02:00:00Z') }] },
      ],
    });
    const r = await new FinanceExpenseService(prisma).getExpense(period, 0);
    expect(r.byCategory.find((c) => c.category === 'RAW_MATERIAL')!.amount).toBe(500);
    expect(r.total).toBe(500);
  });

  it('paidAmount 为空时用四项兜底，四舍五入到分', async () => {
    const prisma: any = makePrisma({
      purchaseLists: [
        { id: 'p1', paidAmount: null, personalAmount: 0, subtotalAmount: 99.99, shippingFee: 0.01, packagingFee: 0, discountAmount: 0,
          items: [{ type: 'FOOD', estimatedCost: 99.99 }] },
      ],
    });
    const r = await new FinanceExpenseService(prisma).getExpense(period, 0);
    expect(r.total).toBe(100);
  });

  it('快递费按实际运费计入物流', async () => {
    const prisma: any = makePrisma({ orders: [{ id: 'o1', actualShippingFee: 86, shippedAt: new Date('2026-11-05T02:00:00Z') }] });
    const r = await new FinanceExpenseService(prisma).getExpense(period, 0);
    expect(r.byCategory.find((c) => c.category === 'LOGISTICS_DELIVERY')!.amount).toBe(86);
  });

  it('跨月账单按服务期平均分摊，本月只摊应得部分', async () => {
    const prisma: any = makePrisma({
      bills: [{ id: 'b1', amount: 1200, category: 'NETWORK_COMMUNICATION',
        recognitionStart: new Date('2026-11-01T00:00:00Z'), recognitionEnd: new Date('2027-10-31T00:00:00Z') }],
    });
    const r = await new FinanceExpenseService(prisma).getExpense(period, 0);
    expect(r.byCategory.find((c) => c.category === 'NETWORK_COMMUNICATION')!.amount).toBe(100);
  });

  it('手续费作为一类支出合并，可为负', async () => {
    const prisma: any = makePrisma({});
    const r = await new FinanceExpenseService(prisma).getExpense(period, -3);
    expect(r.byCategory.find((c) => c.category === 'PAYMENT_FEE')!.amount).toBe(-3);
  });

  it('结果按金额倒序，合计等于分类相加', async () => {
    const prisma: any = makePrisma({ orders: [{ id: 'o1', actualShippingFee: 10, shippedAt: new Date('2026-11-05T02:00:00Z') }],
      manualEntries: [{ id: 'm1', amount: 99, occurredAt: new Date('2026-11-06T02:00:00Z'), category: 'EQUIPMENT' }] });
    const r = await new FinanceExpenseService(prisma).getExpense(period, 0);
    expect(r.byCategory.map((c) => c.category)).toEqual(['EQUIPMENT', 'LOGISTICS_DELIVERY']);
    expect(r.total).toBe(Number((r.byCategory.reduce((s, c) => s + c.amount, 0)).toFixed(2)));
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/finance/finance-expense.service.spec.ts -v`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 `FinanceExpenseService`**

采购：查 `purchaseList`（`status` 非草稿、`voidedAt` 为空、`completedAt ?? createdAt` 落在期间），带 `items`（`type`、`estimatedCost`）。金额 = 实付 − 个人消费；按 `items.type` 占比拆到 `RAW_MATERIAL`/`SUPPLEMENT`/`PACKAGING_SUPPLIES`，运费归 `LOGISTICS_DELIVERY`、包装费归 `PACKAGING_SUPPLIES`，优惠按行占比摊减。
快递：`order.shippedAt` 落在期间且 `actualShippingFee` 非空。
固定费用：查账单，按服务期月数把 `amount` 摊到每个月，取与本期间重叠月份之和。
手工：查 `financeManualEntry`（`direction = EXPENSE`、未作废）。
手续费：作为 `PAYMENT_FEE` 一类并入。
最后排序、`total` 求和。

- [ ] **Step 4: 跑测试至全绿**

Run: `cd backend && npx jest tests/application/finance/finance-expense.service.spec.ts -v`
Expected: 6 个用例 PASS。

- [ ] **Step 5: 提交**

```bash
bash scripts/session.sh commit -m "feat(finance): 支出聚合（采购/快递/固定费用/手工/手续费）"
```

---

## Task 5: 汇总服务与首页接口

**Files:**
- Create: `backend/src/application/finance/finance-summary.service.ts`
- Create: `backend/src/interfaces/controllers/admin-finance-v2.controller.ts`
- Create: `backend/src/interfaces/dto/finance/finance-range.query.dto.ts`
- Modify: `backend/src/app.module.ts`（注册新服务与控制器）
- Test: `backend/tests/application/finance/finance-summary.service.spec.ts`

**Interfaces:**
- Consumes: `FinanceIncomeService.getIncome`、`FinanceExpenseService.getExpense`、`resolvePeriod`、`monthRange`
- Produces:
  - `type FinanceSummary = { range: { from: string; to: string }; income: FinanceIncome; expense: FinanceExpense; balance: number; pendingOfflineConfirmCount: number }`
  - `FinanceSummaryService.getSummary(query: { from?: string; to?: string; month?: string }, now?: Date): Promise<FinanceSummary>`
  - `GET /api/v1/admin/finance/dashboard` → `FinanceSummary`（`AdminGuard`）

- [ ] **Step 1: 写失败测试（重点：汇总 = 明细相加，且负结余正确）**

```ts
// backend/tests/application/finance/finance-summary.service.spec.ts
import { FinanceSummaryService } from 'src/application/finance/finance-summary.service';

describe('FinanceSummaryService', () => {
  it('结余 = 收入净额 − 支出合计；待确认收款按线下未付款单数统计', async () => {
    const income = { orderOnline: 1000, orderOffline: 200, supplement: 0, customRecipe: 0, grossTotal: 1200, refundTotal: 200, historicalRefundTotal: 0, netTotal: 1000, fee: 6 };
    const expense = { total: 700, byCategory: [{ category: 'RAW_MATERIAL', label: '原料采购', amount: 700 }] };
    const service = new FinanceSummaryService(
      { getIncome: jest.fn().mockResolvedValue(income) } as any,
      { getExpense: jest.fn().mockResolvedValue(expense) } as any,
      { order: { count: jest.fn().mockResolvedValue(2) } } as any,
      { getFeeRate: jest.fn().mockResolvedValue(0.006) } as any,
    );
    const r = await service.getSummary({ month: '2026-11' });
    expect(r.balance).toBe(300);
    expect(r.pendingOfflineConfirmCount).toBe(2);
    expect(r.range.from).toBe('2026-11-01T00:00:00.000+08:00');
  });

  it('支出大于收入时结余为负，不取绝对值', async () => {
    const income = { orderOnline: 100, orderOffline: 0, supplement: 0, customRecipe: 0, grossTotal: 100, refundTotal: 0, historicalRefundTotal: 0, netTotal: 100, fee: 0.6 };
    const expense = { total: 500, byCategory: [] };
    const service = new FinanceSummaryService(
      { getIncome: jest.fn().mockResolvedValue(income) } as any,
      { getExpense: jest.fn().mockResolvedValue(expense) } as any,
      { order: { count: jest.fn().mockResolvedValue(0) } } as any,
      { getFeeRate: jest.fn().mockResolvedValue(0.006) } as any,
    );
    expect((await service.getSummary({ month: '2026-11' })).balance).toBe(-400);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/finance/finance-summary.service.spec.ts -v`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现汇总服务**

先读费率（`FinanceConfigService` 读 `GlobalConfig`，缺省 0.006，本任务里用同名小服务或直接注入 Prisma），再算收入、支出，`balance = netTotal - expense.total`，`pendingOfflineConfirmCount` = 线下支付方式且 `paidAt` 为空、未取消的订单数。日期输出为带 `+08:00` 的字符串。

- [ ] **Step 4: 建控制器与 DTO，注册到 `app.module.ts`**

`GET dashboard`：`@UseGuards(AdminGuard)`，query 接受 `from`/`to`/`month`，返回 `ApiResponseDto.success(summary)`。

- [ ] **Step 5: 写权限失败测试**

```ts
// backend/tests/interfaces/controllers/admin-finance-v2.controller.spec.ts
import { ForbiddenException } from '@nestjs/common';
import { AdminGuard } from 'src/interfaces/guards/role.guard';

const ctx = (role?: string) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ user: role ? { role } : undefined }) }) } as any);

describe('财务接口权限', () => {
  it('STAFF 被拒绝', () => expect(() => new AdminGuard().canActivate(ctx('STAFF'))).toThrow(ForbiddenException));
  it('未登录被拒绝', () => expect(() => new AdminGuard().canActivate(ctx())).toThrow(ForbiddenException));
  it('ADMIN 放行', () => expect(new AdminGuard().canActivate(ctx('ADMIN'))).toBe(true));
});
```

- [ ] **Step 6: 跑测试 + 编译**

Run: `cd backend && npx jest tests/application/finance/finance-summary.service.spec.ts tests/interfaces/controllers/admin-finance-v2.controller.spec.ts -v && npx tsc --noEmit`
Expected: 测试 PASS、类型检查无新增错误。

- [ ] **Step 7: 提交**

```bash
bash scripts/session.sh commit -m "feat(finance): 汇总服务与首页接口"
```

---

## Task 6: 收支明细

**Files:**
- Create: `backend/src/application/finance/finance-entries.service.ts`
- Modify: `backend/src/interfaces/controllers/admin-finance-v2.controller.ts`
- Test: `backend/tests/application/finance/finance-entries.service.spec.ts`

**Interfaces:**
- Produces:
  - `type FinanceEntry = { id: string; occurredAt: string; direction: 'INCOME' | 'EXPENSE'; category: string; label: string; amount: number; title: string; sourceType: 'ORDER' | 'SUPPLEMENT_ORDER' | 'CUSTOM_RECIPE_ORDER' | 'ORDER_REFUND' | 'PURCHASE' | 'SHIPPING' | 'BILL' | 'FEE' | 'MANUAL'; sourceId: string; sourceNo?: string; payerType?: 'COMPANY' | 'PERSONAL'; isRefund: boolean; isHistorical: boolean }`
  - `FinanceEntriesService.list(query: { from?: string; to?: string; month?: string; direction?: 'INCOME' | 'EXPENSE'; category?: string; page?: number; pageSize?: number }): Promise<{ items: FinanceEntry[]; total: number; page: number; pageSize: number; truncated: boolean }>`
  - `GET /api/v1/admin/finance/entries`

- [ ] **Step 1: 写失败测试**

```ts
// backend/tests/application/finance/finance-entries.service.spec.ts
import { FinanceEntriesService } from 'src/application/finance/finance-entries.service';

const makePrisma = (data: any = {}) => ({
  order: { findMany: jest.fn().mockResolvedValue(data.orders ?? []) },
  supplementOrder: { findMany: jest.fn().mockResolvedValue([]) },
  customRecipeOrder: { findMany: jest.fn().mockResolvedValue([]) },
  orderRefundRecord: { findMany: jest.fn().mockResolvedValue(data.refunds ?? []) },
  orderOfflineRefund: { findMany: jest.fn().mockResolvedValue([]) },
  purchaseList: { findMany: jest.fn().mockResolvedValue(data.purchases ?? []) },
  expenseBill: { findMany: jest.fn().mockResolvedValue([]) },
  financeManualEntry: { findMany: jest.fn().mockResolvedValue(data.manual ?? []) },
});

describe('FinanceEntriesService', () => {
  it('按时间倒序合并，退款是负的收入行', async () => {
    const prisma: any = makePrisma({
      orders: [{ id: 'o1', orderNo: 'SK1', amountTotal: 300, paymentMethod: 'WECHAT_PAY', paidAt: new Date('2026-11-02T02:00:00Z') }],
      refunds: [{ id: 'r1', amount: 100, successTime: new Date('2026-11-03T02:00:00Z'), order: { orderNo: 'SK1', paidAt: new Date('2026-11-02T02:00:00Z') } }],
      manual: [{ id: 'm1', amount: 50, occurredAt: new Date('2026-11-01T02:00:00Z'), category: 'EQUIPMENT', title: '封口机', direction: 'EXPENSE', payerType: 'PERSONAL' }],
    });
    const r = await new FinanceEntriesService(prisma).list({ month: '2026-11' } as any);
    expect(r.items.map((i) => i.id)).toEqual(['r1', 'o1', 'm1']);
    expect(r.items[0]).toMatchObject({ direction: 'INCOME', amount: -100, isRefund: true });
  });

  it('汇总与明细自洽：明细金额相加等于收支合计', async () => {
    const prisma: any = makePrisma({
      orders: [{ id: 'o1', orderNo: 'SK1', amountTotal: 300, paymentMethod: 'OFFLINE_WECHAT', paidAt: new Date('2026-11-02T02:00:00Z') }],
      purchases: [{ id: 'p1', paidAmount: 120, personalAmount: 20, subtotalAmount: 120, shippingFee: 0, packagingFee: 0, discountAmount: 0,
        items: [{ type: 'FOOD', estimatedCost: 120 }] }],
    });
    const r = await new FinanceEntriesService(prisma).list({ month: '2026-11' } as any);
    const income = r.items.filter((i) => i.direction === 'INCOME').reduce((s, i) => s + i.amount, 0);
    const expense = r.items.filter((i) => i.direction === 'EXPENSE').reduce((s, i) => s + i.amount, 0);
    expect(income).toBe(300);
    expect(expense).toBe(100);
  });

  it('分页在合并排序之后进行', async () => {
    const prisma: any = makePrisma({
      manual: [1, 2, 3].map((n) => ({ id: `m${n}`, amount: n, occurredAt: new Date(`2026-11-0${n}T02:00:00Z`), category: 'OTHER', title: `t${n}`, direction: 'EXPENSE', payerType: 'PERSONAL' })),
    });
    const r = await new FinanceEntriesService(prisma).list({ month: '2026-11', page: 2, pageSize: 2 } as any);
    expect(r.items.map((i) => i.id)).toEqual(['m1']);
    expect(r.total).toBe(3);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/finance/finance-entries.service.spec.ts -v`
Expected: FAIL。

- [ ] **Step 3: 实现 `FinanceEntriesService`**

八个来源各写一个 `private async loadXxx(period): Promise<FinanceEntry[]>`，规则与 Task 3/4 一致（同一套排除条件抽成模块内私有函数，两处共用）。合并后按 `occurredAt` 倒序、同时间按 `id` 兜底排序，再内存分页；总条数超过 5000 时截断并在返回值里带 `truncated: true`。

- [ ] **Step 4: 加 `GET /entries` 接口**

`@UseGuards(AdminGuard)`，query：`from`/`to`/`month`/`direction`/`category`/`page`/`pageSize`。

- [ ] **Step 5: 跑测试 + 类型检查**

Run: `cd backend && npx jest tests/application/finance/finance-entries.service.spec.ts -v && npx tsc --noEmit`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
bash scripts/session.sh commit -m "feat(finance): 收支明细合并与分页"
```

---

## Task 7: 记一笔（手工收支）

**Files:**
- Create: `backend/src/application/finance/finance-manual-entry.service.ts`
- Create: `backend/src/interfaces/dto/finance/create-manual-entry.dto.ts`
- Modify: `backend/src/interfaces/controllers/admin-finance-v2.controller.ts`
- Test: `backend/tests/application/finance/finance-manual-entry.service.spec.ts`

**Interfaces:**
- Produces:
  - `FinanceManualEntryService.create(userId: string, input: CreateManualEntryInput): Promise<{ id: string }>`
  - `FinanceManualEntryService.update(userId: string, id: string, input: Partial<CreateManualEntryInput>): Promise<{ id: string }>`
  - `FinanceManualEntryService.void(userId: string, id: string, reason: string): Promise<{ id: string }>`
  - `POST /manual-entries`、`PATCH /manual-entries/:id`、`POST /manual-entries/:id/void`

- [ ] **Step 1: 写失败测试**

```ts
// backend/tests/application/finance/finance-manual-entry.service.spec.ts
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FinanceManualEntryService } from 'src/application/finance/finance-manual-entry.service';

const makePrisma = (row: any = null) => ({
  financeManualEntry: {
    create: jest.fn().mockResolvedValue({ id: 'new' }),
    findUnique: jest.fn().mockResolvedValue(row),
    update: jest.fn().mockResolvedValue({ id: 'm1' }),
  },
});

describe('FinanceManualEntryService', () => {
  it('金额必须大于 0', async () => {
    const s = new FinanceManualEntryService(makePrisma() as any);
    await expect(s.create('u1', { direction: 'EXPENSE', amount: 0, occurredAt: '2026-11-05', category: 'EQUIPMENT', title: 'x' } as any))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('支出必须有类别，收入必须有收入类别', async () => {
    const s = new FinanceManualEntryService(makePrisma() as any);
    await expect(s.create('u1', { direction: 'EXPENSE', amount: 10, occurredAt: '2026-11-05', title: 'x' } as any))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(s.create('u1', { direction: 'INCOME', amount: 10, occurredAt: '2026-11-05', title: 'x' } as any))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('发生日早于起账日被拒绝', async () => {
    const s = new FinanceManualEntryService(makePrisma() as any);
    await expect(s.create('u1', { direction: 'EXPENSE', amount: 10, occurredAt: '2026-10-31', category: 'OTHER', title: 'x' } as any))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('作废已作废的条目报找不到', async () => {
    const s = new FinanceManualEntryService(makePrisma({ id: 'm1', voidedAt: new Date() }) as any);
    await expect(s.void('u1', 'm1', '录错')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('作废写入 voidedAt 与原因', async () => {
    const prisma: any = makePrisma({ id: 'm1', voidedAt: null });
    await new FinanceManualEntryService(prisma).void('u1', 'm1', '录错');
    expect(prisma.financeManualEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ voidReason: '录错' }) }),
    );
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/finance/finance-manual-entry.service.spec.ts -v`
Expected: FAIL。

- [ ] **Step 3: 实现服务与 DTO**

校验顺序：金额 > 0 → 方向合法 → 类别齐全 → 日期不早于起账日。`occurredAt` 以 `YYYY-MM-DD` 字符串入参，落库为当天上海零点。

- [ ] **Step 4: 接三个接口并跑测试**

Run: `cd backend && npx jest tests/application/finance/finance-manual-entry.service.spec.ts -v && npx tsc --noEmit`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
bash scripts/session.sh commit -m "feat(finance): 记一笔（手工收支与作废）"
```

---

## Task 8: 固定费用（模板、补生成、标记已付）

**Files:**
- Modify: `backend/src/application/finance/expense-template.service.ts`
- Modify: `backend/src/application/finance/expense-bill.service.ts`
- Create: `backend/src/interfaces/dto/finance/pay-expense-bill.dto.ts`
- Modify: `backend/src/interfaces/controllers/admin-finance-v2.controller.ts`
- Test: `backend/tests/application/finance/expense-bill.service.spec.ts`（重写）

**Interfaces:**
- Produces:
  - `ExpenseTemplateService.create(userId, input)` 支持 `interval: 'MONTHLY' | 'QUARTERLY' | 'YEARLY'`、`payerType`
  - `ExpenseTemplateService.generateForMonth(month: string): Promise<{ created: number }>`（按模板补生成指定月份，幂等）
  - `ExpenseBillService.listForMonth(month: string)`
  - `ExpenseBillService.pay(userId, billId, input: { paidAmount?: number; paidAt?: string; payerType?: 'COMPANY' | 'PERSONAL' })`
  - `GET /templates`、`POST /templates`、`PATCH /templates/:id`、`POST /templates/:id/deactivate`、`GET /bills?month=`、`POST /bills/:id/pay`、`POST /bills/generate`

- [ ] **Step 1: 写失败测试（幂等、季度、分摊、付款方）**

```ts
// backend/tests/application/finance/expense-bill.service.spec.ts
import { ExpenseTemplateService } from 'src/application/finance/expense-template.service';

const makeTemplatePrisma = (existing: string[] = []) => ({
  expenseTemplate: {
    findMany: jest.fn().mockResolvedValue([
      { id: 't1', name: '房租', titleTemplate: '{{month}} 房租', category: 'RENT', payeeName: '房东',
        defaultAmount: 6000, interval: 'MONTHLY', dayOfMonth: 5, monthOfYear: null, servicePeriodMonths: 1,
        payerType: 'PERSONAL', payerUserId: 'u1', isActive: true },
    ]),
  },
  expenseBill: {
    findMany: jest.fn().mockResolvedValue(existing.map((id) => ({ templateId: id }))),
    createMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
});

describe('ExpenseTemplateService 补生成', () => {
  it('同模板同月份已有账单时跳过，保证幂等', async () => {
    const prisma: any = makeTemplatePrisma(['t1']);
    const r = await new ExpenseTemplateService(prisma as any).generateForMonth('2026-11');
    expect(r.created).toBe(0);
    expect(prisma.expenseBill.createMany).not.toHaveBeenCalled();
  });

  it('没有账单时生成一条，费属期间为整月', async () => {
    const prisma: any = makeTemplatePrisma([]);
    const r = await new ExpenseTemplateService(prisma as any).generateForMonth('2026-11');
    expect(r.created).toBe(1);
    const arg = prisma.expenseBill.createMany.mock.calls[0][0].data[0];
    expect(arg.amount).toBe(6000);
    expect(arg.payerType).toBe('PERSONAL');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/finance/expense-bill.service.spec.ts -v`
Expected: FAIL（`generateForMonth` 不存在）。

- [ ] **Step 3: 实现 `generateForMonth`**

查启用模板 → 判断该月是否应生成（`MONTHLY` 每月、`QUARTERLY` 的 1/4/7/10 月、`YEARLY` 的 `monthOfYear` 月）→ 排除已存在 `templateId + 该月` 的账单 → `createMany` 写入，`recognitionStart` 为该月 1 日、`recognitionEnd` 按 `servicePeriodMonths` 顺延。保留原有每日定时任务，改为调用 `generateForMonth(当月)`。

- [ ] **Step 4: 实现 `pay`**

校验账单存在、状态不是 `CANCELLED`；写 `ExpenseBillPayment`（`payerType` 默认取账单上的），更新账单 `status` 与累计实付；`paidAmount` 缺省用账单金额。

- [ ] **Step 5: 接接口 + 跑测试**

Run: `cd backend && npx jest tests/application/finance -v && npx tsc --noEmit`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
bash scripts/session.sh commit -m "feat(finance): 固定费用模板、补生成与标记已付"
```

---

## Task 9: 线下退款登记

**Files:**
- Create: `backend/src/application/order/order-offline-refund.service.ts`
- Create: `backend/src/interfaces/dto/order/register-offline-refund.dto.ts`
- Modify: `backend/src/interfaces/controllers/admin.controller.ts`（加两个接口）
- Modify: `backend/src/app.module.ts`
- Test: `backend/tests/application/order/order-offline-refund.service.spec.ts`

**Interfaces:**
- Produces:
  - `OrderOfflineRefundService.register(operatorId: string, orderId: string, input: { amount: number; refundedAt: string; method: 'WECHAT' | 'ALIPAY' | 'CASH' | 'OTHER'; note?: string; proofKeys?: string[] }): Promise<{ id: string; totalRefunded: number; remaining: number }>`
  - `OrderOfflineRefundService.list(orderId: string)`
  - `POST /api/v1/admin/orders/:orderId/offline-refund`
  - `GET /api/v1/admin/orders/:orderId/offline-refunds`

- [ ] **Step 1: 写失败测试**

```ts
// backend/tests/application/order/order-offline-refund.service.spec.ts
import { BadRequestException } from '@nestjs/common';
import { OrderOfflineRefundService } from 'src/application/order/order-offline-refund.service';

const makePrisma = (order: any, refunded = 0) => ({
  order: { findUnique: jest.fn().mockResolvedValue(order) },
  orderOfflineRefund: {
    aggregate: jest.fn().mockResolvedValue({ _sum: { amount: refunded } }),
    create: jest.fn().mockResolvedValue({ id: 'r1' }),
    findMany: jest.fn().mockResolvedValue([]),
  },
});

const offlineOrder = { id: 'o1', amountTotal: 699, paidAt: new Date(), paymentMethod: 'OFFLINE_WECHAT' };

describe('OrderOfflineRefundService', () => {
  it('线上支付的订单不允许登记线下退款', async () => {
    const s = new OrderOfflineRefundService(makePrisma({ ...offlineOrder, paymentMethod: 'WECHAT_PAY' }) as any);
    await expect(s.register('u1', 'o1', { amount: 100, refundedAt: '2026-11-05', method: 'WECHAT' } as any))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('未付款订单不允许登记', async () => {
    const s = new OrderOfflineRefundService(makePrisma({ ...offlineOrder, paidAt: null }) as any);
    await expect(s.register('u1', 'o1', { amount: 100, refundedAt: '2026-11-05', method: 'WECHAT' } as any))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('累计退款不得超过实收', async () => {
    const s = new OrderOfflineRefundService(makePrisma(offlineOrder, 650) as any);
    await expect(s.register('u1', 'o1', { amount: 100, refundedAt: '2026-11-05', method: 'WECHAT' } as any))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('合法登记返回累计与剩余', async () => {
    const prisma: any = makePrisma(offlineOrder, 599);
    const r = await new OrderOfflineRefundService(prisma).register('u1', 'o1', { amount: 100, refundedAt: '2026-11-05', method: 'WECHAT' } as any);
    expect(r.totalRefunded).toBe(699);
    expect(r.remaining).toBe(0);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/order/order-offline-refund.service.spec.ts -v`
Expected: FAIL。

- [ ] **Step 3: 实现服务**

校验：订单存在 → `paidAt` 非空 → `paymentMethod` 属线下集合 → `amount > 0`（两位小数）→ `已退 + 本次 ≤ amountTotal`。写入后返回累计与剩余。

- [ ] **Step 4: 接接口（`@UseGuards(AdminGuard)`）并跑测试**

Run: `cd backend && npx jest tests/application/order/order-offline-refund.service.spec.ts -v && npx tsc --noEmit`
Expected: PASS。

- [ ] **Step 5: 把线下退款接进收入聚合**

在 `FinanceIncomeService` 与 `FinanceEntriesService` 的退款取数里加入 `orderOfflineRefund`（`voidedAt` 为空），并按订单 `paidAt` 判断是否历史订单退款；补一条断言到 Task 3 的测试文件。

- [ ] **Step 6: 提交**

```bash
bash scripts/session.sh commit -m "feat(finance): 订单线下退款登记并计入收入减项"
```

---

## Task 10: 代客下单一步收款

**Files:**
- Modify: `backend/src/interfaces/controllers/staff-customer-service.controller.ts:213-340`
- Modify: `backend/src/application/order/order.service.ts`（`confirmOfflinePayment` 支持指定支付渠道）
- Test: `backend/tests/regression/assisted-order-payment.spec.ts`

**Interfaces:**
- Consumes: `OrderService.confirmOfflinePayment(orderId, operatorId, actualAmount, channel?)`
- Produces: `POST /api/v1/staff-customer-service/orders/assisted` 在 `collected !== false` 时返回**已付款**订单（`paidAt` 非空、`paymentMethod = 'OFFLINE_WECHAT' | 'OFFLINE_ALIPAY' | 'OTHER'`）。

- [ ] **Step 1: 写失败测试（源码守卫，仓库已有先例）**

```ts
// backend/tests/regression/assisted-order-payment.spec.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const controller = readFileSync(
  join(__dirname, '../../src/interfaces/controllers/staff-customer-service.controller.ts'),
  'utf8',
);
const orderService = readFileSync(
  join(__dirname, '../../src/application/order/order.service.ts'),
  'utf8',
);

describe('代客下单一步收款', () => {
  it('控制器默认视为已收款，只有显式 false 才跳过', () => {
    expect(controller).toContain('confirmOfflinePayment');
    expect(controller).toMatch(/collected\s*!==\s*false/);
  });

  it('确认收款支持指定线下渠道，缺省 OFFLINE_WECHAT', () => {
    expect(orderService).toMatch(/channel\s*[:=][^;]*OFFLINE_WECHAT/s);
    expect(orderService).toContain("'OFFLINE_ALIPAY'");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/regression/assisted-order-payment.spec.ts -v`
Expected: FAIL（控制器里还没有 `confirmOfflinePayment` 调用）。

- [ ] **Step 3: 改控制器与 service**

建单后若 `collected !== false`，调用 `confirmOfflinePayment(orderId, operatorId, actualAmount, channel)`；`OrderService.confirmOfflinePayment` 增加可选 `channel` 参数（缺省 `OFFLINE_WECHAT`，允许 `OFFLINE_ALIPAY`/`OTHER`），写入 `paymentMethod` 与 `paidAt`。控制器构造是 `(prisma, orderService, addressService)`。

- [ ] **Step 4: 跑测试至全绿 + 类型检查**

Run: `cd backend && npx jest tests/regression/assisted-order-payment.spec.ts -v && npx tsc --noEmit`
Expected: 2 个用例 PASS。

- [ ] **Step 5: 提交**

```bash
bash scripts/session.sh commit -m "feat(order): 代客下单一步收款"
```

---

## Task 11: 小程序 API 层与财务首页

**Files:**
- Create: `miniapp/src/api/staff-finance.ts`
- Create: `miniapp/src/pages/staff-finance/index.vue`
- Create: `miniapp/src/pages/staff-finance/index.ui.regression.spec.ts`
- Modify: `miniapp/src/pages.json`（新增分包 `pages/staff-finance`）
- Modify: `miniapp/src/pages/staff-workbench/index.vue`（加「财务」入口，仅 ADMIN）
- Test: 同目录回归 spec

**Interfaces:**
- Produces:
  - `staffFinanceApi.getDashboard(params: { month?: string; from?: string; to?: string })`
  - `staffFinanceApi.listEntries(params)`
  - `staffFinanceApi.createManualEntry(payload)` / `updateManualEntry` / `voidManualEntry`
  - `staffFinanceApi.listTemplates()` / `createTemplate` / `updateTemplate` / `deactivateTemplate`
  - `staffFinanceApi.listBills(month)` / `payBill(id, payload)` / `generateBills(month)`

- [ ] **Step 1: 写回归 spec（断言页面结构存在）**

```ts
// miniapp/src/pages/staff-finance/index.ui.regression.spec.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf8');

describe('财务首页', () => {
  const page = read('./index.vue');
  it('首屏是「你赚了」而不是「我花了」', () => {
    expect(page).toContain('这个月到现在，你赚了');
    expect(page).toContain('结余');
  });
  it('有固定费用整月计入的说明', () => {
    expect(page).toContain('已含本月固定费用');
  });
  it('有待确认线下收款的提醒入口', () => {
    expect(page).toContain('线下收款待确认');
  });
  it('有记一笔与固定费用两个入口', () => {
    expect(page).toContain('记一笔');
    expect(page).toContain('固定费用');
  });
  it('切到完整月份就是月报，并给出与上月的对比', () => {
    expect(page).toContain('完整月份');
    expect(page).toContain('比上月');
  });
});
```

- [ ] **Step 2: 跑 spec 确认失败**

Run: `cd miniapp && npx vitest run src/pages/staff-finance/index.ui.regression.spec.ts`
Expected: FAIL（文件不存在）。

- [ ] **Step 3: 写 `staff-finance.ts` API 层**

沿用 `miniapp/src/api/purchasing.ts` 的 `request` 用法与错误处理风格；每个方法返回 `Promise<T>`，类型写在同一文件里。

- [ ] **Step 4: 写首页 `index.vue`**

结构照原型：深绿导航 → 月份切换（默认「本月至今」，可切最近三个月或选月份）→ 深绿主卡（结余大字 + 收入/支出两列 + 一行「已含本月固定费用 ¥X」）→ 待确认收款提示条（0 时不显示）→ 支出分类条形 → 两个按钮 + 「查看全部明细」。

月份切到**完整月份**时，页面即月报：标签写「完整月份」，主卡下多一行「比上月 +¥X / −¥X」，11 月没有上月时写「从 11 月起账」。完整月份与本月至今必须走同一个接口、同一套渲染，只换 `month` 参数。

所有金额走统一 `formatMoney`，`onShow` 重新拉数。

- [ ] **Step 5: 注册分包与工作台入口**

`pages.json` 的 `subPackages` 加 `{ root: 'pages/staff-finance', pages: [{ path: 'index' }, { path: 'entries' }, { path: 'manual-entry' }, { path: 'bills' }] }`；工作台 `workbenchModules` 顶部加「财务」，`onTap` 跳 `/pages/staff-finance/index`，并用 `getStoredUser()?.role === 'ADMIN'` 过滤。

- [ ] **Step 6: 跑 spec 至全绿**

Run: `cd miniapp && npx vitest run src/pages/staff-finance/index.ui.regression.spec.ts`
Expected: 5 个用例 PASS。

- [ ] **Step 7: 提交**

```bash
bash scripts/session.sh commit -m "feat(miniapp): 财务首页与 API 层"
```

---

## Task 12: 收支明细页

**Files:**
- Create: `miniapp/src/pages/staff-finance/entries.vue`
- Create: `miniapp/src/pages/staff-finance/entries.ui.regression.spec.ts`

**Interfaces:**
- Consumes: `staffFinanceApi.listEntries`
- Produces: 筛选（全部/收入/支出/我垫的）、下拉加载、点击跳来源单据。

- [ ] **Step 1: 写回归 spec**

```ts
// miniapp/src/pages/staff-finance/entries.ui.regression.spec.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const page = readFileSync(join(__dirname, './entries.vue'), 'utf8');

describe('收支明细', () => {
  it('有四个筛选：全部/收入/支出/我垫的', () => {
    for (const t of ['全部', '收入', '支出', '我垫的']) expect(page).toContain(t);
  });
  it('退款显示为负数并带标记', () => {
    expect(page).toContain('isRefund');
    expect(page).toContain('退款');
  });
  it('每条能跳来源单据', () => {
    expect(page).toContain('sourceType');
  });
});
```

- [ ] **Step 2: 跑 spec 确认失败 → 实现页面 → 跑至全绿**

Run: `cd miniapp && npx vitest run src/pages/staff-finance/entries.ui.regression.spec.ts`
Expected: 先 FAIL，实现后 3 个用例 PASS。

- [ ] **Step 3: 提交**

```bash
bash scripts/session.sh commit -m "feat(miniapp): 收支明细页"
```

---

## Task 13: 记一笔页

**Files:**
- Create: `miniapp/src/pages/staff-finance/manual-entry.vue`
- Create: `miniapp/src/pages/staff-finance/manual-entry.ui.regression.spec.ts`

**Interfaces:**
- Consumes: `staffFinanceApi.createManualEntry`
- Produces: 金额、日期（默认今天）、收入/支出、类别、付款方、说明、凭证；保存后 `navigateBack` 并触发首页刷新。

- [ ] **Step 1: 写回归 spec**

```ts
// miniapp/src/pages/staff-finance/manual-entry.ui.regression.spec.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const page = readFileSync(join(__dirname, './manual-entry.vue'), 'utf8');

describe('记一笔', () => {
  it('类别是中文短词，不是会计科目', () => {
    for (const t of ['设备工具', '税费', '社保', '其他']) expect(page).toContain(t);
  });
  it('有付款方选择', () => {
    expect(page).toContain('我个人垫的');
    expect(page).toContain('公司账户');
  });
  it('金额必填且保存前校验', () => {
    expect(page).toContain('amount');
  });
});
```

- [ ] **Step 2: 跑 spec 确认失败 → 实现 → 跑至全绿**

Run: `cd miniapp && npx vitest run src/pages/staff-finance/manual-entry.ui.regression.spec.ts`
Expected: 3 个用例 PASS。

- [ ] **Step 3: 提交**

```bash
bash scripts/session.sh commit -m "feat(miniapp): 记一笔"
```

---

## Task 14: 固定费用页

**Files:**
- Create: `miniapp/src/pages/staff-finance/bills.vue`
- Create: `miniapp/src/pages/staff-finance/bills.ui.regression.spec.ts`

**Interfaces:**
- Consumes: `listBills` / `payBill` / `generateBills` / `listTemplates` / `createTemplate` / `updateTemplate` / `deactivateTemplate`
- Produces: 本月待付列表、标记已付（可改金额）、固定项目列表、新建/编辑/停用。

- [ ] **Step 1: 写回归 spec**

```ts
// miniapp/src/pages/staff-finance/bills.ui.regression.spec.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const page = readFileSync(join(__dirname, './bills.vue'), 'utf8');

describe('固定费用', () => {
  it('有本月待付与标记已付', () => {
    expect(page).toContain('待付');
    expect(page).toContain('标记已付');
  });
  it('支持补生成本月账单', () => {
    expect(page).toContain('补生成');
  });
  it('停用只影响以后', () => {
    expect(page).toContain('停用');
  });
});
```

- [ ] **Step 2: 跑 spec 确认失败 → 实现 → 跑至全绿**

Run: `cd miniapp && npx vitest run src/pages/staff-finance/bills.ui.regression.spec.ts`
Expected: 3 个用例 PASS。

- [ ] **Step 3: 提交**

```bash
bash scripts/session.sh commit -m "feat(miniapp): 固定费用页"
```

---

## Task 15: 订单详情登记线下退款 + 代客下单已收款 + 报销自定义费用收窄

**Files:**
- Modify: `miniapp/src/pages/staff-orders/detail.vue`
- Modify: `miniapp/src/pages/staff-assisted-order/confirm.vue`
- Modify: `miniapp/src/constants/reimbursement.ts`、`miniapp/src/pages/staff-purchasing/reimbursement/submit.vue`
- Modify: `miniapp/src/api/orders.ts`、`miniapp/src/api/staffAssistedOrder.ts`
- Create: `miniapp/src/pages/offline-refund.ui.regression.spec.ts`

**Interfaces:**
- Consumes: `POST /admin/orders/:orderId/offline-refund`、`GET /admin/orders/:orderId/offline-refunds`
- Produces: 订单详情出现「登记线下退款」（仅 ADMIN、仅线下收款已付款单）；代客确认页出现「已收款」开关（默认开）；报销自定义费用只剩水电/工具/杂项/其他。

- [ ] **Step 1: 写回归 spec**

```ts
// miniapp/src/pages/offline-refund.ui.regression.spec.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('线下退款入口', () => {
  const detail = readFileSync(join(__dirname, 'staff-orders/detail.vue'), 'utf8');
  it('订单详情有登记入口且只对管理员显示', () => {
    expect(detail).toContain('登记线下退款');
    expect(detail).toContain("role === 'ADMIN'");
  });
  it('代客下单有已收款开关且默认开启', () => {
    const confirm = readFileSync(join(__dirname, 'staff-assisted-order/confirm.vue'), 'utf8');
    expect(confirm).toContain('已收款');
    expect(confirm).toMatch(/collected\s*=\s*ref\(true\)/);
  });
  it('报销自定义费用不再出现房租与工资', () => {
    const constants = readFileSync(join(__dirname, '../constants/reimbursement.ts'), 'utf8');
    expect(constants).not.toContain("value: 'RENT'");
    expect(constants).not.toContain("value: 'PAYROLL'");
    expect(constants).toContain("value: 'UTILITIES'");
  });
});
```

- [ ] **Step 2: 跑 spec 确认失败 → 实现 → 跑至全绿**

实现要点：订单详情底部加「登记线下退款」（弹窗填金额/日期/渠道/备注），仅 `role === 'ADMIN'` 且订单为线下收款已付款；代客确认页加「已收款」开关默认 true，关闭时传 `collected: false`；`CUSTOM_FEE_CATEGORIES` 删掉 `RENT`、`PAYROLL`，默认项从 `RENT` 改成 `UTILITIES`（`submit.vue` 两处默认值同步改）。

Run: `cd miniapp && npx vitest run src/pages/offline-refund.ui.regression.spec.ts`
Expected: 3 个用例 PASS。

- [ ] **Step 3: 提交**

```bash
bash scripts/session.sh commit -m "feat(miniapp): 订单详情登记线下退款、代客单已收款开关、报销费用收窄"
```

---

## Task 16: 下线后台财务并删除旧代码

**Files:**
- Delete: `admin-web/src/views/Finance/`（整个目录）
- Delete: `admin-web/src/api/finance.ts`、`admin-web/src/types/finance.ts`
- Modify: `admin-web/src/router/index.ts`（删 `finance` 及其 4 个 redirect）
- Modify: `admin-web/src/constants/adminMenu.ts`（删「财务」菜单项）
- Modify: `admin-web/src/api/index.ts`（删 re-export）
- Delete: `backend/src/interfaces/controllers/admin-finance.controller.ts`
- Delete: `backend/src/application/finance/finance-report.service.ts`、`finance-alert.service.ts`、`finance-alert.service.spec.ts`（若存在）
- Modify: `backend/src/app.module.ts`（移除旧控制器与服务）
- Rename: `admin-finance-v2.controller.ts` → `admin-finance.controller.ts`

- [ ] **Step 1: 删后台页面与菜单**

按上面的清单删除，注意 `adminMenu.ts` 里「财务」那一项连同其子项一起删。

- [ ] **Step 2: 删后端旧接口并重命名新控制器**

删旧 controller 与两个旧服务；把 `admin-finance-v2.controller.ts` 重命名为 `admin-finance.controller.ts`，类名同步改为 `AdminFinanceController`，更新 `app.module.ts` 引用。

- [ ] **Step 3: 编译与构建**

Run: `cd backend && npx tsc --noEmit && npx jest tests/application/finance -v`
Run: `cd admin-web && npm run build`
Expected: 类型检查无错、财务测试全绿、后台构建成功。

- [ ] **Step 4: 确认没有悬空引用**

Run: `grep -rn "financeApi\|views/Finance\|FinanceReportService\|FinanceAlertService" admin-web/src backend/src`
Expected: 无输出。

- [ ] **Step 5: 提交**

```bash
bash scripts/session.sh commit -m "chore(finance): 下线后台财务，删除旧口径代码"
```

---

## Task 17: 全量回归与文档

**Files:**
- Modify: `docs/05_API_Specs.md`（财务接口一节换新）
- Modify: `docs/07_Core_Architecture.md`（若有财务模块描述）
- Modify: `docs/superpowers/specs/2026-11-19-finance-miniapp-ledger-design.md`（状态改为已实现）

- [ ] **Step 1: 后端全量测试**

Run: `cd backend && npx jest`
Expected: 全绿；若基线本来就有红，先对照 `origin/main` 复跑确认不是本次引入。

- [ ] **Step 2: 小程序构建**

Run: `cd miniapp && npx vitest run src/pages/staff-finance src/pages/offline-refund.ui.regression.spec.ts && npm run build:mp-weixin`
Expected: 回归 spec 全绿、构建成功（产物在 `dist/build/mp-weixin`）。

- [ ] **Step 3: 手工验收（按 spec §9 九条逐条过一遍）**

Run: `PORT=3018 npm run start:dev:miniapp`（工位端口已在创建时分配），用管理员账号在小程序里走一遍：首页三个数、明细逐条、退款、房租模板、补生成、月报一致性、搭档账号无入口。

- [ ] **Step 4: 更新文档并提交**

```bash
bash scripts/session.sh commit -m "docs(finance): 接口与架构文档同步"
```

---

## 执行顺序说明

- Task 1–2 是所有后续任务的地基，必须先做。
- Task 3–6 依赖 Task 1 的口径；Task 5/6 依赖 3/4 的取数。
- Task 7–10 与 3–6 无强依赖，可在 3 完成后并行。
- Task 11–15 依赖后端接口就绪；11 完成后 12–14 可并行。
- Task 16 必须等 Task 11–15 全部合并、小程序已上线体验版之后再执行（否则老板中间没有财务可用）。
