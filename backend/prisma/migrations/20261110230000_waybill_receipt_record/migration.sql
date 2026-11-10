-- 快递存根核对记录：一行 = 一次识别 / 一次手动填写
-- 发货硬锁靠它：提交时必须能查到「这个运单号是对着这单收货人核对过的」
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
