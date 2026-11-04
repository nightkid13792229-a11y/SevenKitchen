CREATE TABLE "procurement_sku_name_change" (
  "id" VARCHAR(36) NOT NULL,
  "sku_id" VARCHAR(36) NOT NULL,
  "old_name" TEXT NOT NULL,
  "new_name" TEXT NOT NULL,
  "source" VARCHAR(30) NOT NULL,
  "changed_by_id" VARCHAR(36),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "procurement_sku_name_change_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "procurement_sku_name_change_sku_id_created_at_idx"
  ON "procurement_sku_name_change"("sku_id", "created_at");

CREATE TABLE "purchase_order_match_alias" (
  "id" VARCHAR(36) NOT NULL,
  "normalized_name" VARCHAR(300) NOT NULL,
  "channel_family" VARCHAR(30) NOT NULL DEFAULT '',
  "ingredient_id" VARCHAR(36) NOT NULL,
  "procurement_sku_id" VARCHAR(36),
  "created_by_id" VARCHAR(36),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "purchase_order_match_alias_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "purchase_order_match_alias_normalized_name_channel_family_key"
  ON "purchase_order_match_alias"("normalized_name", "channel_family");
CREATE INDEX "purchase_order_match_alias_ingredient_id_idx"
  ON "purchase_order_match_alias"("ingredient_id");
