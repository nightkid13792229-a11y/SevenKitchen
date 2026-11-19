-- 财务「账户化 + 可编辑类别字典」（2026-11-19）
--
-- 设计真源：docs/superpowers/specs/2026-11-19-finance-accounts-and-categories-design.md
-- 在 2026-11-19 财务重做（finance_ledger_v2）之上的增量改造：
--   1) 新建 finance_category 类别字典表，支出类别不再写死在枚举里（记账输入即建、改名影响历史、删除=停用/合并）；
--   2) expense_bill / expense_template / finance_manual_entry 加 category_id（可空，外键到字典），
--      旧枚举列 category / income_category **保留一版兼容**，本迁移不删，新写入不再使用，下一版再删；
--   3) 七张表加 payer_account（出账/入账账户）：purchase_list / expense_bill / expense_bill_payment /
--      expense_template / finance_manual_entry / "order" / order_offline_refund。
--      取值 MERCHANT / PERSONAL_WECHAT / PERSONAL_ALIPAY / PERSONAL_BANK / CASH。
--
-- 本迁移三步：建表加列建索引 → 种子 16 个类别 → 回填历史数据。
-- 回填只填 NULL（幂等，可重复执行）：category_id 按旧枚举值 = code 对上；
-- payer_account 由 payer_type 推导（COMPANY → MERCHANT，其余 → PERSONAL_WECHAT）。
-- order / order_offline_refund 的历史行账户留空：线上支付按 MERCHANT 推导，线下老单没有账户信息。

-- AlterTable
ALTER TABLE "order" ADD COLUMN     "payer_account" VARCHAR(30);

-- AlterTable
ALTER TABLE "order_offline_refund" ADD COLUMN     "payer_account" VARCHAR(30);

-- AlterTable
ALTER TABLE "purchase_list" ADD COLUMN     "payer_account" VARCHAR(30);

-- AlterTable
ALTER TABLE "expense_bill" ADD COLUMN     "category_id" VARCHAR(36),
ADD COLUMN     "payer_account" VARCHAR(30);

-- AlterTable
ALTER TABLE "expense_bill_payment" ADD COLUMN     "payer_account" VARCHAR(30);

-- AlterTable
ALTER TABLE "expense_template" ADD COLUMN     "category_id" VARCHAR(36),
ADD COLUMN     "payer_account" VARCHAR(30);

-- AlterTable
ALTER TABLE "finance_manual_entry" ADD COLUMN     "category_id" VARCHAR(36),
ADD COLUMN     "payer_account" VARCHAR(30);

