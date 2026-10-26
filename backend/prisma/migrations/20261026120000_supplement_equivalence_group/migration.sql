-- CreateEnum
CREATE TYPE "SupplementEquivalenceStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'DISABLED');

-- AlterTable
ALTER TABLE "ingredient" ADD COLUMN     "equivalence_group_id" TEXT,
ADD COLUMN     "equivalence_priority" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "diy_sheet" ADD COLUMN     "supplement_selections" JSONB;

-- AlterTable
ALTER TABLE "supplement_shop_config" ADD COLUMN     "equivalence_enabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "supplement_order_item" ADD COLUMN     "dosage_snapshot" JSONB,
ADD COLUMN     "recipe_item_id" TEXT,
ADD COLUMN     "source_ingredient_id" TEXT;

-- CreateTable
CREATE TABLE "supplement_equivalence_group" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "nutrient_key" VARCHAR(100) NOT NULL,
    "nutrient_label" VARCHAR(50) NOT NULL,
    "nutrient_unit" VARCHAR(20) NOT NULL,
    "form_category" VARCHAR(50),
    "description" TEXT,
    "rationale" TEXT,
    "evidence_urls" JSONB,
    "status" "SupplementEquivalenceStatus" NOT NULL DEFAULT 'DRAFT',
    "reviewed_by" VARCHAR(100),
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplement_equivalence_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplement_equivalence_group_audit" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "action" VARCHAR(30) NOT NULL,
    "changes" JSONB,
    "operator_id" TEXT,
    "operator_name" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplement_equivalence_group_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "supplement_equivalence_group_code_key" ON "supplement_equivalence_group"("code");

-- CreateIndex
CREATE INDEX "supplement_equivalence_group_nutrient_key_idx" ON "supplement_equivalence_group"("nutrient_key");

-- CreateIndex
CREATE INDEX "supplement_equivalence_group_status_idx" ON "supplement_equivalence_group"("status");

-- CreateIndex
CREATE INDEX "supplement_equivalence_group_is_active_idx" ON "supplement_equivalence_group"("is_active");

-- CreateIndex
CREATE INDEX "supplement_equivalence_group_audit_group_id_created_at_idx" ON "supplement_equivalence_group_audit"("group_id", "created_at");

-- CreateIndex
CREATE INDEX "ingredient_equivalence_group_id_idx" ON "ingredient"("equivalence_group_id");

-- AddForeignKey
ALTER TABLE "ingredient" ADD CONSTRAINT "ingredient_equivalence_group_id_fkey" FOREIGN KEY ("equivalence_group_id") REFERENCES "supplement_equivalence_group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplement_equivalence_group_audit" ADD CONSTRAINT "supplement_equivalence_group_audit_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "supplement_equivalence_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

