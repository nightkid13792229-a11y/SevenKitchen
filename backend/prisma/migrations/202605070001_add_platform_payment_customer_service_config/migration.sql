-- Add local/production configurable payment and customer service settings.
-- Secrets are stored server-side and are not returned in admin GET responses.

CREATE TABLE IF NOT EXISTS "payment_config" (
  "id" TEXT NOT NULL DEFAULT 'singleton',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "provider" VARCHAR(40) NOT NULL DEFAULT 'WECHAT_PAY',
  "mode" VARCHAR(20) NOT NULL DEFAULT 'SANDBOX',
  "app_id" VARCHAR(80),
  "mch_id" VARCHAR(64),
  "merchant_serial_number" VARCHAR(128),
  "api_v3_key" VARCHAR(255),
  "private_key_pem" TEXT,
  "notify_url" VARCHAR(500),
  "refund_notify_url" VARCHAR(500),
  "payment_timeout_minutes" INTEGER NOT NULL DEFAULT 30,
  "auto_close_unpaid" BOOLEAN NOT NULL DEFAULT true,
  "allow_refund" BOOLEAN NOT NULL DEFAULT false,
  "require_refund_review" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_config_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "customer_service_config" (
  "id" TEXT NOT NULL DEFAULT 'singleton',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "provider" VARCHAR(60) NOT NULL DEFAULT 'WECHAT_CUSTOMER_SERVICE',
  "corp_id" VARCHAR(80),
  "open_kfid" VARCHAR(120),
  "customer_service_url" VARCHAR(500),
  "customer_service_secret" VARCHAR(255),
  "token" VARCHAR(255),
  "encoding_aes_key" VARCHAR(255),
  "order_card_title_template" VARCHAR(120) NOT NULL DEFAULT '订单 {orderNo}',
  "order_card_path_template" VARCHAR(300) NOT NULL DEFAULT '/pages/orders/detail?id={orderId}',
  "welcome_message" VARCHAR(500),
  "auto_assign_enabled" BOOLEAN NOT NULL DEFAULT true,
  "same_customer_priority" BOOLEAN NOT NULL DEFAULT true,
  "service_timeout_minutes" INTEGER NOT NULL DEFAULT 10,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_service_config_pkey" PRIMARY KEY ("id")
);
