# Finance Center V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an admin-only finance center that shows truthful operating results, cashflow, expense structure, payable pressure, and contribution analysis without pretending estimated order costs are formal financial actuals.

**Architecture:** Keep existing reimbursement and purchasing entry points in place, add a new company-payable expense bill foundation in the backend, and compute finance center views from real source records: order `paidAt`, order `shippedAt`, reimbursement `REIMBURSED` payments, expense bill recognition windows, and expense bill payment records. Separate the read models into two lines: `financial actuals` for overview, expense analysis, and payables; `contribution analysis` for order and recipe comparison using clearly labeled rule-based cost allocation.

**Tech Stack:** NestJS + Prisma + Jest backend, Vue 3 + Element Plus admin-web

---

## File Structure

### Backend reimbursement truthfulness

- Create: `backend/tests/application/purchasing/reimbursement.service.spec.ts`
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260403183000_add_reimbursement_paid_fields/migration.sql`
- Modify: `backend/src/domain/purchasing/reimbursement.entity.ts`
- Modify: `backend/src/application/purchasing/reimbursement.service.ts`
- Modify: `backend/src/interfaces/controllers/admin-purchasing.controller.ts`

### Backend finance persistence and scheduling

- Create: `backend/tests/application/finance/expense-bill.service.spec.ts`
- Create: `backend/tests/application/finance/finance-report.service.spec.ts`
- Create: `backend/tests/interfaces/controllers/admin-finance.controller.spec.ts`
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260403190000_add_finance_expense_foundation/migration.sql`
- Create: `backend/src/application/finance/finance-categories.ts`
- Create: `backend/src/application/finance/expense-bill.service.ts`
- Create: `backend/src/application/finance/expense-template.service.ts`
- Create: `backend/src/application/finance/finance-report.service.ts`
- Create: `backend/src/application/finance/finance-alert.service.ts`
- Create: `backend/src/application/scheduler/finance-scheduler.service.ts`
- Create: `backend/src/interfaces/controllers/admin-finance.controller.ts`
- Create: `backend/src/interfaces/dto/finance/finance-range.dto.ts`
- Create: `backend/src/interfaces/dto/finance/create-expense-bill.dto.ts`
- Create: `backend/src/interfaces/dto/finance/record-expense-payment.dto.ts`
- Create: `backend/src/interfaces/dto/finance/create-expense-template.dto.ts`
- Modify: `backend/src/app.module.ts`

### Admin web finance center

- Create: `admin-web/src/api/finance.ts`
- Create: `admin-web/src/types/finance.ts`
- Modify: `admin-web/src/api/index.ts`
- Modify: `admin-web/src/api/purchasing.ts`
- Modify: `admin-web/src/router/index.ts`
- Modify: `admin-web/src/layouts/MainLayout.vue`
- Create: `admin-web/src/views/Finance/Overview.vue`
- Create: `admin-web/src/views/Finance/ExpenseBills.vue`
- Create: `admin-web/src/views/Finance/ExpenseAnalysis.vue`
- Create: `admin-web/src/views/Finance/ContributionAnalysis.vue`
- Create: `admin-web/src/views/Finance/components/RangeSwitcher.vue`
- Create: `admin-web/src/views/Finance/components/ExpenseBillDialog.vue`
- Modify: `admin-web/src/views/Purchasing/ReimbursementList.vue`
- Modify: `admin-web/src/views/Purchasing/ReimbursementDetail.vue`

## Task 1: Make Reimbursements Truthful Finance Inputs

**Files:**
- Create: `backend/tests/application/purchasing/reimbursement.service.spec.ts`
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260403183000_add_reimbursement_paid_fields/migration.sql`
- Modify: `backend/src/domain/purchasing/reimbursement.entity.ts`
- Modify: `backend/src/application/purchasing/reimbursement.service.ts`
- Modify: `backend/src/interfaces/controllers/admin-purchasing.controller.ts`

- [ ] **Step 1: Write the failing reimbursement payment semantics test**

```ts
import { BadRequestException } from '@nestjs/common';
import { ReimbursementService } from 'src/application/purchasing/reimbursement.service';
import { Reimbursement, ReimbursementStatus } from 'src/domain/purchasing';

