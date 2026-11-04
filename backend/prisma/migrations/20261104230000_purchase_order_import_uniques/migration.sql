-- 防重复：同一张清单里同一张图只能导入一次（放弃后允许重导）
CREATE UNIQUE INDEX "purchase_order_import_list_hash_active_key"
  ON "purchase_order_import"("purchase_list_id", "image_hash")
  WHERE "status" <> 'DISCARDED';

-- 防重复记账：一条识别行最多生成一条采购记录
CREATE UNIQUE INDEX "purchase_record_source_import_line_key"
  ON "purchase_record"("source_import_line_id")
  WHERE "source_import_line_id" IS NOT NULL;
