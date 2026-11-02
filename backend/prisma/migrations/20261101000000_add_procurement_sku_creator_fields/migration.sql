-- AlterTable
ALTER TABLE "procurement_sku" ADD COLUMN     "created_by_id" VARCHAR(36),
ADD COLUMN     "created_source" VARCHAR(20),
ADD COLUMN     "source_screenshot_url" VARCHAR(500);

-- CreateTable
CREATE TABLE "procurement_sku_draft_usage" (
    "id" VARCHAR(36) NOT NULL,
    "user_id" VARCHAR(36) NOT NULL,
    "used_on" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "procurement_sku_draft_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "procurement_sku_draft_usage_used_on_idx" ON "procurement_sku_draft_usage"("used_on");

-- CreateIndex
CREATE UNIQUE INDEX "procurement_sku_draft_usage_user_id_used_on_key" ON "procurement_sku_draft_usage"("user_id", "used_on");

-- CreateIndex
CREATE INDEX "procurement_sku_created_source_created_at_idx" ON "procurement_sku"("created_source", "created_at");

-- AddForeignKey
ALTER TABLE "procurement_sku" ADD CONSTRAINT "procurement_sku_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

