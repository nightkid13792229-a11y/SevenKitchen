-- 2026-11-12: 采购记录保存下单时的包装层级快照，SKU 后续改规格也可追溯
ALTER TABLE "purchase_record" ADD COLUMN "packaging_snapshot" JSONB;
ALTER TABLE "purchase_record" ADD COLUMN "packaging_text_snapshot" VARCHAR(300);
