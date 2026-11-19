-- 补剂证据：留正面图，留选品快照（形态依据 + 比价 + 选中那瓶）
ALTER TABLE "supplement_label_evidence"
  ADD COLUMN IF NOT EXISTS "front_image_url" VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "selection_snapshot" JSONB;
