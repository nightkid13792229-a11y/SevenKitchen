-- CreateEnum
CREATE TYPE "NutritionRecordState" AS ENUM ('RAW', 'COOKED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "NutritionRecordMethod" AS ENUM ('BOILED', 'STEAMED', 'GRILLED', 'FRIED', 'OTHER', 'NONE');

-- CreateTable
CREATE TABLE "nutrition_record_classification" (
    "id" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "state" "NutritionRecordState" NOT NULL DEFAULT 'UNKNOWN',
    "method" "NutritionRecordMethod" NOT NULL DEFAULT 'NONE',
    "cut_label" VARCHAR(100),
    "cut_group" VARCHAR(50),
    "evidence" VARCHAR(200),
    "confidence" DOUBLE PRECISION,
    "model" VARCHAR(100),
    "classified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "corrected_by" VARCHAR(100),
    "corrected_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nutrition_record_classification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "nutrition_record_classification_record_id_key" ON "nutrition_record_classification"("record_id");

-- CreateIndex
CREATE INDEX "nutrition_record_classification_state_idx" ON "nutrition_record_classification"("state");

-- CreateIndex
CREATE INDEX "nutrition_record_classification_method_idx" ON "nutrition_record_classification"("method");

-- CreateIndex
CREATE INDEX "nutrition_record_classification_cut_group_idx" ON "nutrition_record_classification"("cut_group");

-- AddForeignKey
ALTER TABLE "nutrition_record_classification" ADD CONSTRAINT "nutrition_record_classification_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "nutrition_source_record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

