-- 全库检索加速：段落正文与节标题的 trigram 索引。
-- 对应全库计划 Task 8（实测全库查询 3.5s，加索引后目标 <1.5s）。
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "source_paragraph_text_trgm"
  ON "source_paragraph" USING gin ("text" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "source_section_title_trgm"
  ON "source_section" USING gin ("title" gin_trgm_ops);
