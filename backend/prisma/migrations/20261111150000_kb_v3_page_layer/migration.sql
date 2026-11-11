-- 知识库 v3 页级原文层（2026-11-11）
-- 设计：docs/knowledge-base/2026-11-11-kb-v3-design.md §5
-- 四个实体：kb_source（书）→ kb_page（页）→ kb_block（块）+ kb_toc（目录）。
--
-- 索引是派生结构：页/块全文（to_tsvector('simple', ...)）+ pg_trgm 兜底，
-- 随时可从页/块文本重建。表格不转录、图片不裁剪，因此没有表内容/图片表。
--
-- 注意：本仓库历史迁移 20260109000000_phase9_order_status_optimization
-- 在同一事务里新增并使用了枚举值，shadow database 回放会失败，
-- `prisma migrate dev` 在本机不可用；本迁移用 `prisma migrate deploy` 应用。

-- CreateTable
CREATE TABLE "kb_source" (
    "id" VARCHAR(120) NOT NULL,
    "collection" VARCHAR(40) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "publisher" VARCHAR(200),
    "version" VARCHAR(80),
    "published_year" INTEGER,
    "status" VARCHAR(20),
    "license" VARCHAR(200),
    "checksum" VARCHAR(64) NOT NULL,
    "archive_path" VARCHAR(500) NOT NULL,
    "page_count" INTEGER NOT NULL,
    "has_text_layer" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kb_source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kb_page" (
    "id" VARCHAR(160) NOT NULL,
    "source_id" VARCHAR(120) NOT NULL,
    "page_no" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "char_count" INTEGER NOT NULL,
    "width" DOUBLE PRECISION,
    "height" DOUBLE PRECISION,
    "image_path" VARCHAR(500),
    "image_rendered_at" TIMESTAMP(3),

    CONSTRAINT "kb_page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kb_block" (
    "id" VARCHAR(180) NOT NULL,
    "page_id" VARCHAR(160) NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "bbox" JSONB NOT NULL,
    "text" TEXT,
    "caption" TEXT,
    "order_index" INTEGER NOT NULL,

    CONSTRAINT "kb_block_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kb_toc" (
    "id" VARCHAR(180) NOT NULL,
    "source_id" VARCHAR(120) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "page_from" INTEGER NOT NULL,
    "page_to" INTEGER NOT NULL,
    "order_index" INTEGER NOT NULL,

    CONSTRAINT "kb_toc_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kb_source_collection_idx" ON "kb_source"("collection");

-- CreateIndex
CREATE INDEX "kb_page_source_id_idx" ON "kb_page"("source_id");

-- CreateIndex
CREATE UNIQUE INDEX "kb_page_source_id_page_no_key" ON "kb_page"("source_id", "page_no");

-- CreateIndex
CREATE INDEX "kb_block_page_id_idx" ON "kb_block"("page_id");

-- CreateIndex
CREATE INDEX "kb_toc_source_id_idx" ON "kb_toc"("source_id");

-- AddForeignKey
ALTER TABLE "kb_page" ADD CONSTRAINT "kb_page_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "kb_source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_block" ADD CONSTRAINT "kb_block_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "kb_page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_toc" ADD CONSTRAINT "kb_toc_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "kb_source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 全文/trigram 索引（设计 §7）：页文本、块文本 + 表题/图注。
-- Prisma schema 无法表达表达式索引，因此以原生 SQL 维护。
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "kb_page_text_tsv_idx" ON "kb_page"
  USING GIN (to_tsvector('simple', "text"));

CREATE INDEX "kb_page_text_trgm_idx" ON "kb_page"
  USING GIN ("text" gin_trgm_ops);

CREATE INDEX "kb_block_text_tsv_idx" ON "kb_block"
  USING GIN (to_tsvector('simple', coalesce("text", '') || ' ' || coalesce("caption", '')));

CREATE INDEX "kb_block_text_trgm_idx" ON "kb_block"
  USING GIN ((coalesce("text", '') || ' ' || coalesce("caption", '')) gin_trgm_ops);