-- CreateTable
CREATE TABLE "finance_category" (
    "id" VARCHAR(36) NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "code" VARCHAR(40),
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "merged_into_id" VARCHAR(36),
    "created_by_id" VARCHAR(36),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_category_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "finance_category_name_key" ON "finance_category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "finance_category_code_key" ON "finance_category"("code");

-- CreateIndex
CREATE INDEX "finance_category_is_active_sort_order_idx" ON "finance_category"("is_active", "sort_order");

-- CreateIndex
CREATE INDEX "order_payer_account_idx" ON "order"("payer_account");

-- CreateIndex
CREATE INDEX "order_offline_refund_payer_account_idx" ON "order_offline_refund"("payer_account");

-- CreateIndex
CREATE INDEX "purchase_list_payer_account_idx" ON "purchase_list"("payer_account");

-- CreateIndex
CREATE INDEX "expense_bill_category_id_idx" ON "expense_bill"("category_id");

-- CreateIndex
CREATE INDEX "expense_bill_payer_account_idx" ON "expense_bill"("payer_account");

-- CreateIndex
CREATE INDEX "expense_bill_payment_payer_account_idx" ON "expense_bill_payment"("payer_account");

-- CreateIndex
CREATE INDEX "expense_template_category_id_idx" ON "expense_template"("category_id");

-- CreateIndex
CREATE INDEX "expense_template_payer_account_idx" ON "expense_template"("payer_account");

-- CreateIndex
CREATE INDEX "finance_manual_entry_category_id_idx" ON "finance_manual_entry"("category_id");

-- CreateIndex
CREATE INDEX "finance_manual_entry_payer_account_idx" ON "finance_manual_entry"("payer_account");

-- AddForeignKey
ALTER TABLE "finance_category" ADD CONSTRAINT "finance_category_merged_into_id_fkey" FOREIGN KEY ("merged_into_id") REFERENCES "finance_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_bill" ADD CONSTRAINT "expense_bill_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "finance_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_template" ADD CONSTRAINT "expense_template_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "finance_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_manual_entry" ADD CONSTRAINT "finance_manual_entry_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "finance_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- =====================================================================
-- 种子：16 个支出类别（覆盖旧 FinanceExpenseCategory 全部 16 个枚举值）
-- 系统类别 is_system = true（不可删、可改名）：食材 / 补剂 / 包材 / 快递 / 支付手续费
-- 普通类别（可改名、可停用、可合并）：房租 / 水电 / 宽带 / 服务器域名 / 工资 / 社保 /
--   税费 / 设备工具 / 行政费用 / 售后退款 / 其它
-- code 保留旧枚举值，只用于映射历史数据；老板自建类别 code 为空。
-- ON CONFLICT DO NOTHING：重复执行不重复插入，也不覆盖已改过的名字。
-- =====================================================================
INSERT INTO "finance_category" ("id", "name", "code", "is_system", "sort_order")
VALUES
  (gen_random_uuid()::text, '食材',         'RAW_MATERIAL',          true,  10),
  (gen_random_uuid()::text, '补剂',         'SUPPLEMENT',            true,  20),
  (gen_random_uuid()::text, '包材',         'PACKAGING_SUPPLIES',    true,  30),
  (gen_random_uuid()::text, '快递',         'LOGISTICS_DELIVERY',    true,  40),
  (gen_random_uuid()::text, '支付手续费',   'PAYMENT_FEE',           true,  50),
  (gen_random_uuid()::text, '房租',         'RENT',                  false, 60),
  (gen_random_uuid()::text, '水电',         'UTILITIES',             false, 70),
  (gen_random_uuid()::text, '宽带',         'NETWORK_COMMUNICATION', false, 80),
  (gen_random_uuid()::text, '服务器/域名',  'TECHNICAL_SERVICES',    false, 90),
  (gen_random_uuid()::text, '工资',         'PAYROLL',               false, 100),
  (gen_random_uuid()::text, '社保',         'SOCIAL_INSURANCE',      false, 110),
  (gen_random_uuid()::text, '税费',         'TAX',                   false, 120),
  (gen_random_uuid()::text, '设备工具',     'EQUIPMENT',             false, 130),
  (gen_random_uuid()::text, '行政费用',     'ADMINISTRATIVE',        false, 140),
  (gen_random_uuid()::text, '售后退款',     'AFTERSALE_LOSS',        false, 150),
  (gen_random_uuid()::text, '其它',         'OTHER',                 false, 160)
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 回填 category_id：旧枚举值 → 类别字典（按 code 对应）
-- 只填空值，可重复执行；本来就允许为空的行（手工收入）不受影响。
-- =====================================================================
UPDATE "expense_bill" AS t
SET "category_id" = c."id"
FROM "finance_category" AS c
WHERE c."code" = t."category"::text
  AND t."category_id" IS NULL;

UPDATE "expense_template" AS t
SET "category_id" = c."id"
FROM "finance_category" AS c
WHERE c."code" = t."category"::text
  AND t."category_id" IS NULL;

UPDATE "finance_manual_entry" AS t
SET "category_id" = c."id"
FROM "finance_category" AS c
WHERE t."category" IS NOT NULL
  AND c."code" = t."category"::text
  AND t."category_id" IS NULL;

-- =====================================================================
-- 回填 payer_account：由旧 payer_type 推导
--   COMPANY  → MERCHANT（钱其实也是从老板手里出，老板要求保留商户号选项）
--   其余     → PERSONAL_WECHAT（老数据默认都是个人垫付）
-- 只填 NULL，可重复执行。order / order_offline_refund 留空，不做推导。
-- =====================================================================
UPDATE "purchase_list"
SET "payer_account" = CASE WHEN "payer_type" = 'COMPANY' THEN 'MERCHANT' ELSE 'PERSONAL_WECHAT' END
WHERE "payer_account" IS NULL;

UPDATE "expense_bill"
SET "payer_account" = CASE WHEN "payer_type" = 'COMPANY' THEN 'MERCHANT' ELSE 'PERSONAL_WECHAT' END
WHERE "payer_account" IS NULL;

UPDATE "expense_bill_payment"
SET "payer_account" = CASE WHEN "payer_type" = 'COMPANY' THEN 'MERCHANT' ELSE 'PERSONAL_WECHAT' END
WHERE "payer_account" IS NULL;

UPDATE "expense_template"
SET "payer_account" = CASE WHEN "payer_type" = 'COMPANY' THEN 'MERCHANT' ELSE 'PERSONAL_WECHAT' END
WHERE "payer_account" IS NULL;

UPDATE "finance_manual_entry"
SET "payer_account" = CASE WHEN "payer_type" = 'COMPANY' THEN 'MERCHANT' ELSE 'PERSONAL_WECHAT' END
WHERE "payer_account" IS NULL;
