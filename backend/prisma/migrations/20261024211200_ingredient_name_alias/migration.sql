-- CreateEnum
CREATE TYPE "IngredientNameAliasSource" AS ENUM ('MANUAL_SEED', 'AI_TRANSLATION', 'HUMAN_CORRECTION');

-- CreateTable
CREATE TABLE "ingredient_name_alias" (
    "id" TEXT NOT NULL,
    "zh_term" VARCHAR(100) NOT NULL,
    "foreign_term" VARCHAR(200) NOT NULL,
    "language" VARCHAR(10) NOT NULL,
    "source" "IngredientNameAliasSource" NOT NULL,
    "hit_count" INTEGER NOT NULL DEFAULT 0,
    "last_hit_at" TIMESTAMP(3),
    "source_record_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingredient_name_alias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ingredient_name_alias_source_record_id_idx" ON "ingredient_name_alias"("source_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "ingredient_name_alias_zh_term_foreign_term_language_key" ON "ingredient_name_alias"("zh_term", "foreign_term", "language");

-- AddForeignKey
ALTER TABLE "ingredient_name_alias" ADD CONSTRAINT "ingredient_name_alias_source_record_id_fkey" FOREIGN KEY ("source_record_id") REFERENCES "nutrition_source_record"("id") ON DELETE SET NULL ON UPDATE CASCADE;

