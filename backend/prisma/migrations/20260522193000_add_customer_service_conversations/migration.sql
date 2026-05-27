-- CreateTable
CREATE TABLE "customer_service_conversation" (
    "id" TEXT NOT NULL,
    "provider" VARCHAR(60) NOT NULL DEFAULT 'WECHAT_CUSTOMER_SERVICE',
    "external_conversation_id" VARCHAR(180),
    "open_kfid" VARCHAR(120),
    "external_user_id" VARCHAR(180),
    "customer_id" TEXT,
    "order_id" TEXT,
    "product_id" TEXT,
    "source_type" VARCHAR(40) NOT NULL DEFAULT 'GENERAL',
    "source_title" VARCHAR(200),
    "source_path" VARCHAR(500),
    "status" VARCHAR(40) NOT NULL DEFAULT 'OPEN',
    "assigned_staff_id" TEXT,
    "last_message_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_service_conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_service_message" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "provider" VARCHAR(60) NOT NULL DEFAULT 'WECHAT_CUSTOMER_SERVICE',
    "provider_message_id" VARCHAR(180),
    "direction" VARCHAR(20) NOT NULL DEFAULT 'INBOUND',
    "event_type" VARCHAR(80),
    "message_type" VARCHAR(80),
    "content" TEXT,
    "raw_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_service_message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_service_conversation_provider_external_conversation_id_key" ON "customer_service_conversation"("provider", "external_conversation_id");

-- CreateIndex
CREATE INDEX "customer_service_conversation_customer_id_idx" ON "customer_service_conversation"("customer_id");

-- CreateIndex
CREATE INDEX "customer_service_conversation_order_id_idx" ON "customer_service_conversation"("order_id");

-- CreateIndex
CREATE INDEX "customer_service_conversation_product_id_idx" ON "customer_service_conversation"("product_id");

-- CreateIndex
CREATE INDEX "customer_service_conversation_status_last_message_at_idx" ON "customer_service_conversation"("status", "last_message_at");

-- CreateIndex
CREATE INDEX "customer_service_conversation_external_user_id_idx" ON "customer_service_conversation"("external_user_id");

-- CreateIndex
CREATE INDEX "customer_service_message_conversation_id_created_at_idx" ON "customer_service_message"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "customer_service_message_provider_message_id_idx" ON "customer_service_message"("provider_message_id");

-- CreateIndex
CREATE INDEX "customer_service_message_event_type_idx" ON "customer_service_message"("event_type");

-- AddForeignKey
ALTER TABLE "customer_service_message" ADD CONSTRAINT "customer_service_message_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "customer_service_conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
