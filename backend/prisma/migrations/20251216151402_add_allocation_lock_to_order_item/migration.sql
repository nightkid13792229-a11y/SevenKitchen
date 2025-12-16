-- AlterTable
ALTER TABLE "order_item" ADD COLUMN     "allocated_at" TIMESTAMP(3),
ADD COLUMN     "production_batch_id" TEXT;

-- CreateIndex
CREATE INDEX "order_item_production_batch_id_idx" ON "order_item"("production_batch_id");
