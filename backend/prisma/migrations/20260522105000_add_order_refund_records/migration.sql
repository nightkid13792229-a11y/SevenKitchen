CREATE TABLE "order_refund_record" (
    "id" VARCHAR(36) NOT NULL,
    "order_id" TEXT NOT NULL,
    "out_trade_no" VARCHAR(80) NOT NULL,
    "out_refund_no" VARCHAR(80) NOT NULL,
    "refund_id" VARCHAR(120),
    "amount" DECIMAL(10,2) NOT NULL,
    "total_amount" DECIMAL(10,2) NOT NULL,
    "reason" VARCHAR(200) NOT NULL,
    "source" VARCHAR(40) NOT NULL DEFAULT 'ADMIN_RETRY',
    "status" VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    "status_text" VARCHAR(200),
    "success" BOOLEAN NOT NULL DEFAULT false,
    "operator_id" VARCHAR(36),
    "operator_name_snapshot" VARCHAR(120),
    "adjustment_id" VARCHAR(36),
    "request_payload" JSONB,
    "response_payload" JSONB,
    "notify_payload" JSONB,
    "error_message" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notified_at" TIMESTAMP(3),
    "success_time" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_refund_record_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "order_refund_record_out_refund_no_key" ON "order_refund_record"("out_refund_no");
CREATE INDEX "order_refund_record_order_id_created_at_idx" ON "order_refund_record"("order_id", "created_at");
CREATE INDEX "order_refund_record_order_id_success_idx" ON "order_refund_record"("order_id", "success");
CREATE INDEX "order_refund_record_status_idx" ON "order_refund_record"("status");
CREATE INDEX "order_refund_record_operator_id_idx" ON "order_refund_record"("operator_id");

ALTER TABLE "order_refund_record"
  ADD CONSTRAINT "order_refund_record_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_refund_record"
  ADD CONSTRAINT "order_refund_record_operator_id_fkey"
  FOREIGN KEY ("operator_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "order_refund_record" (
    "id",
    "order_id",
    "out_trade_no",
    "out_refund_no",
    "refund_id",
    "amount",
    "total_amount",
    "reason",
    "source",
    "status",
    "status_text",
    "success",
    "operator_id",
    "adjustment_id",
    "response_payload",
    "success_time",
    "created_at",
    "updated_at"
)
SELECT
    md5(osa."id"),
    osa."order_id",
    replace(osa."order_id", '-', ''),
    COALESCE(osa."source_id", osa."metadata"->>'outRefundNo', 'LEGACY-' || osa."id"),
    osa."metadata"->>'refundId',
    abs(osa."amount"),
    o."amount_total",
    osa."reason",
    'LEGACY_ADJUSTMENT',
    COALESCE(osa."metadata"->>'refundStatus', osa."metadata"->>'wechatStatus', osa."status"),
    CASE
      WHEN osa."status" = 'SETTLED' OR osa."metadata"->>'refundStatus' = 'SUCCESS' THEN '退款成功，钱款已原路退回'
      WHEN COALESCE(osa."metadata"->>'refundStatus', osa."metadata"->>'wechatStatus', osa."status") IN ('PENDING', 'PROCESSING') THEN '退款处理中，等待微信确认'
      WHEN COALESCE(osa."metadata"->>'refundStatus', osa."metadata"->>'wechatStatus', osa."status") = 'ABNORMAL' THEN '退款异常，请管理员到微信商户平台核查'
      WHEN COALESCE(osa."metadata"->>'refundStatus', osa."metadata"->>'wechatStatus', osa."status") = 'CLOSED' THEN '退款已关闭，请管理员核查'
      ELSE NULL
    END,
    (osa."status" = 'SETTLED' OR osa."metadata"->>'refundStatus' = 'SUCCESS'),
    CASE WHEN u."id" IS NOT NULL THEN osa."created_by_id" ELSE NULL END,
    osa."id",
    osa."metadata",
    CASE
      WHEN osa."settled_at" IS NOT NULL THEN osa."settled_at"
      WHEN osa."metadata"->>'successTime' IS NOT NULL THEN (osa."metadata"->>'successTime')::timestamp
      ELSE NULL
    END,
    osa."created_at",
    osa."updated_at"
FROM "order_settlement_adjustment" osa
JOIN "order" o ON o."id" = osa."order_id"
LEFT JOIN "user" u ON u."id" = osa."created_by_id"
WHERE osa."source_type" = 'WECHAT_REFUND'
  AND osa."status" <> 'CANCELLED'
  AND COALESCE(osa."source_id", osa."metadata"->>'outRefundNo', '') <> ''
ON CONFLICT ("out_refund_no") DO NOTHING;
