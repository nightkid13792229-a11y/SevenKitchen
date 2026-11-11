-- 下线旧知识库原文层与引用锚点（2026-11-12 · Task 10）
--
-- 旧原文层（source_document / source_section / source_paragraph / source_table /
-- source_figure）和知识条目出处锚点（knowledge_citation_anchor）已被
-- kb_source / kb_page / kb_block / kb_toc 取代，代码与脚本已删除，这里只 drop 表。
--
-- 注意：本仓库历史迁移 shadow database 回放失败（见 20261111150000_kb_v3_page_layer），
-- `prisma migrate dev` 在本机不可用；本迁移手写后用 `prisma migrate deploy` 应用。
--
-- 删除顺序：先锚点/子表，再 sections，最后 document，避免外键依赖报错。
DROP TABLE IF EXISTS "knowledge_citation_anchor";
DROP TABLE IF EXISTS "source_figure";
DROP TABLE IF EXISTS "source_table";
DROP TABLE IF EXISTS "source_paragraph";
DROP TABLE IF EXISTS "source_section";
DROP TABLE IF EXISTS "source_document";
