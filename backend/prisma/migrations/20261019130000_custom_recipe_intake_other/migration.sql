-- 饲喂历史：其它选项 + 自制文案（2026-10-19）
--
-- 顾客反馈：
--   · 干粮/湿粮等之外还有不常见的喂法，需要「其他」+ 手填
--   · 肠胃也需要「其他」+ 手填
--   · 「自制」应写成「自制/商业鲜食」
--
-- 选项是 DATA 类型，生产上已有数据，部署时的 seed 不会覆盖已有行；
-- 所以这里用一次性 data migration 更新文案并补 OTHER（已有则只更新文案）。
ALTER TABLE "custom_recipe_order"
  ADD COLUMN "current_food_other" VARCHAR(120),
  ADD COLUMN "stomach_other" VARCHAR(120);

UPDATE "platform_option_item"
SET "label" = '自制/商业鲜食',
    "updated_at" = now()
WHERE "set_id" = 'custom_recipe_current_food'
  AND "code" = 'HOMEMADE';

UPDATE "platform_option_set"
SET "name" = '定制原因',
    "updated_at" = now()
WHERE "code" = 'custom_recipe_change_reason';

INSERT INTO "platform_option_item"
  ("id", "set_id", "code", "label", "tone", "sort_order", "enabled", "is_default", "created_at", "updated_at")
SELECT gen_random_uuid()::text, 'custom_recipe_current_food', 'OTHER', '其他', 'info', 60, true, false, now(), now()
WHERE EXISTS (
  SELECT 1 FROM "platform_option_set" WHERE "code" = 'custom_recipe_current_food'
)
ON CONFLICT ("set_id", "code") DO UPDATE
SET "label" = EXCLUDED."label",
    "enabled" = true,
    "sort_order" = EXCLUDED."sort_order",
    "updated_at" = now();

INSERT INTO "platform_option_item"
  ("id", "set_id", "code", "label", "tone", "sort_order", "enabled", "is_default", "created_at", "updated_at")
SELECT gen_random_uuid()::text, 'custom_recipe_stomach', 'OTHER', '其他', 'info', 60, true, false, now(), now()
WHERE EXISTS (
  SELECT 1 FROM "platform_option_set" WHERE "code" = 'custom_recipe_stomach'
)
ON CONFLICT ("set_id", "code") DO UPDATE
SET "label" = EXCLUDED."label",
    "enabled" = true,
    "sort_order" = EXCLUDED."sort_order",
    "updated_at" = now();
