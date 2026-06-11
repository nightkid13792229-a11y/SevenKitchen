CREATE TYPE "OrderShippingNotificationSubscriptionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

CREATE TYPE "OrderShippingNotificationSendStatus" AS ENUM ('NOT_SENT', 'SENT', 'FAILED', 'SKIPPED');

CREATE TABLE "order_shipping_notification" (
  "id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "template_id" VARCHAR(120),
  "subscription_status" "OrderShippingNotificationSubscriptionStatus" NOT NULL DEFAULT 'PENDING',
  "subscribed_at" TIMESTAMP(3),
  "declined_at" TIMESTAMP(3),
  "last_prompted_at" TIMESTAMP(3),
  "send_status" "OrderShippingNotificationSendStatus" NOT NULL DEFAULT 'NOT_SENT',
  "sent_at" TIMESTAMP(3),
  "msgid" VARCHAR(120),
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "order_shipping_notification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "order_shipping_notification_order_id_key"
  ON "order_shipping_notification"("order_id");

CREATE INDEX "order_shipping_notification_customer_id_idx"
  ON "order_shipping_notification"("customer_id");

CREATE INDEX "order_shipping_notification_subscription_status_idx"
  ON "order_shipping_notification"("subscription_status");

CREATE INDEX "order_shipping_notification_send_status_idx"
  ON "order_shipping_notification"("send_status");
