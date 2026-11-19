-- 固定费用账单生成幂等（设计文档 §5.4）：
-- 同一模板 + 同一费属起始月只能有一张账单，并发/重跑由数据库唯一约束兜底。
-- template_id 为空的临时/手工账单不受影响（PostgreSQL 唯一索引允许多个 NULL）。
-- 建索引前已确认现有库无 (template_id, recognition_start) 重复数据。
CREATE UNIQUE INDEX "expense_bill_template_id_recognition_start_key" ON "expense_bill"("template_id", "recognition_start");
