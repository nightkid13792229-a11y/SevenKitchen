-- 2026-10-26：补齐 10 字迁移执行瞬间之后仍存在的 2 条超长记录。
-- 只更新这 2 条；条件里保留原文，避免覆盖并发修改。
UPDATE "recipe_item" AS t
SET "preparation_method" = v.after_value
FROM (VALUES
  ('e751a799-5805-447f-a0ab-e9a0da062a29', '去皮、煮熟后称重、打碎、充分搅拌', '熟/去皮'),
  ('73481437-4681-4b21-9198-85619204800f', '去皮、去瓤、生重、打碎、充分搅拌', '生/去皮')
) AS v(id, before_value, after_value)
WHERE t.id = v.id
  AND t.preparation_method = v.before_value;
