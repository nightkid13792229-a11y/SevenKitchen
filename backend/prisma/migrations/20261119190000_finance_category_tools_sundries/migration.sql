-- 类别种子补丁（2026-11-19）：报销杂费映射需要的「工具」「杂物」
--
-- 20261119182000 那条迁移只种了旧枚举的 16 个类别，而报销单的
-- customFees 是 TOOLS / SUNDRIES / OTHER，映射到类别字典的
-- 「工具 / 杂物 / 其它」。其中「工具」「杂物」不在那 16 个里，这里补两条，
-- 否则 `FinanceCategoryService.ensureByName('工具', 'TOOLS')` 第一次用到时
-- 还得在请求链路里写库（启动不写库，但读接口也不该写入）。
--
-- code 与报销 customFees 的值对齐，只用于映射；ON CONFLICT DO NOTHING
-- 保证重复执行不重复插入，也不覆盖老板改过的名字。
INSERT INTO "finance_category" ("id", "name", "code", "is_system", "sort_order")
VALUES
  (gen_random_uuid()::text, '工具', 'TOOLS',    false, 170),
  (gen_random_uuid()::text, '杂物', 'SUNDRIES', false, 180)
ON CONFLICT DO NOTHING;
