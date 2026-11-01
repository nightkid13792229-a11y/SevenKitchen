-- 中文检索索引（2026-11-02）
-- pg_trgm 对中文作用有限，但能显著加速 ILIKE '%词%' 的前缀/子串匹配；
-- 扩展不可用时跳过，不阻断迁移。

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_trgm 不可用，跳过索引创建';
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    CREATE INDEX IF NOT EXISTS "source_paragraph_text_trgm_idx"
      ON "source_paragraph" USING GIN ("text" gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS "source_table_caption_trgm_idx"
      ON "source_table" USING GIN ("caption" gin_trgm_ops);
  END IF;
END $$;
