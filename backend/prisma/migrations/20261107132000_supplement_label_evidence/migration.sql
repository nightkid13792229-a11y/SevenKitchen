-- 2026-11-07 补剂商品标签证据
--
-- 建档时就要留下当时那瓶的标签，商品下架后还能回查。
-- 刻意不设外键：证据在原料产生之前就要写（AI 读到链接的那一刻），
-- 设了外键就只能等原料落库后再补，中间那段就丢了。

CREATE TABLE "supplement_label_evidence" (
    "id" TEXT NOT NULL,
    "ingredient_id" TEXT,
    "nutrition_food_id" TEXT,
    "product_url" VARCHAR(500),
    "product_name" VARCHAR(200),
    "serving_units_per_dose" INTEGER NOT NULL,
    "label_image_url" VARCHAR(500),
    "label_text" TEXT,
    "conversion_snapshot" JSONB NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplement_label_evidence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "supplement_label_evidence_ingredient_id_idx" ON "supplement_label_evidence"("ingredient_id");
CREATE INDEX "supplement_label_evidence_nutrition_food_id_idx" ON "supplement_label_evidence"("nutrition_food_id");