describe('ReimbursementService payment semantics', () => {
  const reimbursementRepository = {
    findById: jest.fn(),
    save: jest.fn(),
  } as any;

  const ingredientPricingService = {
    applyApprovedChangesForReimbursement: jest.fn(),
    rejectChangesForReimbursement: jest.fn(),
  } as any;

  const orderRepository = { findById: jest.fn(), save: jest.fn() } as any;
  const statusHistoryRepository = { append: jest.fn() } as any;
  const cosService = {
    uploadImage: jest.fn().mockResolvedValue({
      url: 'https://cos.example.com/payment-proof-1.jpg',
      key: 'payment-proof-1.jpg',
    }),
  } as any;

  let service: ReimbursementService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ReimbursementService(
      reimbursementRepository,
      {} as any,
      orderRepository,
      statusHistoryRepository,
      cosService,
      ingredientPricingService,
    );
  });

  it('rejects APPROVE review because paid proof is the only path to REIMBURSED', async () => {
    reimbursementRepository.findById.mockResolvedValue(
      new Reimbursement({
        id: 'reim-1',
        claimNumber: 'RB20260403001',
        status: ReimbursementStatus.PENDING_REVIEW,
        totalActualCost: 320,
        totalEstimatedCost: 300,
        receiptUrls: ['https://cos.example.com/receipt-1.jpg'],
        submittedById: 'staff-1',
        submittedAt: new Date('2026-04-03T08:00:00.000Z'),
      }),
    );

    await expect(
      service.reviewReimbursement('reim-1', 'admin-1', {
        decision: 'APPROVE',
        comment: 'looks good',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('marks reimbursement paid only after payment proof upload and stores paidAt', async () => {
    reimbursementRepository.findById.mockResolvedValue(
      new Reimbursement({
        id: 'reim-1',
        claimNumber: 'RB20260403001',
        status: ReimbursementStatus.PENDING_REVIEW,
        totalActualCost: 320,
        totalEstimatedCost: 300,
        receiptUrls: ['https://cos.example.com/receipt-1.jpg'],
        submittedById: 'staff-1',
        submittedAt: new Date('2026-04-03T08:00:00.000Z'),
      }),
    );
    reimbursementRepository.save.mockImplementation(async (entity: Reimbursement) => entity);

    const result = await service.uploadPaymentProofFiles('reim-1', 'admin-1', [
      {
        originalname: 'proof.jpg',
        mimetype: 'image/jpeg',
        size: 1024,
        buffer: Buffer.from('proof'),
      },
    ] as Express.Multer.File[]);

    expect(result.status).toBe(ReimbursementStatus.REIMBURSED);
    expect(result.paidById).toBe('admin-1');
    expect(result.paidAt).toBeInstanceOf(Date);
    expect(ingredientPricingService.applyApprovedChangesForReimbursement).toHaveBeenCalledWith(
      'reim-1',
      'admin-1',
      'payment proof uploaded',
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npm test -- tests/application/purchasing/reimbursement.service.spec.ts --runInBand`

Expected: FAIL because `uploadPaymentProofFiles` does not accept `paidById`, `Reimbursement` has no `paidAt` / `paidById`, and `reviewReimbursement` still allows `APPROVE`.

- [ ] **Step 3: Add explicit paid fields to the reimbursement schema**

```prisma
model User {
  id                 String           @id @default(uuid()) @map("id")
  reimbursementsPaid Reimbursement[]  @relation("ReimbursementPayer")
}

model Reimbursement {
  id                   String              @id @default(uuid()) @map("id")
  claimNumber          String              @unique @map("claim_number") @db.VarChar(20)
  status               ReimbursementStatus @map("status")
  totalActualCost      Decimal             @map("total_actual_cost") @db.Decimal(10, 2)
  totalEstimatedCost   Decimal             @map("total_estimated_cost") @db.Decimal(10, 2)
  receiptUrls          String[]            @map("receipt_urls")
  submittedById        String              @map("submitted_by_id")
  submittedAt          DateTime            @map("submitted_at")
  reviewedById         String?             @map("reviewed_by_id")
  reviewedAt           DateTime?           @map("reviewed_at")
  reviewComment        String?             @map("review_comment")
  paidById             String?             @map("paid_by_id")
  paidAt               DateTime?           @map("paid_at")
  createdAt            DateTime            @default(now()) @map("created_at")
  updatedAt            DateTime            @updatedAt @map("updated_at")
  paymentProofUrls     String[]            @default([]) @map("payment_proof_urls")
  paymentProofKeys     String[]            @default([]) @map("payment_proof_keys")

  paidBy               User?               @relation("ReimbursementPayer", fields: [paidById], references: [id])
  reviewedBy           User?               @relation("ReimbursementReviewer", fields: [reviewedById], references: [id])
  submittedBy          User                @relation("ReimbursementSubmitter", fields: [submittedById], references: [id])
}
```

```sql
ALTER TABLE "reimbursement"
ADD COLUMN "paid_by_id" VARCHAR(36),
ADD COLUMN "paid_at" TIMESTAMP(3);

CREATE INDEX "reimbursement_paid_at_idx" ON "reimbursement"("paid_at");
ALTER TABLE "reimbursement"
ADD CONSTRAINT "reimbursement_paid_by_id_fkey"
FOREIGN KEY ("paid_by_id") REFERENCES "user"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 4: Implement “payment proof completes reimbursement” semantics**

```ts
// backend/src/domain/purchasing/reimbursement.entity.ts
markAsReimbursed(
  paidById: string,
  paymentProofUrls: string[],
  paymentProofKeys: string[],
): void {
  if (this.status !== ReimbursementStatus.PENDING_REVIEW) {
    throw new InvalidStateTransitionError(
      `Only PENDING_REVIEW reimbursements can be marked reimbursed`,
    );
  }

  if (paymentProofUrls.length === 0) {
    throw new Error('At least one payment proof is required');
  }

  this.status = ReimbursementStatus.REIMBURSED;
  this.paidById = paidById;
  this.paidAt = new Date();
  this.reviewedById = paidById;
  this.reviewedAt = this.paidAt;
  this.reviewComment = 'payment proof uploaded';
  this.paymentProofUrls = paymentProofUrls;
  this.paymentProofKeys = paymentProofKeys;
  this.updatedAt = this.paidAt;
}

// backend/src/application/purchasing/reimbursement.service.ts
if (dto.decision === 'APPROVE') {
  throw new BadRequestException(
    '请通过上传报销凭证完成“已报销”确认，审核接口不再直接接受 APPROVE。',
  );
}

async uploadPaymentProofFiles(
  id: string,
  paidById: string,
  files: Express.Multer.File[],
): Promise<Reimbursement> {
  const reimbursement = await this.reimbursementRepository.findById(id);
  if (!reimbursement) throw new BadRequestException('报销单不存在');

  const uploaded = await Promise.all(
    files.map((file) =>
      this.cosService.uploadImage(
        file,
        file.originalname,
        'reimbursement-payment-proofs',
      ),
    ),
  );

  reimbursement.markAsReimbursed(
    paidById,
    uploaded.map((item) => item.url),
    uploaded.map((item) => item.key),
  );

  const saved = await this.reimbursementRepository.save(reimbursement);
  await this.applyPostReimbursedSideEffects(ReimbursementStatus.PENDING_REVIEW, saved);
  return saved;
}

// backend/src/interfaces/controllers/admin-purchasing.controller.ts
const reimbursement = await this.reimbursementService.uploadPaymentProofFiles(
  id,
  userId,
  files,
);
```

- [ ] **Step 5: Run the reimbursement test and commit**

Run: `cd backend && npm test -- tests/application/purchasing/reimbursement.service.spec.ts --runInBand`

Expected: PASS with `2 passed`.

```bash
git add backend/tests/application/purchasing/reimbursement.service.spec.ts \
  backend/prisma/schema.prisma \
  backend/prisma/migrations/20260403183000_add_reimbursement_paid_fields/migration.sql \
  backend/src/domain/purchasing/reimbursement.entity.ts \
  backend/src/application/purchasing/reimbursement.service.ts \
  backend/src/interfaces/controllers/admin-purchasing.controller.ts
git commit -m "fix: make reimbursed status mean paid"
```

## Task 2: Add Expense Bills, Payments, and Templates

**Files:**
- Create: `backend/tests/application/finance/expense-bill.service.spec.ts`
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260403190000_add_finance_expense_foundation/migration.sql`
- Create: `backend/src/application/finance/finance-categories.ts`
- Create: `backend/src/application/finance/expense-bill.service.ts`
- Create: `backend/src/application/finance/expense-template.service.ts`
- Create: `backend/src/interfaces/dto/finance/create-expense-bill.dto.ts`
- Create: `backend/src/interfaces/dto/finance/record-expense-payment.dto.ts`
- Create: `backend/src/interfaces/dto/finance/create-expense-template.dto.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Write the failing expense bill service test**

```ts
import { ExpenseBillService } from 'src/application/finance/expense-bill.service';

describe('ExpenseBillService', () => {
  const prisma = {
    expenseBill: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    expenseBillPayment: {
      create: jest.fn(),
      aggregate: jest.fn(),
    },
    expenseTemplate: {
      findMany: jest.fn(),
    },
  } as any;

  let service: ExpenseBillService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ExpenseBillService(prisma);
  });

  it('creates a company-payable expense bill with recognition window and due date', async () => {
    prisma.expenseBill.create.mockResolvedValue({
      id: 'bill-1',
      billNumber: 'FB20260403001',
      status: 'PENDING_PAYMENT',
      title: '2026年4月房租',
      category: 'RENT',
      amount: 5000,
      recognitionStart: new Date('2026-04-01T00:00:00.000Z'),
      recognitionEnd: new Date('2026-04-30T23:59:59.999Z'),
      dueAt: new Date('2026-04-05T12:00:00.000Z'),
    });

    await expect(
      service.createBill('admin-1', {
        title: '2026年4月房租',
        category: 'RENT',
        amount: 5000,
        payeeName: '房东',
        recognitionStart: '2026-04-01',
        recognitionEnd: '2026-04-30',
        dueAt: '2026-04-05T12:00:00.000Z',
      }),
    ).resolves.toMatchObject({
      status: 'PENDING_PAYMENT',
      category: 'RENT',
    });
  });

  it('marks a bill PARTIALLY_PAID and then PAID as payments accumulate', async () => {
  prisma.expenseBill.findUnique.mockResolvedValue({
    id: 'bill-1',
    amount: 5000,
    status: 'PENDING_PAYMENT',
    paymentProofUrls: [],
  });
  prisma.expenseBill.findUniqueOrThrow.mockResolvedValue({
    id: 'bill-1',
    amount: 5000,
    status: 'PENDING_PAYMENT',
  });
    prisma.expenseBillPayment.aggregate
      .mockResolvedValueOnce({ _sum: { paidAmount: 2000 } })
      .mockResolvedValueOnce({ _sum: { paidAmount: 5000 } });
    prisma.expenseBillPayment.create.mockResolvedValue({ id: 'payment-1' });
    prisma.expenseBill.update
      .mockResolvedValueOnce({ id: 'bill-1', status: 'PARTIALLY_PAID' })
      .mockResolvedValueOnce({ id: 'bill-1', status: 'PAID' });

    await service.recordPayment('bill-1', 'admin-1', {
      paidAmount: 2000,
      paidAt: '2026-04-05T12:00:00.000Z',
      paymentMethod: 'BANK_TRANSFER',
      paymentProofUrls: ['https://cos.example.com/rent-proof-1.jpg'],
    });
    await expect(
      service.recordPayment('bill-1', 'admin-1', {
        paidAmount: 3000,
        paidAt: '2026-04-08T12:00:00.000Z',
        paymentMethod: 'BANK_TRANSFER',
        paymentProofUrls: ['https://cos.example.com/rent-proof-2.jpg'],
      }),
    ).resolves.toMatchObject({ status: 'PAID' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npm test -- tests/application/finance/expense-bill.service.spec.ts --runInBand`

Expected: FAIL because `ExpenseBillService`, Prisma finance models, and DTOs do not exist yet.

- [ ] **Step 3: Add finance categories, expense bill models, and DTOs**

```prisma
enum FinanceExpenseCategory {
  RAW_MATERIAL
  PACKAGING_SUPPLIES
  PAYROLL
  RENT
  UTILITIES
  NETWORK_COMMUNICATION
  TECHNICAL_SERVICES
  LOGISTICS_DELIVERY
  ADMINISTRATIVE
  AFTERSALE_LOSS
  OTHER
}

enum ExpenseBillStatus {
  DRAFT
  PENDING_PAYMENT
  PARTIALLY_PAID
  PAID
  CANCELLED
}

enum ExpenseTemplateInterval {
  MONTHLY
  YEARLY
}

model ExpenseBill {
  id                String                 @id @default(uuid()) @map("id")
  billNumber        String                 @unique @map("bill_number") @db.VarChar(24)
  title             String                 @map("title") @db.VarChar(200)
  category          FinanceExpenseCategory @map("category")
  status            ExpenseBillStatus      @default(PENDING_PAYMENT) @map("status")
  payeeName         String                 @map("payee_name") @db.VarChar(120)
  amount            Decimal                @map("amount") @db.Decimal(10, 2)
  recognitionStart  DateTime               @map("recognition_start") @db.Date
  recognitionEnd    DateTime               @map("recognition_end") @db.Date
  dueAt             DateTime               @map("due_at")
  note              String?                @map("note")
  templateId        String?                @map("template_id")
  createdById       String                 @map("created_by_id")
  createdAt         DateTime               @default(now()) @map("created_at")
  updatedAt         DateTime               @updatedAt @map("updated_at")
  payments          ExpenseBillPayment[]
  template          ExpenseTemplate?       @relation(fields: [templateId], references: [id])

  @@index([status, dueAt])
  @@index([category, recognitionStart, recognitionEnd])
  @@map("expense_bill")
}

model ExpenseBillPayment {
  id               String      @id @default(uuid()) @map("id")
  billId           String      @map("bill_id")
  paidAmount       Decimal     @map("paid_amount") @db.Decimal(10, 2)
  paidAt           DateTime    @map("paid_at")
  paidById         String      @map("paid_by_id")
  paymentMethod    String      @map("payment_method") @db.VarChar(50)
  paymentProofUrls String[]    @default([]) @map("payment_proof_urls")
  note             String?     @map("note")
  createdAt        DateTime    @default(now()) @map("created_at")
  bill             ExpenseBill @relation(fields: [billId], references: [id], onDelete: Cascade)

  @@index([billId, paidAt])
  @@index([paidAt])
  @@map("expense_bill_payment")
}

model ExpenseTemplate {
  id                 String                 @id @default(uuid()) @map("id")
  name               String                 @map("name") @db.VarChar(100)
  titleTemplate      String                 @map("title_template") @db.VarChar(200)
  category           FinanceExpenseCategory @map("category")
  payeeName          String                 @map("payee_name") @db.VarChar(120)
  defaultAmount      Decimal                @map("default_amount") @db.Decimal(10, 2)
  interval           ExpenseTemplateInterval @map("interval")
  dayOfMonth         Int?                   @map("day_of_month")
  monthOfYear        Int?                   @map("month_of_year")
  servicePeriodMonths Int                   @default(1) @map("service_period_months")
  isActive           Boolean                @default(true) @map("is_active")
  note               String?                @map("note")
  createdById        String                 @map("created_by_id")
  createdAt          DateTime               @default(now()) @map("created_at")
  updatedAt          DateTime               @updatedAt @map("updated_at")
  bills              ExpenseBill[]

  @@index([isActive, interval])
  @@map("expense_template")
}
```

```ts
// backend/src/application/finance/finance-categories.ts
export const FINANCE_EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  RAW_MATERIAL: '原料采购',
  PACKAGING_SUPPLIES: '包材耗材',
  PAYROLL: '工资',
  RENT: '房租',
  UTILITIES: '水电燃气',
  NETWORK_COMMUNICATION: '宽带通信',
  TECHNICAL_SERVICES: '服务器/域名/证书/备案',
  LOGISTICS_DELIVERY: '物流配送费',
  ADMINISTRATIVE: '行政费用',
  AFTERSALE_LOSS: '售后退款/经营损失',
  OTHER: '其他杂项',
};

// backend/src/interfaces/dto/finance/create-expense-bill.dto.ts
export class CreateExpenseBillDto {
  title!: string
  category!: 'RAW_MATERIAL' | 'PACKAGING_SUPPLIES' | 'PAYROLL' | 'RENT' | 'UTILITIES' | 'NETWORK_COMMUNICATION' | 'TECHNICAL_SERVICES' | 'LOGISTICS_DELIVERY' | 'ADMINISTRATIVE' | 'AFTERSALE_LOSS' | 'OTHER'
  amount!: number
  payeeName!: string
  recognitionStart!: string
  recognitionEnd!: string
  dueAt!: string
  templateId?: string
  note?: string
}

// backend/src/interfaces/dto/finance/record-expense-payment.dto.ts
export class RecordExpensePaymentDto {
  paidAmount!: number
  paidAt!: string
  paymentMethod!: string
  paymentProofUrls!: string[]
  note?: string
}

// backend/src/interfaces/dto/finance/create-expense-template.dto.ts
export class CreateExpenseTemplateDto {
  name!: string
  titleTemplate!: string
  category!: CreateExpenseBillDto['category']
  payeeName!: string
  defaultAmount!: number
  interval!: 'MONTHLY' | 'YEARLY'
  dayOfMonth!: number
  monthOfYear?: number
  servicePeriodMonths!: number
  note?: string
}
```

- [ ] **Step 4: Implement bill and template services and register them**

```ts
// backend/src/application/finance/expense-bill.service.ts
const resolveExpenseBillRange = (range: { preset?: 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH' }) => {
  const now = new Date()
  const start = new Date(now)
  const end = new Date(now)

  if (range.preset === 'THIS_WEEK') {
    const day = now.getDay() || 7
    start.setDate(now.getDate() - day + 1)
    start.setHours(0, 0, 0, 0)
    end.setDate(start.getDate() + 6)
    end.setHours(23, 59, 59, 999)
    return { start, end }
  }

  if (range.preset === 'THIS_MONTH') {
    start.setDate(1)
    start.setHours(0, 0, 0, 0)
    end.setMonth(now.getMonth() + 1, 0)
    end.setHours(23, 59, 59, 999)
    return { start, end }
  }

  start.setHours(0, 0, 0, 0)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

@Injectable()
export class ExpenseBillService {
  constructor(private readonly prisma: PrismaService) {}

  async createBill(createdById: string, dto: CreateExpenseBillDto) {
    return this.prisma.expenseBill.create({
      data: {
        billNumber: `FB${new Date().toISOString().slice(0, 10).replace(/-/g, '')}${Date.now().toString().slice(-3)}`,
        title: dto.title,
        category: dto.category,
        payeeName: dto.payeeName,
        amount: dto.amount,
        recognitionStart: new Date(dto.recognitionStart),
        recognitionEnd: new Date(dto.recognitionEnd),
        dueAt: new Date(dto.dueAt),
        note: dto.note ?? null,
        templateId: dto.templateId ?? null,
        createdById,
        status: 'PENDING_PAYMENT',
      },
    });
  }

  async recordPayment(billId: string, paidById: string, dto: RecordExpensePaymentDto) {
    await this.prisma.expenseBillPayment.create({
      data: {
        billId,
        paidAmount: dto.paidAmount,
        paidAt: new Date(dto.paidAt),
        paidById,
        paymentMethod: dto.paymentMethod,
        paymentProofUrls: dto.paymentProofUrls,
        note: dto.note ?? null,
      },
    });

    const totalPaid = await this.prisma.expenseBillPayment.aggregate({
      where: { billId },
      _sum: { paidAmount: true },
    });

    const bill = await this.prisma.expenseBill.findUniqueOrThrow({ where: { id: billId } });
    const nextStatus =
      Number(totalPaid._sum.paidAmount ?? 0) >= Number(bill.amount)
        ? 'PAID'
        : 'PARTIALLY_PAID';

    return this.prisma.expenseBill.update({
      where: { id: billId },
      data: { status: nextStatus },
    });
  }

  listBills(range: { preset?: 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH' }) {
    const { start, end } = resolveExpenseBillRange(range)
    return this.prisma.expenseBill.findMany({
      where: {
        recognitionStart: { lte: end },
        recognitionEnd: { gte: start },
      },
      include: {
        payments: {
          orderBy: { paidAt: 'desc' },
        },
      },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
    })
  }
}

// backend/src/application/finance/expense-template.service.ts
@Injectable()
export class ExpenseTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  createTemplate(createdById: string, dto: CreateExpenseTemplateDto) {
    return this.prisma.expenseTemplate.create({
      data: {
        ...dto,
        createdById,
      },
    });
  }

  listTemplates() {
    return this.prisma.expenseTemplate.findMany({
      where: { isActive: true },
      orderBy: [{ interval: 'asc' }, { createdAt: 'desc' }],
    })
  }
}

// backend/src/app.module.ts
providers: [
  ExpenseBillService,
  ExpenseTemplateService,
]
```

- [ ] **Step 5: Run the expense bill service test and commit**

Run: `cd backend && npm test -- tests/application/finance/expense-bill.service.spec.ts --runInBand`

Expected: PASS with `2 passed`.

```bash
git add backend/tests/application/finance/expense-bill.service.spec.ts \
  backend/prisma/schema.prisma \
  backend/prisma/migrations/20260403190000_add_finance_expense_foundation/migration.sql \
  backend/src/application/finance/finance-categories.ts \
  backend/src/application/finance/expense-bill.service.ts \
  backend/src/application/finance/expense-template.service.ts \
  backend/src/interfaces/dto/finance/create-expense-bill.dto.ts \
  backend/src/interfaces/dto/finance/record-expense-payment.dto.ts \
  backend/src/interfaces/dto/finance/create-expense-template.dto.ts \
  backend/src/app.module.ts
git commit -m "feat: add finance expense bill foundation"
```

## Task 3: Add Finance Read Models, Alerts, and Admin APIs

**Files:**
- Create: `backend/tests/application/finance/finance-report.service.spec.ts`
- Create: `backend/tests/interfaces/controllers/admin-finance.controller.spec.ts`
- Create: `backend/src/application/finance/finance-report.service.ts`
- Create: `backend/src/application/finance/finance-alert.service.ts`
- Create: `backend/src/interfaces/controllers/admin-finance.controller.ts`
- Create: `backend/src/interfaces/dto/finance/finance-range.dto.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Write the failing report and controller tests**

```ts
import { FinanceReportService } from 'src/application/finance/finance-report.service';

describe('FinanceReportService', () => {
  const prisma = {
    order: { findMany: jest.fn() },
    reimbursement: { findMany: jest.fn() },
    expenseBill: { findMany: jest.fn() },
    expenseBillPayment: { findMany: jest.fn() },
  } as any;

  let service: FinanceReportService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FinanceReportService(prisma);
  });

  it('computes overview from paid orders, shipped orders, paid reimbursements, and expense bills', async () => {
    prisma.order.findMany
      .mockResolvedValueOnce([{ id: 'o-1', amountTotal: 399, paidAt: new Date('2026-04-03T10:00:00.000Z') }])
      .mockResolvedValueOnce([{ id: 'o-1', amountTotal: 399, shippedAt: new Date('2026-04-03T16:00:00.000Z') }]);
    prisma.reimbursement.findMany.mockResolvedValue([
      { id: 'r-1', totalActualCost: 220, paidAt: new Date('2026-04-03T11:00:00.000Z'), status: 'REIMBURSED' },
    ]);
    prisma.expenseBill.findMany.mockResolvedValue([
      {
        id: 'bill-1',
        category: 'RENT',
        amount: 3000,
        recognitionStart: new Date('2026-04-01'),
        recognitionEnd: new Date('2026-04-30'),
        dueAt: new Date('2026-04-05'),
        status: 'PENDING_PAYMENT',
      },
    ]);
    prisma.expenseBillPayment.findMany.mockResolvedValue([
      { billId: 'bill-1', paidAmount: 1000, paidAt: new Date('2026-04-03T12:00:00.000Z') },
    ]);

    await expect(
      service.getOverview({ preset: 'TODAY', timezone: 'Asia/Shanghai' }),
    ).resolves.toMatchObject({
      cashIn: 399,
      operatingRevenue: 399,
      cashOut: 1220,
      pendingPayables: expect.any(Number),
    });
  });
});
```

```ts
import { Test } from '@nestjs/testing';
import { AdminFinanceController } from 'src/interfaces/controllers/admin-finance.controller';
import { ExpenseBillService } from 'src/application/finance/expense-bill.service';
import { ExpenseTemplateService } from 'src/application/finance/expense-template.service';
import { FinanceReportService } from 'src/application/finance/finance-report.service';
import { FinanceAlertService } from 'src/application/finance/finance-alert.service';

describe('AdminFinanceController', () => {
  it('exposes overview, expense bill, analysis, and contribution endpoints', async () => {
    const module = await Test.createTestingModule({
      controllers: [AdminFinanceController],
      providers: [
        { provide: ExpenseBillService, useValue: { createBill: jest.fn(), recordPayment: jest.fn(), listBills: jest.fn() } },
        { provide: ExpenseTemplateService, useValue: { createTemplate: jest.fn(), listTemplates: jest.fn() } },
        { provide: FinanceReportService, useValue: { getOverview: jest.fn(), getExpenseAnalysis: jest.fn(), getContributionAnalysis: jest.fn() } },
        { provide: FinanceAlertService, useValue: { getAlerts: jest.fn() } },
      ],
    }).compile();

    const controller = module.get(AdminFinanceController);
    expect(controller).toBeDefined();
    expect(typeof controller.getOverview).toBe('function');
    expect(typeof controller.createExpenseBill).toBe('function');
    expect(typeof controller.recordExpensePayment).toBe('function');
    expect(typeof controller.getExpenseAnalysis).toBe('function');
    expect(typeof controller.getContributionAnalysis).toBe('function');
  });
});
```

- [ ] **Step 2: Run the new backend tests to verify they fail**

Run: `cd backend && npm test -- tests/application/finance/finance-report.service.spec.ts tests/interfaces/controllers/admin-finance.controller.spec.ts --runInBand`

Expected: FAIL because the finance report service and admin finance controller do not exist.

- [ ] **Step 3: Implement truthful finance aggregation and alert logic**

```ts
// backend/src/application/finance/finance-report.service.ts
const startOfDay = (input: Date) => {
  const result = new Date(input)
  result.setHours(0, 0, 0, 0)
  return result
}

const endOfDay = (input: Date) => {
  const result = new Date(input)
  result.setHours(23, 59, 59, 999)
  return result
}

const addDays = (input: Date, days: number) => {
  const result = new Date(input)
  result.setDate(result.getDate() + days)
  return result
}

const dayDiffInclusive = (start: Date, end: Date) =>
  Math.floor((end.getTime() - start.getTime()) / 86400000) + 1

@Injectable()
export class FinanceReportService {
  constructor(private readonly prisma: PrismaService) {}

  private resolveRange(range: FinanceRangeDto) {
    const now = new Date()

    if (range.preset === 'THIS_WEEK') {
      const day = now.getDay() || 7
      const start = startOfDay(addDays(now, -day + 1))
      return {
        start,
        end: endOfDay(addDays(start, 6)),
      }
    }

    if (range.preset === 'THIS_MONTH') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      return {
        start: startOfDay(start),
        end: endOfDay(end),
      }
    }

    return {
      start: startOfDay(now),
      end: endOfDay(now),
    }
  }

  private extractSnapshotCost(snapshot: any): number {
    if (!snapshot) return 0
    return Number(snapshot.totalProductCost ?? snapshot.total_cost ?? 0)
  }

  private expandReimbursementExpenses(reimbursements: Array<any>) {
    return reimbursements.flatMap((item) => {
      const customFees = Array.isArray(item.customFees) ? item.customFees : []
      const customFeeTotal = customFees.reduce(
        (sum, fee) => sum + Number(fee.amount ?? 0),
        0,
      )
      const rawMaterialAmount =
        Number(item.totalActualCost) -
        Number(item.platformShippingFee ?? 0) -
        Number(item.platformPackagingFee ?? 0) -
        customFeeTotal

      const rows = [
        {
          category: 'RAW_MATERIAL',
          amount: rawMaterialAmount > 0 ? rawMaterialAmount : 0,
        },
      ]

      if (item.platformShippingFee) {
        rows.push({
          category: 'LOGISTICS_DELIVERY',
          amount: Number(item.platformShippingFee),
        })
      }

      if (item.platformPackagingFee) {
        rows.push({
          category: 'PACKAGING_SUPPLIES',
          amount: Number(item.platformPackagingFee),
        })
      }

      for (const fee of customFees) {
        const categoryMap: Record<string, string> = {
          RENT: 'RENT',
          UTILITIES: 'UTILITIES',
          PAYROLL: 'PAYROLL',
          TOOLS: 'ADMINISTRATIVE',
          SUNDRIES: 'OTHER',
          OTHER: 'OTHER',
        }

        rows.push({
          category: categoryMap[String(fee.category ?? 'OTHER')] ?? 'OTHER',
          amount: Number(fee.amount ?? 0),
        })
      }

      return rows
    })
  }

  private allocateExpenseBills(bills: Array<any>, start: Date, end: Date) {
    return bills.map((bill) => {
      const recognitionStart = new Date(bill.recognitionStart)
      const recognitionEnd = new Date(bill.recognitionEnd)
      const overlapStart = start > recognitionStart ? start : recognitionStart
      const overlapEnd = end < recognitionEnd ? end : recognitionEnd
      const totalDays = dayDiffInclusive(recognitionStart, recognitionEnd)
      const overlapDays =
        overlapStart <= overlapEnd ? dayDiffInclusive(overlapStart, overlapEnd) : 0

      return {
        category: bill.category,
        amount:
          overlapDays > 0
            ? (Number(bill.amount) / totalDays) * overlapDays
            : 0,
      }
    })
  }

  private calculatePendingPayables(bills: Array<any>, payments: Array<any>) {
    return bills.reduce((sum, bill) => {
      const paid = payments
        .filter((payment) => payment.billId === bill.id)
        .reduce((innerSum, payment) => innerSum + Number(payment.paidAmount), 0)

      return sum + Math.max(Number(bill.amount) - paid, 0)
    }, 0)
  }

  async getOverview(range: FinanceRangeDto) {
    const { start, end } = this.resolveRange(range);

    const [paidOrders, shippedOrders, reimbursements, bills, billPayments] =
      await Promise.all([
        this.prisma.order.findMany({
          where: { paidAt: { gte: start, lte: end }, cancelledAt: null },
          select: { id: true, amountTotal: true, paidAt: true },
        }),
        this.prisma.order.findMany({
          where: { shippedAt: { gte: start, lte: end }, cancelledAt: null },
          select: { id: true, amountTotal: true, shippedAt: true },
        }),
        this.prisma.reimbursement.findMany({
          where: { status: 'REIMBURSED', paidAt: { gte: start, lte: end } },
          select: {
            id: true,
            totalActualCost: true,
            paidAt: true,
            platformShippingFee: true,
            platformPackagingFee: true,
            customFees: true,
          },
        }),
        this.prisma.expenseBill.findMany({
          where: {
            status: { in: ['PENDING_PAYMENT', 'PARTIALLY_PAID', 'PAID'] },
            recognitionStart: { lte: end },
            recognitionEnd: { gte: start },
          },
        }),
        this.prisma.expenseBillPayment.findMany({
          where: { paidAt: { gte: start, lte: end } },
        }),
      ]);

    const cashIn = paidOrders.reduce((sum, item) => sum + Number(item.amountTotal), 0);
    const operatingRevenue = shippedOrders.reduce(
      (sum, item) => sum + Number(item.amountTotal),
      0,
    );
    const reimbursedCashOut = reimbursements.reduce(
      (sum, item) => sum + Number(item.totalActualCost),
      0,
    );
    const billCashOut = billPayments.reduce(
      (sum, item) => sum + Number(item.paidAmount),
      0,
    );
    const recognizedExpense = [
      ...this.expandReimbursementExpenses(reimbursements),
      ...this.allocateExpenseBills(bills, start, end),
    ];

    return {
      cashIn,
      operatingRevenue,
      actualExpense: recognizedExpense.reduce((sum, item) => sum + item.amount, 0),
      operatingBalance:
        operatingRevenue - recognizedExpense.reduce((sum, item) => sum + item.amount, 0),
      cashOut: reimbursedCashOut + billCashOut,
      netCashflow: cashIn - reimbursedCashOut - billCashOut,
      pendingPayables: this.calculatePendingPayables(bills, billPayments),
    };
  }

  async getExpenseAnalysis(range: FinanceRangeDto) {
    const { start, end } = this.resolveRange(range)
    const [reimbursements, bills] = await Promise.all([
      this.prisma.reimbursement.findMany({
        where: { status: 'REIMBURSED', paidAt: { gte: start, lte: end } },
        select: {
          totalActualCost: true,
          platformShippingFee: true,
          platformPackagingFee: true,
        },
      }),
      this.prisma.expenseBill.findMany({
        where: {
          recognitionStart: { lte: end },
          recognitionEnd: { gte: start },
          status: { in: ['PENDING_PAYMENT', 'PARTIALLY_PAID', 'PAID'] },
        },
      }),
    ])

    const categoryMap = new Map<string, number>()

    for (const row of [
      ...this.expandReimbursementExpenses(reimbursements),
      ...this.allocateExpenseBills(bills, start, end),
    ]) {
      categoryMap.set(row.category, (categoryMap.get(row.category) ?? 0) + row.amount)
    }

    return {
      categories: Array.from(categoryMap.entries()).map(([category, amount]) => ({
        category,
        label: FINANCE_EXPENSE_CATEGORY_LABELS[category] ?? category,
        amount,
      })),
    }
  }

  async getContributionAnalysis(range: FinanceRangeDto, groupBy: 'ORDER' | 'RECIPE') {
    const { start, end } = this.resolveRange(range);
    const shippedOrders = await this.prisma.order.findMany({
      where: { shippedAt: { gte: start, lte: end }, cancelledAt: null },
      include: { items: true },
    });

    return shippedOrders.map((order) => ({
      orderId: order.id,
      groupKey: groupBy === 'ORDER' ? order.id : String(order.items[0]?.recipeSnapshot?.name ?? '未命名食谱'),
      revenue: Number(order.amountTotal),
      contributionCost: this.extractSnapshotCost(order.pricingBreakdownSnapshot),
      isEstimatedCost: true,
      label: '经营贡献分析，非正式财务利润',
    }));
  }
}

// backend/src/application/finance/finance-alert.service.ts
@Injectable()
export class FinanceAlertService {
  constructor(private readonly financeReportService: FinanceReportService) {}

  private previousComparableRange(range: FinanceRangeDto): FinanceRangeDto {
    if (range.preset === 'THIS_WEEK') return { ...range, preset: 'TODAY' }
    if (range.preset === 'THIS_MONTH') return { ...range, preset: 'THIS_WEEK' }
    return range
  }

  async getAlerts(range: FinanceRangeDto) {
    const overview = await this.financeReportService.getOverview(range)
    const current = await this.financeReportService.getExpenseAnalysis(range);
    const baseline = await this.financeReportService.getExpenseAnalysis(
      this.previousComparableRange(range),
    );

    const historicalAlerts = current.categories
      .filter((item) => {
        const previous = baseline.categories.find((base) => base.category === item.category);
        return previous && item.amount > previous.amount * 1.2;
      })
      .map((item) => ({
        type: 'EXPENSE_SURGE',
        category: item.category,
        message: `${item.label}较历史基线显著上涨`,
      }));

    const businessGoalAlerts = []
    const logistics = current.categories.find((item) => item.category === 'LOGISTICS_DELIVERY')
    if (overview.operatingRevenue > 0 && logistics) {
      const logisticsRate = logistics.amount / overview.operatingRevenue
      if (logisticsRate > 0.25) {
        businessGoalAlerts.push({
          type: 'BUSINESS_TARGET',
          category: 'LOGISTICS_DELIVERY',
          message: `物流配送费占收入比例为 ${(logisticsRate * 100).toFixed(1)}%，超过 25% 目标线`,
        })
      }
    }

    if (overview.operatingBalance < 0) {
      businessGoalAlerts.push({
        type: 'BUSINESS_TARGET',
        category: 'OPERATING_BALANCE',
        message: '当前周期真实经营结余为负，需要优先检查固定费用和物流支出',
      })
    }

    return [...historicalAlerts, ...businessGoalAlerts]
  }
}
```

- [ ] **Step 4: Add the admin finance controller**

```ts
// backend/src/interfaces/controllers/admin-finance.controller.ts
// backend/src/interfaces/dto/finance/finance-range.dto.ts
export class FinanceRangeDto {
  preset: 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH' = 'TODAY'
  timezone?: string
  groupBy?: 'ORDER' | 'RECIPE'
}

@ApiTags('admin-finance')
@Controller('admin/finance')
@UseGuards(AuthGuard)
export class AdminFinanceController {
  constructor(
    private readonly expenseBillService: ExpenseBillService,
    private readonly expenseTemplateService: ExpenseTemplateService,
    private readonly financeReportService: FinanceReportService,
    private readonly financeAlertService: FinanceAlertService,
  ) {}

  @Get('templates')
  async listTemplates() {
    return ApiResponseDto.success(
      await this.expenseTemplateService.listTemplates(),
      'Expense templates retrieved successfully',
    );
  }

  @Post('templates')
  async createTemplate(@Body() dto: CreateExpenseTemplateDto, @UserId() userId: string) {
    return ApiResponseDto.success(
      await this.expenseTemplateService.createTemplate(userId, dto),
      'Expense template created successfully',
    );
  }

  @Get('overview')
  async getOverview(@Query() query: FinanceRangeDto) {
    return ApiResponseDto.success(
      await this.financeReportService.getOverview(query),
      'Finance overview retrieved successfully',
    );
  }

  @Get('expense-bills')
  async listExpenseBills(@Query() query: FinanceRangeDto) {
    return ApiResponseDto.success(
      await this.expenseBillService.listBills(query),
      'Expense bills retrieved successfully',
    );
  }

  @Post('expense-bills')
  async createExpenseBill(@Body() dto: CreateExpenseBillDto, @UserId() userId: string) {
    return ApiResponseDto.success(
      await this.expenseBillService.createBill(userId, dto),
      'Expense bill created successfully',
    );
  }

  @Post('expense-bills/:id/payments')
  async recordExpensePayment(
    @Param('id') id: string,
    @Body() dto: RecordExpensePaymentDto,
    @UserId() userId: string,
  ) {
    return ApiResponseDto.success(
      await this.expenseBillService.recordPayment(id, userId, dto),
      'Expense payment recorded successfully',
    );
  }

  @Get('expense-analysis')
  async getExpenseAnalysis(@Query() query: FinanceRangeDto) {
    return ApiResponseDto.success(
      await this.financeReportService.getExpenseAnalysis(query),
      'Expense analysis retrieved successfully',
    );
  }

  @Get('contribution-analysis')
  async getContributionAnalysis(@Query() query: FinanceRangeDto) {
    return ApiResponseDto.success(
      await this.financeReportService.getContributionAnalysis(query, query.groupBy ?? 'RECIPE'),
      'Contribution analysis retrieved successfully',
    );
  }

  @Get('alerts')
  async getAlerts(@Query() query: FinanceRangeDto) {
    return ApiResponseDto.success(
      await this.financeAlertService.getAlerts(query),
      'Finance alerts retrieved successfully',
    );
  }
}
```

- [ ] **Step 5: Run the report/controller tests and commit**

Run: `cd backend && npm test -- tests/application/finance/finance-report.service.spec.ts tests/interfaces/controllers/admin-finance.controller.spec.ts --runInBand`

Expected: PASS with `2 passed`.

```bash
git add backend/tests/application/finance/finance-report.service.spec.ts \
  backend/tests/interfaces/controllers/admin-finance.controller.spec.ts \
  backend/src/application/finance/finance-report.service.ts \
  backend/src/application/finance/finance-alert.service.ts \
  backend/src/interfaces/controllers/admin-finance.controller.ts \
  backend/src/interfaces/dto/finance/finance-range.dto.ts \
  backend/src/app.module.ts
git commit -m "feat: add finance reporting and admin api"
```

## Task 4: Generate Recurring Expense Drafts Automatically

**Files:**
- Modify: `backend/tests/application/finance/expense-bill.service.spec.ts`
- Create: `backend/src/application/scheduler/finance-scheduler.service.ts`
- Modify: `backend/src/application/finance/expense-template.service.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Add the failing recurring template test**

```ts
import { ExpenseTemplateService } from 'src/application/finance/expense-template.service';

let templateService: ExpenseTemplateService;

beforeEach(() => {
  prisma.expenseTemplate.findMany = jest.fn()
  prisma.expenseBill.findFirst = jest.fn()
  templateService = new ExpenseTemplateService(prisma);
});

it('creates due monthly and yearly expense drafts exactly once', async () => {
  prisma.expenseTemplate.findMany.mockResolvedValue([
    {
      id: 'tpl-rent',
      name: '房租',
      titleTemplate: '{{year}}年{{month}}月房租',
      category: 'RENT',
      payeeName: '房东',
      defaultAmount: 5000,
      interval: 'MONTHLY',
      dayOfMonth: 1,
      monthOfYear: null,
      servicePeriodMonths: 1,
      isActive: true,
    },
    {
      id: 'tpl-domain',
      name: '域名续费',
      titleTemplate: '{{year}}年域名续费',
      category: 'TECHNICAL_SERVICES',
      payeeName: '阿里云',
      defaultAmount: 180,
      interval: 'YEARLY',
      dayOfMonth: 3,
      monthOfYear: 4,
      servicePeriodMonths: 12,
      isActive: true,
    },
  ]);
  prisma.expenseBill.findFirst
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(null);
  prisma.expenseBill.create.mockResolvedValue({ id: 'bill-created' });

  await expect(
    templateService.generateDueBills(new Date('2026-04-03T02:00:00.000Z'), 'system'),
  ).resolves.toHaveLength(2);
});
```

- [ ] **Step 2: Run the recurring bill test to verify it fails**

Run: `cd backend && npm test -- tests/application/finance/expense-bill.service.spec.ts --runInBand`

Expected: FAIL because `generateDueBills` and the scheduler do not exist.

- [ ] **Step 3: Implement template-to-bill generation**

```ts
// backend/src/application/finance/expense-template.service.ts
const isTemplateDue = (template: any, now: Date) => {
  const current = new Date(now)
  if (template.interval === 'MONTHLY') {
    return current.getDate() >= template.dayOfMonth
  }

  return (
    current.getMonth() + 1 === template.monthOfYear &&
    current.getDate() >= template.dayOfMonth
  )
}

const buildTemplateBillWindow = (template: any, now: Date) => {
  const current = new Date(now)
  const recognitionStart = new Date(current.getFullYear(), current.getMonth(), 1)
  const recognitionEnd = new Date(
    current.getFullYear(),
    current.getMonth() + template.servicePeriodMonths,
    0,
  )
  const dueAt = new Date(current)
  dueAt.setDate(template.dayOfMonth ?? current.getDate())
  dueAt.setHours(12, 0, 0, 0)

  return {
    title: template.titleTemplate
      .replace('{{year}}', String(current.getFullYear()))
      .replace('{{month}}', String(current.getMonth() + 1)),
    recognitionStart,
    recognitionEnd,
    dueAt,
  }
}

async generateDueBills(now: Date, createdById: string) {
  const templates = await this.prisma.expenseTemplate.findMany({
    where: { isActive: true },
  });

  const createdBills = [];
  for (const template of templates) {
    if (!isTemplateDue(template, now)) continue;

    const { title, recognitionStart, recognitionEnd, dueAt } =
      buildTemplateBillWindow(template, now);

    const existing = await this.prisma.expenseBill.findFirst({
      where: {
        templateId: template.id,
        recognitionStart,
        recognitionEnd,
      },
    });
    if (existing) continue;

    createdBills.push(
      await this.prisma.expenseBill.create({
        data: {
          billNumber: `FB${[
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, '0'),
            String(now.getDate()).padStart(2, '0'),
          ].join('')}${Math.random().toString().slice(2, 5)}`,
          title,
          category: template.category,
          status: 'PENDING_PAYMENT',
          payeeName: template.payeeName,
          amount: template.defaultAmount,
          recognitionStart,
          recognitionEnd,
          dueAt,
          templateId: template.id,
          createdById,
        },
      }),
    );
  }

  return createdBills;
}
```

- [ ] **Step 4: Add the finance scheduler**

```ts
// backend/src/application/scheduler/finance-scheduler.service.ts
@Injectable()
export class FinanceSchedulerService {
  private readonly logger = new Logger(FinanceSchedulerService.name);

  constructor(private readonly expenseTemplateService: ExpenseTemplateService) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async generateRecurringExpenseBills() {
    const created = await this.expenseTemplateService.generateDueBills(
      new Date(),
      'system',
    );
    this.logger.log(`[FinanceScheduler] generated ${created.length} recurring expense bill(s)`);
  }
}

// backend/src/app.module.ts
providers: [
  FinanceSchedulerService,
]
```

- [ ] **Step 5: Run the recurring bill test and commit**

Run: `cd backend && npm test -- tests/application/finance/expense-bill.service.spec.ts --runInBand`

Expected: PASS with the recurring draft test included.

```bash
git add backend/tests/application/finance/expense-bill.service.spec.ts \
  backend/src/application/finance/expense-template.service.ts \
  backend/src/application/scheduler/finance-scheduler.service.ts \
  backend/src/app.module.ts
git commit -m "feat: auto-generate recurring finance bills"
```

## Task 5: Add Admin-Web Finance Center Foundation

**Files:**
- Create: `admin-web/src/api/finance.ts`
- Create: `admin-web/src/types/finance.ts`
- Modify: `admin-web/src/api/index.ts`
- Modify: `admin-web/src/router/index.ts`
- Modify: `admin-web/src/layouts/MainLayout.vue`
- Create: `admin-web/src/views/Finance/Overview.vue`
- Create: `admin-web/src/views/Finance/ExpenseBills.vue`
- Create: `admin-web/src/views/Finance/ExpenseAnalysis.vue`
- Create: `admin-web/src/views/Finance/ContributionAnalysis.vue`
- Create: `admin-web/src/views/Finance/components/ExpenseBillDialog.vue`
- Create: `admin-web/src/views/Finance/components/RangeSwitcher.vue`

- [ ] **Step 1: Write the page integration checklist in code comments and type scaffolds**

```ts
// admin-web/src/types/finance.ts
export type FinanceRangePreset = 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH'

export interface FinanceOverview {
  cashIn: number
  operatingRevenue: number
  actualExpense: number
  operatingBalance: number
  cashOut: number
  netCashflow: number
  pendingPayables: number
}

export interface ExpenseBillItem {
  id: string
  billNumber: string
  title: string
  category: string
  status: 'DRAFT' | 'PENDING_PAYMENT' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED'
  payeeName: string
  amount: number
  dueAt: string
  recognitionStart: string
  recognitionEnd: string
}

// admin-web/src/router/index.ts
{
  path: 'finance',
  name: 'Finance',
  redirect: '/finance/overview',
  children: [
    {
      path: 'overview',
      component: () => import('@/views/Finance/Overview.vue')
    },
    {
      path: 'expense-bills',
      component: () => import('@/views/Finance/ExpenseBills.vue')
    }
  ]
}
```

- [ ] **Step 2: Run the admin build to verify the finance imports are still missing**

Run: `cd admin-web && npm run build`

Expected: FAIL because finance routes now point at views and API bindings that do not exist yet.

- [ ] **Step 3: Add finance API bindings and route/menu entries**

```ts
// admin-web/src/api/finance.ts
import api from './index'
import type { FinanceOverview, ExpenseBillItem, FinanceRangePreset } from '@/types/finance'

export const financeApi = {
  getOverview: (preset: FinanceRangePreset): Promise<FinanceOverview> =>
    api.get('/admin/finance/overview', { params: { preset, timezone: 'Asia/Shanghai' } }),
  getExpenseBills: (preset: FinanceRangePreset): Promise<{ list: ExpenseBillItem[] }> =>
    api.get('/admin/finance/expense-bills', { params: { preset, timezone: 'Asia/Shanghai' } }),
  createExpenseBill: (data: Record<string, unknown>) =>
    api.post('/admin/finance/expense-bills', data),
  recordExpensePayment: (id: string, data: Record<string, unknown>) =>
    api.post(`/admin/finance/expense-bills/${id}/payments`, data),
}

// admin-web/src/api/index.ts
export { financeApi } from './finance'

// admin-web/src/router/index.ts
{
  path: 'finance',
  name: 'Finance',
  redirect: '/finance/overview',
  meta: { title: '财务中心' },
  children: [
    {
      path: 'overview',
      name: 'FinanceOverview',
      component: () => import('@/views/Finance/Overview.vue'),
      meta: { title: '财务总览' }
    },
    {
      path: 'expense-bills',
      name: 'FinanceExpenseBills',
      component: () => import('@/views/Finance/ExpenseBills.vue'),
      meta: { title: '费用与待支付' }
    },
    {
      path: 'expense-analysis',
      name: 'FinanceExpenseAnalysis',
      component: () => import('@/views/Finance/ExpenseAnalysis.vue'),
      meta: { title: '费用分析' }
    },
    {
      path: 'contribution-analysis',
      name: 'FinanceContributionAnalysis',
      component: () => import('@/views/Finance/ContributionAnalysis.vue'),
      meta: { title: '经营贡献分析' }
    }
  ]
}

// admin-web/src/layouts/MainLayout.vue
<el-menu-item index="/finance/overview">
  <el-icon><Money /></el-icon>
  <span>财务中心</span>
</el-menu-item>
```

- [ ] **Step 4: Implement the finance overview and expense bill shells**

```vue
<!-- admin-web/src/views/Finance/Overview.vue -->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { financeApi } from '@/api/finance'
import type { FinanceOverview, FinanceRangePreset } from '@/types/finance'

const preset = ref<FinanceRangePreset>('TODAY')
const overview = ref<FinanceOverview | null>(null)
const loading = ref(false)

const loadOverview = async () => {
  loading.value = true
  try {
    overview.value = await financeApi.getOverview(preset.value)
  } finally {
    loading.value = false
  }
}

onMounted(loadOverview)
</script>

<template>
  <div class="finance-overview">
    <RangeSwitcher v-model="preset" @change="loadOverview" />
    <el-row :gutter="16">
      <el-col :span="8"><el-card>实际收款总额: ¥{{ overview?.cashIn ?? 0 }}</el-card></el-col>
      <el-col :span="8"><el-card>真实经营结余: ¥{{ overview?.operatingBalance ?? 0 }}</el-card></el-col>
      <el-col :span="8"><el-card>待支付金额: ¥{{ overview?.pendingPayables ?? 0 }}</el-card></el-col>
    </el-row>
  </div>
</template>
```

```vue
<!-- admin-web/src/views/Finance/ExpenseBills.vue -->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { financeApi } from '@/api/finance'
import type { ExpenseBillItem, FinanceRangePreset } from '@/types/finance'

const preset = ref<FinanceRangePreset>('THIS_MONTH')
const rows = ref<ExpenseBillItem[]>([])

const loadBills = async () => {
  const result = await financeApi.getExpenseBills(preset.value)
  rows.value = result.list
}

onMounted(loadBills)
</script>

<template>
  <div>
    <RangeSwitcher v-model="preset" @change="loadBills" />
    <el-table :data="rows">
      <el-table-column prop="billNumber" label="费用单号" />
      <el-table-column prop="title" label="费用名称" />
      <el-table-column prop="status" label="状态" />
      <el-table-column prop="dueAt" label="应付日期" />
    </el-table>
  </div>
</template>
```

```vue
<!-- admin-web/src/views/Finance/components/RangeSwitcher.vue -->
<script setup lang="ts">
defineProps<{ modelValue: 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH' }>()
defineEmits<{ 'update:modelValue': [value: 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH']; change: [] }>()
</script>
```

```vue
<!-- admin-web/src/views/Finance/ExpenseAnalysis.vue -->
<template><div class="finance-expense-analysis" /></template>
```

```vue
<!-- admin-web/src/views/Finance/ContributionAnalysis.vue -->
<template><div class="finance-contribution-analysis" /></template>
```

```vue
<!-- admin-web/src/views/Finance/components/ExpenseBillDialog.vue -->
<template><el-dialog title="新建费用单" /></template>
```

- [ ] **Step 5: Run the admin build and commit**

Run: `cd admin-web && npm run build`

Expected: PASS with Vite build output ending in `built in`.

```bash
git add admin-web/src/api/finance.ts \
  admin-web/src/types/finance.ts \
  admin-web/src/api/index.ts \
  admin-web/src/router/index.ts \
  admin-web/src/layouts/MainLayout.vue \
  admin-web/src/views/Finance/Overview.vue \
  admin-web/src/views/Finance/ExpenseBills.vue \
  admin-web/src/views/Finance/ExpenseAnalysis.vue \
  admin-web/src/views/Finance/ContributionAnalysis.vue \
  admin-web/src/views/Finance/components/ExpenseBillDialog.vue \
  admin-web/src/views/Finance/components/RangeSwitcher.vue
git commit -m "feat: add finance center admin shell"
```

## Task 6: Finish Analysis Pages and Align Reimbursement UI With Paid Semantics

**Files:**
- Modify: `admin-web/src/views/Finance/ExpenseAnalysis.vue`
- Modify: `admin-web/src/views/Finance/ContributionAnalysis.vue`
- Modify: `admin-web/src/views/Finance/components/ExpenseBillDialog.vue`
- Modify: `admin-web/src/api/purchasing.ts`
- Modify: `admin-web/src/views/Purchasing/ReimbursementList.vue`
- Modify: `admin-web/src/views/Purchasing/ReimbursementDetail.vue`
- Modify: `admin-web/src/views/Finance/Overview.vue`
- Modify: `admin-web/src/views/Finance/ExpenseBills.vue`

- [ ] **Step 1: Add the failing UI checklist by wiring calls that do not exist yet**

```ts
// admin-web/src/api/finance.ts
getExpenseAnalysis: (preset: FinanceRangePreset) =>
  api.get('/admin/finance/expense-analysis', { params: { preset, timezone: 'Asia/Shanghai' } }),
getContributionAnalysis: (preset: FinanceRangePreset, groupBy: 'ORDER' | 'RECIPE') =>
  api.get('/admin/finance/contribution-analysis', {
    params: { preset, groupBy, timezone: 'Asia/Shanghai' }
  }),
getAlerts: (preset: FinanceRangePreset) =>
  api.get('/admin/finance/alerts', { params: { preset, timezone: 'Asia/Shanghai' } }),

// admin-web/src/api/purchasing.ts
confirmReimbursed: (id: string, formData: FormData): Promise<any> => {
  return api.post(`/admin/purchasing/reimbursements/${id}/payment-proof`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}

// admin-web/src/views/Finance/Overview.vue
const alerts = ref<Array<{ message: string }>>([])
const loadAlerts = async () => {
  alerts.value = await financeApi.getAlerts(preset.value)
}

// admin-web/src/views/Finance/ContributionAnalysis.vue
const loadData = async () => {
  rows.value = await financeApi.getContributionAnalysis(preset.value, 'RECIPE')
}
```

- [ ] **Step 2: Run the admin build to verify the missing analysis pages fail**

Run: `cd admin-web && npm run build`

Expected: FAIL because the pages now reference `financeApi.getAlerts`, `financeApi.getContributionAnalysis`, and the reimbursement confirm action before the supporting implementations are complete.

- [ ] **Step 3: Implement expense analysis and contribution analysis pages**

```vue
<!-- admin-web/src/views/Finance/ExpenseAnalysis.vue -->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { financeApi } from '@/api/finance'

const preset = ref<'TODAY' | 'THIS_WEEK' | 'THIS_MONTH'>('THIS_MONTH')
const analysis = ref<{ categories: Array<{ category: string; label: string; amount: number; deltaRate?: number }> } | null>(null)

const loadAnalysis = async () => {
  analysis.value = await financeApi.getExpenseAnalysis(preset.value)
}

onMounted(loadAnalysis)
</script>

<template>
  <div>
    <RangeSwitcher v-model="preset" @change="loadAnalysis" />
    <el-table :data="analysis?.categories ?? []">
      <el-table-column prop="label" label="费用类别" />
      <el-table-column prop="amount" label="本期金额" />
      <el-table-column prop="deltaRate" label="较历史变化" />
    </el-table>
  </div>
</template>
```

```vue
<!-- admin-web/src/views/Finance/ContributionAnalysis.vue -->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { financeApi } from '@/api/finance'

const preset = ref<'TODAY' | 'THIS_WEEK' | 'THIS_MONTH'>('THIS_MONTH')
const rows = ref<Array<{ groupKey: string; revenue: number; contributionCost: number; label: string }>>([])

const loadData = async () => {
  rows.value = await financeApi.getContributionAnalysis(preset.value, 'RECIPE')
}

onMounted(loadData)
</script>

<template>
  <div>
    <el-alert
      title="以下结果用于经营贡献分析，不等同正式财务利润。"
      type="warning"
      :closable="false"
      show-icon
    />
    <RangeSwitcher v-model="preset" @change="loadData" />
    <el-table :data="rows">
      <el-table-column prop="groupKey" label="对象" />
      <el-table-column prop="revenue" label="收入" />
      <el-table-column prop="contributionCost" label="规则归集成本" />
      <el-table-column prop="label" label="说明" />
    </el-table>
  </div>
</template>
```

- [ ] **Step 4: Replace reimbursement “approve” with “confirm reimbursed”**

```vue
<!-- admin-web/src/views/Purchasing/ReimbursementDetail.vue -->
<el-button
  type="primary"
  :disabled="reimbursement.status !== 'PENDING_REVIEW'"
  @click="openPaymentProofDialog"
>
  确认已报销
</el-button>

<el-upload
  v-model:file-list="paymentProofFiles"
  action=""
  :auto-upload="false"
  :limit="10"
  list-type="picture-card"
>
  <el-icon><Plus /></el-icon>
</el-upload>
```

```vue
<!-- admin-web/src/views/Purchasing/ReimbursementList.vue -->
<el-button
  v-if="row.status === 'PENDING_REVIEW'"
  type="primary"
  link
  @click="goToDetail(row.id)"
>
  确认已报销
</el-button>
```

```ts
const submitPaymentProof = async () => {
  const formData = new FormData()
  paymentProofFiles.value.forEach((file) => formData.append('files', file.raw!))
  await purchasingApi.confirmReimbursed(reimbursement.value.id, formData)
  await loadDetail()
}
```

```vue
<!-- admin-web/src/views/Finance/components/ExpenseBillDialog.vue -->
<script setup lang="ts">
import { reactive } from 'vue'
import { financeApi } from '@/api/finance'

defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; saved: [] }>()

const form = reactive({
  title: '',
  category: 'RENT',
  amount: 0,
  payeeName: '',
  recognitionStart: '',
  recognitionEnd: '',
  dueAt: '',
})

const submit = async () => {
  await financeApi.createExpenseBill(form)
  emit('saved')
  emit('update:modelValue', false)
}
</script>
```

```vue
<!-- admin-web/src/views/Finance/ExpenseBills.vue -->
<script setup lang="ts">
import { ref } from 'vue'

const dialogVisible = ref(false)
const selectedBillId = ref<string | null>(null)
const openPaymentDialog = (row: { id: string }) => {
  selectedBillId.value = row.id
}
</script>

<template>
  <div>
    <el-button type="primary" @click="dialogVisible = true">新建费用单</el-button>
    <ExpenseBillDialog v-model="dialogVisible" @saved="loadBills" />
    <el-table :data="rows">
      <el-table-column prop="billNumber" label="费用单号" />
      <el-table-column prop="status" label="状态" />
      <el-table-column label="操作">
        <template #default="{ row }">
          <el-button
            v-if="row.status !== 'PAID'"
            type="primary"
            link
            @click="openPaymentDialog(row)"
          >
            记录付款
          </el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>
```

- [ ] **Step 5: Run the full project verification and commit**

Run: `cd backend && npm test -- tests/application/purchasing/reimbursement.service.spec.ts tests/application/finance/expense-bill.service.spec.ts tests/application/finance/finance-report.service.spec.ts tests/interfaces/controllers/admin-finance.controller.spec.ts --runInBand`

Expected: PASS with all finance-related backend tests green.

Run: `cd admin-web && npm run build`

Expected: PASS with Vite build output ending in `built in`.

```bash
git add admin-web/src/api/finance.ts \
  admin-web/src/api/purchasing.ts \
  admin-web/src/views/Purchasing/ReimbursementList.vue \
  admin-web/src/views/Purchasing/ReimbursementDetail.vue \
  admin-web/src/views/Finance/Overview.vue \
  admin-web/src/views/Finance/ExpenseBills.vue \
  admin-web/src/views/Finance/ExpenseAnalysis.vue \
  admin-web/src/views/Finance/ContributionAnalysis.vue \
  admin-web/src/views/Finance/components/ExpenseBillDialog.vue
git commit -m "feat: finish finance center analysis and payment flows"
```

## Verification Checklist

- `cd backend && npx prisma generate`
- `cd backend && npm test -- tests/application/purchasing/reimbursement.service.spec.ts tests/application/finance/expense-bill.service.spec.ts tests/application/finance/finance-report.service.spec.ts tests/interfaces/controllers/admin-finance.controller.spec.ts --runInBand`
- `cd backend && npm run build`
- `cd admin-web && npm run build`

## Manual Smoke Checklist

1. 在 `采购管理 -> 报销审核` 中打开一张待审核报销单，确认页面不再暴露“审核通过但未付款”的终态，只有上传付款凭证后才进入 `已报销`。
2. 在 `财务中心 -> 费用与待支付` 中手工创建一笔 `房租` 费用单，确认它立即出现在待支付列表中，但现金流尚未增加。
3. 在同一费用单中登记一笔付款，确认 `财务总览` 中 `现金流出` 增加、`待支付金额` 下降。
4. 打开 `财务中心 -> 费用分析`，确认 `物流配送费`、`原料采购`、`工资`、`服务器/域名/证书/备案` 等类别单独展示。
5. 打开 `财务中心 -> 经营贡献分析`，确认页面存在“非正式财务利润”的提示文案，且结果来自发货订单而不是付款时间。
