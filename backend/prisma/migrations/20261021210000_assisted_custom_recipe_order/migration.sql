-- 2026-10-21 代客定制食谱订单 · Task 1：Schema 与迁移
--
-- 全程 **additive**（由 `prisma migrate diff --from-schema-datamodel HEAD^ --to-schema-datamodel` 生成）：
--   · 新增枚举 CustomRecipeOrderSource（SELF / ASSISTED）
--   · custom_recipe_order 加代客来源、操作人、线下收款 / 线下退款登记字段
--   · user 加代客客户标识与联系方式
--   · 新建只读交付分享表 custom_recipe_delivery_share
-- 不删表、不删列、不改既有列类型；回滚只需 drop 新增列/表与枚举。
--
-- 为什么必须这样：
--   · 代客单与自助单共用同一张订单表（不建第二套状态机）；
--   · 老订单 order_source 落 DEFAULT 'SELF'，行为不变；
--   · 线下已收款单靠 payment_channel 区分，绝不能误走微信原路退款；
--   · 分享 token 唯一且高熵，expires_at 为空 = 不自动过期（可撤销）。

-- CreateEnum
CREATE TYPE "CustomRecipeOrderSource" AS ENUM ('SELF', 'ASSISTED');

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "guest_contact_name" VARCHAR(50),
ADD COLUMN     "guest_contact_phone" VARCHAR(20),
ADD COLUMN     "guest_contact_wechat" VARCHAR(100),
ADD COLUMN     "guest_created_by_staff_id" TEXT,
ADD COLUMN     "is_guest" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "custom_recipe_order" ADD COLUMN     "actual_paid_amount" DECIMAL(10,2),
ADD COLUMN     "assisted_for_guest" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "created_by_staff_id" TEXT,
ADD COLUMN     "external_payment_ref" VARCHAR(100),
ADD COLUMN     "offline_refund_amount" DECIMAL(10,2),
ADD COLUMN     "offline_refund_by_staff_id" TEXT,
ADD COLUMN     "offline_refund_method" VARCHAR(30),
ADD COLUMN     "offline_refund_note" VARCHAR(200),
ADD COLUMN     "offline_refunded_at" TIMESTAMP(3),
ADD COLUMN     "order_source" "CustomRecipeOrderSource" NOT NULL DEFAULT 'SELF',
ADD COLUMN     "payment_channel" VARCHAR(30),
ADD COLUMN     "price_override_reason" VARCHAR(200),
ADD COLUMN     "refund_channel" VARCHAR(30);

-- CreateTable
CREATE TABLE "custom_recipe_delivery_share" (
    "id" TEXT NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "order_id" TEXT NOT NULL,
    "delivery_batch_id" TEXT,
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_by_staff_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_recipe_delivery_share_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "custom_recipe_delivery_share_token_key" ON "custom_recipe_delivery_share"("token");

-- CreateIndex
CREATE INDEX "custom_recipe_delivery_share_order_id_idx" ON "custom_recipe_delivery_share"("order_id");

-- CreateIndex
CREATE INDEX "custom_recipe_delivery_share_delivery_batch_id_idx" ON "custom_recipe_delivery_share"("delivery_batch_id");

-- AddForeignKey
ALTER TABLE "custom_recipe_delivery_share" ADD CONSTRAINT "custom_recipe_delivery_share_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "custom_recipe_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_recipe_delivery_share" ADD CONSTRAINT "custom_recipe_delivery_share_delivery_batch_id_fkey" FOREIGN KEY ("delivery_batch_id") REFERENCES "custom_recipe_delivery_batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
