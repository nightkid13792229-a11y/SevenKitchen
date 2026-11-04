-- 采购-报销 AI 接入：订单截图识别（2026-11-04）
-- 一张截图 = 一笔订单；识别只落草稿，员工确认后才生成 purchase_record。

CREATE TYPE "PurchaseOrderImportStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'DISCARDED');
CREATE TYPE "PurchaseOrderImportMatchSource" AS ENUM ('AUTO', 'MANUAL', 'NEW_SKU', 'PERSONAL');

-- 采购记录追溯到来源截图
ALTER TABLE "purchase_record"
  ADD COLUMN "source_import_id" VARCHAR(36),
  ADD COLUMN "source_import_line_id" VARCHAR(36),
  ADD COLUMN "source_image_key" VARCHAR(300);

CREATE INDEX "purchase_record_source_import_id_idx" ON "purchase_record"("source_import_id");

-- 报销单：凭证金额 / 差额 / 私有凭证 key
ALTER TABLE "reimbursement"
  ADD COLUMN "voucher_amount" DECIMAL(10,2),
  ADD COLUMN "difference_amount" DECIMAL(10,2),
  ADD COLUMN "difference_note" VARCHAR(200),
  ADD COLUMN "receipt_keys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "purchase_order_import" (
  "id" VARCHAR(36) NOT NULL,
  "purchase_list_id" VARCHAR(36) NOT NULL,
  "uploaded_by_id" VARCHAR(36) NOT NULL,
  "channel" VARCHAR(30) NOT NULL,
  "order_no" VARCHAR(40),
  "order_time" TIMESTAMP(3),
  "subtotal" DECIMAL(10,2),
  "shipping_fee" DECIMAL(10,2),
  "packaging_fee" DECIMAL(10,2),
  "paid" DECIMAL(10,2),
  "image_urls" TEXT[] NOT NULL,
  "image_keys" TEXT[] NOT NULL,
  "image_hash" VARCHAR(64) NOT NULL,
  "status" "PurchaseOrderImportStatus" NOT NULL DEFAULT 'DRAFT',
  "incomplete" BOOLEAN NOT NULL DEFAULT false,
  "incomplete_reason" VARCHAR(200),
  "model" VARCHAR(60),
  "prompt_version" VARCHAR(20),
  "raw_result" JSONB,
  "confirmed_at" TIMESTAMP(3),
  "confirmed_by_id" VARCHAR(36),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "purchase_order_import_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "purchase_order_import_purchase_list_id_idx" ON "purchase_order_import"("purchase_list_id");
CREATE INDEX "purchase_order_import_image_hash_idx" ON "purchase_order_import"("image_hash");
CREATE INDEX "purchase_order_import_status_idx" ON "purchase_order_import"("status");

ALTER TABLE "purchase_order_import"
  ADD CONSTRAINT "purchase_order_import_purchase_list_id_fkey"
  FOREIGN KEY ("purchase_list_id") REFERENCES "purchase_list"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "purchase_order_import_line" (
  "id" VARCHAR(36) NOT NULL,
  "import_id" VARCHAR(36) NOT NULL,
  "line_no" INTEGER NOT NULL,
  "raw_name" VARCHAR(300) NOT NULL,
  "spec" VARCHAR(120),
  "qty" DECIMAL(10,3),
  "unit" VARCHAR(20),
  "unit_price" DECIMAL(10,2),
  "line_total" DECIMAL(10,2),
  "ingredient_id" VARCHAR(36),
  "procurement_sku_id" VARCHAR(36),
  "match_source" "PurchaseOrderImportMatchSource" NOT NULL DEFAULT 'AUTO',
  "match_confidence" VARCHAR(10),
  "is_personal" BOOLEAN NOT NULL DEFAULT false,
  "edited_by_user" BOOLEAN NOT NULL DEFAULT false,
  "purchase_item_id" VARCHAR(36),
  "purchase_record_id" VARCHAR(36),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "purchase_order_import_line_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "purchase_order_import_line_import_id_idx" ON "purchase_order_import_line"("import_id");
CREATE INDEX "purchase_order_import_line_ingredient_id_idx" ON "purchase_order_import_line"("ingredient_id");

ALTER TABLE "purchase_order_import_line"
  ADD CONSTRAINT "purchase_order_import_line_import_id_fkey"
  FOREIGN KEY ("import_id") REFERENCES "purchase_order_import"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
