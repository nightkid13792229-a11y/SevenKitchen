-- CreateTable
CREATE TABLE "ingredient_creation_draft" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "IngredientType" NOT NULL,
    "step" VARCHAR(20) NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingredient_creation_draft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredient_creation_audit" (
    "id" TEXT NOT NULL,
    "draft_id" TEXT NOT NULL,
    "ingredient_id" TEXT NOT NULL,
    "nutrition_food_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "proposals" JSONB NOT NULL,
    "changes" JSONB NOT NULL,
    "committed_by" TEXT NOT NULL,
    "committed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingredient_creation_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ingredient_creation_draft_created_by_idx" ON "ingredient_creation_draft"("created_by");

-- CreateIndex
CREATE INDEX "ingredient_creation_draft_created_at_idx" ON "ingredient_creation_draft"("created_at");

-- CreateIndex
CREATE INDEX "ingredient_creation_audit_ingredient_id_idx" ON "ingredient_creation_audit"("ingredient_id");

