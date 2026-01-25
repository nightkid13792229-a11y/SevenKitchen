-- AlterTable
ALTER TABLE "reimbursement" ADD COLUMN "platform_shipping_fee" DECIMAL(10,2),
ADD COLUMN "platform_packaging_fee" DECIMAL(10,2),
ADD COLUMN "custom_fees" JSONB;
