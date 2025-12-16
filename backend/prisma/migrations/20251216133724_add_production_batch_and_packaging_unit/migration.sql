-- CreateEnum
CREATE TYPE "ProductionBatchStatus" AS ENUM ('PLANNED', 'IN_PRODUCTION', 'COMPLETED');

-- CreateTable
CREATE TABLE "production_batch" (
    "id" TEXT NOT NULL,
    "production_date" TIMESTAMP(3) NOT NULL,
    "status" "ProductionBatchStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "production_batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packaging_unit" (
    "id" TEXT NOT NULL,
    "production_batch_id" TEXT NOT NULL,
    "recipe_snapshot" JSONB NOT NULL,
    "total_production_g" DOUBLE PRECISION NOT NULL,
    "source_order_item_ids" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "packaging_unit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "production_batch_production_date_idx" ON "production_batch"("production_date");

-- CreateIndex
CREATE INDEX "production_batch_status_idx" ON "production_batch"("status");

-- CreateIndex
CREATE INDEX "packaging_unit_production_batch_id_idx" ON "packaging_unit"("production_batch_id");

-- AddForeignKey
ALTER TABLE "packaging_unit" ADD CONSTRAINT "packaging_unit_production_batch_id_fkey" FOREIGN KEY ("production_batch_id") REFERENCES "production_batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
