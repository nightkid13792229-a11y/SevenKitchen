CREATE TYPE "FinanceExpenseCategory" AS ENUM (
  'RAW_MATERIAL',
  'PACKAGING_SUPPLIES',
  'PAYROLL',
  'RENT',
  'UTILITIES',
  'NETWORK_COMMUNICATION',
  'TECHNICAL_SERVICES',
  'LOGISTICS_DELIVERY',
  'ADMINISTRATIVE',
  'AFTERSALE_LOSS',
  'OTHER'
);

CREATE TYPE "ExpenseBillStatus" AS ENUM (
  'DRAFT',
  'PENDING_PAYMENT',
  'PARTIALLY_PAID',
  'PAID',
  'CANCELLED'
);

CREATE TYPE "ExpenseTemplateInterval" AS ENUM (
  'MONTHLY',
  'YEARLY'
);

CREATE TABLE "expense_template" (
  "id" VARCHAR(36) NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "title_template" VARCHAR(200) NOT NULL,
  "category" "FinanceExpenseCategory" NOT NULL,
  "payee_name" VARCHAR(120) NOT NULL,
  "default_amount" DECIMAL(10, 2) NOT NULL,
  "interval" "ExpenseTemplateInterval" NOT NULL,
  "day_of_month" INTEGER,
  "month_of_year" INTEGER,
  "service_period_months" INTEGER NOT NULL DEFAULT 1,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "note" TEXT,
  "created_by_id" VARCHAR(36) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "expense_template_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "expense_bill" (
  "id" VARCHAR(36) NOT NULL,
  "bill_number" VARCHAR(24) NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "category" "FinanceExpenseCategory" NOT NULL,
  "status" "ExpenseBillStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
  "payee_name" VARCHAR(120) NOT NULL,
  "amount" DECIMAL(10, 2) NOT NULL,
  "recognition_start" DATE NOT NULL,
  "recognition_end" DATE NOT NULL,
  "due_at" TIMESTAMP(3) NOT NULL,
  "note" TEXT,
  "template_id" VARCHAR(36),
  "created_by_id" VARCHAR(36) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "expense_bill_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "expense_bill_payment" (
  "id" VARCHAR(36) NOT NULL,
  "bill_id" VARCHAR(36) NOT NULL,
  "paid_amount" DECIMAL(10, 2) NOT NULL,
  "paid_at" TIMESTAMP(3) NOT NULL,
  "paid_by_id" VARCHAR(36) NOT NULL,
  "payment_method" VARCHAR(50) NOT NULL,
  "payment_proof_urls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "expense_bill_payment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "expense_bill_bill_number_key" ON "expense_bill"("bill_number");
CREATE INDEX "expense_bill_status_due_at_idx" ON "expense_bill"("status", "due_at");
CREATE INDEX "expense_bill_category_recognition_start_recognition_end_idx" ON "expense_bill"("category", "recognition_start", "recognition_end");
CREATE INDEX "expense_bill_payment_bill_id_paid_at_idx" ON "expense_bill_payment"("bill_id", "paid_at");
CREATE INDEX "expense_bill_payment_paid_at_idx" ON "expense_bill_payment"("paid_at");
CREATE INDEX "expense_template_is_active_interval_idx" ON "expense_template"("is_active", "interval");

ALTER TABLE "expense_bill"
ADD CONSTRAINT "expense_bill_template_id_fkey"
FOREIGN KEY ("template_id") REFERENCES "expense_template"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "expense_bill_payment"
ADD CONSTRAINT "expense_bill_payment_bill_id_fkey"
FOREIGN KEY ("bill_id") REFERENCES "expense_bill"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
