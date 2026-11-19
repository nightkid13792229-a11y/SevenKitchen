-- 2026-11-19 财务模块重做（小程序端）· 数据库底座
--
-- 背景见 docs/superpowers/plans/2026-11-19-finance-miniapp-ledger.md（Task 2）：
-- 财务不再建全量流水表，按业务源表实时聚合；缺的是三样东西——
--   1) 手工收支：老板自己记的一笔（记一笔），不属于任何业务表，可作废不可删；
--   2) 线下退款：微信原路退在 order_refund_record，线下转账/现金退的钱单独登记；
--   3) 付款方：采购单 / 账单 / 账单付款各记「谁垫的钱」，报销与财务口径都要用。
-- 另外补 5 个支出分类（补剂、税费、社保、设备、通道手续费）和季度固定费用模板。
--
-- 纯结构变更，不改任何历史数据；新列均有默认值 PERSONAL，存量行自动归为个人垫付。

ALTER TYPE "FinanceExpenseCategory" ADD VALUE 'SUPPLEMENT';
ALTER TYPE "FinanceExpenseCategory" ADD VALUE 'TAX';
ALTER TYPE "FinanceExpenseCategory" ADD VALUE 'SOCIAL_INSURANCE';
ALTER TYPE "FinanceExpenseCategory" ADD VALUE 'EQUIPMENT';
ALTER TYPE "FinanceExpenseCategory" ADD VALUE 'PAYMENT_FEE';

-- AlterEnum
ALTER TYPE "ExpenseTemplateInterval" ADD VALUE 'QUARTERLY';

-- AlterTable
ALTER TABLE "purchase_list" ADD COLUMN     "payer_type" VARCHAR(10) NOT NULL DEFAULT 'PERSONAL',
ADD COLUMN     "payer_user_id" VARCHAR(36);

-- AlterTable
ALTER TABLE "expense_bill" ADD COLUMN     "payer_type" VARCHAR(10) NOT NULL DEFAULT 'PERSONAL',
ADD COLUMN     "payer_user_id" VARCHAR(36);

-- AlterTable
ALTER TABLE "expense_bill_payment" ADD COLUMN     "payer_type" VARCHAR(10) NOT NULL DEFAULT 'PERSONAL';

-- CreateTable
CREATE TABLE "order_offline_refund" (
    "id" VARCHAR(36) NOT NULL,
    "order_id" VARCHAR(36) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "refunded_at" DATE NOT NULL,
    "method" VARCHAR(20) NOT NULL,
    "note" TEXT,
    "proof_keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_by_id" VARCHAR(36) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voided_at" TIMESTAMP(3),
    "void_reason" VARCHAR(200),

    CONSTRAINT "order_offline_refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_manual_entry" (
    "id" VARCHAR(36) NOT NULL,
    "direction" VARCHAR(10) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "occurred_at" DATE NOT NULL,
    "category" "FinanceExpenseCategory",
    "income_category" VARCHAR(30),
    "payer_type" VARCHAR(10) NOT NULL DEFAULT 'PERSONAL',
    "payer_user_id" VARCHAR(36),
    "title" VARCHAR(200) NOT NULL,
    "note" TEXT,
    "proof_keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_by_id" VARCHAR(36) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "voided_at" TIMESTAMP(3),
    "void_reason" VARCHAR(200),

    CONSTRAINT "finance_manual_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_offline_refund_order_id_refunded_at_idx" ON "order_offline_refund"("order_id", "refunded_at");

-- CreateIndex
CREATE INDEX "finance_manual_entry_occurred_at_idx" ON "finance_manual_entry"("occurred_at");

-- CreateIndex
CREATE INDEX "finance_manual_entry_direction_occurred_at_idx" ON "finance_manual_entry"("direction", "occurred_at");

-- AddForeignKey
ALTER TABLE "order_offline_refund" ADD CONSTRAINT "order_offline_refund_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

