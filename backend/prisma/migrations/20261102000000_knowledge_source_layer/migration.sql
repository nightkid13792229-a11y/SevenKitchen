-- 知识库原文层（2026-11-02）
-- 只新增 6 张表，不改动任何已有表。

CREATE TABLE "source_document" (
    "id" VARCHAR(80) NOT NULL,
    "source_id" VARCHAR(64),
    "title" VARCHAR(500),
    "path" VARCHAR(500) NOT NULL,
    "page_count" INTEGER,
    "char_count" INTEGER,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,
    CONSTRAINT "source_document_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "source_section" (
    "id" VARCHAR(120) NOT NULL,
    "document_id" VARCHAR(80) NOT NULL,
    "title" TEXT NOT NULL,
    "page_no" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "source_section_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "source_paragraph" (
    "id" VARCHAR(120) NOT NULL,
    "document_id" VARCHAR(80) NOT NULL,
    "section_id" VARCHAR(120) NOT NULL,
    "text" TEXT NOT NULL,
    "page_start" INTEGER,
    "page_end" INTEGER,
    "char_count" INTEGER NOT NULL,
    CONSTRAINT "source_paragraph_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "source_table" (
    "id" VARCHAR(40) NOT NULL,
    "document_id" VARCHAR(80) NOT NULL,
    "page_no" INTEGER,
    "caption" TEXT NOT NULL,
    "columns" JSONB NOT NULL,
    "rows" JSONB NOT NULL,
    "verify" JSONB,
    "method" VARCHAR(24),
    "row_count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "source_table_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "source_figure" (
    "id" VARCHAR(200) NOT NULL,
    "document_id" VARCHAR(80) NOT NULL,
    "page_no" INTEGER,
    "path" VARCHAR(400) NOT NULL,
    "caption" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    CONSTRAINT "source_figure_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "knowledge_citation_anchor" (
    "id" TEXT NOT NULL,
    "entry_id" VARCHAR(64) NOT NULL,
    "source_name" VARCHAR(200),
    "locator" TEXT,
    "document_id" VARCHAR(80),
    "section_id" VARCHAR(120),
    "paragraph_ids" TEXT[],
    "table_ids" TEXT[],
    "precision" VARCHAR(16) NOT NULL,
    "confidence" VARCHAR(16) NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(6) NOT NULL,
    CONSTRAINT "knowledge_citation_anchor_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "source_section_document_id_idx" ON "source_section"("document_id");
CREATE INDEX "source_paragraph_section_id_idx" ON "source_paragraph"("section_id");
CREATE INDEX "source_paragraph_document_id_idx" ON "source_paragraph"("document_id");
CREATE INDEX "source_table_document_id_idx" ON "source_table"("document_id");
CREATE INDEX "source_figure_document_id_idx" ON "source_figure"("document_id");
CREATE INDEX "knowledge_citation_anchor_entry_id_idx" ON "knowledge_citation_anchor"("entry_id");
CREATE INDEX "knowledge_citation_anchor_document_id_idx" ON "knowledge_citation_anchor"("document_id");

ALTER TABLE "source_section" ADD CONSTRAINT "source_section_document_id_fkey"
    FOREIGN KEY ("document_id") REFERENCES "source_document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "source_paragraph" ADD CONSTRAINT "source_paragraph_document_id_fkey"
    FOREIGN KEY ("document_id") REFERENCES "source_document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "source_paragraph" ADD CONSTRAINT "source_paragraph_section_id_fkey"
    FOREIGN KEY ("section_id") REFERENCES "source_section"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "source_table" ADD CONSTRAINT "source_table_document_id_fkey"
    FOREIGN KEY ("document_id") REFERENCES "source_document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "source_figure" ADD CONSTRAINT "source_figure_document_id_fkey"
    FOREIGN KEY ("document_id") REFERENCES "source_document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
