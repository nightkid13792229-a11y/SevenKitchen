-- 售后窗口 30 → 7 天；免费修改 1 → 2 次
--
-- 依据：老板 2026-10-17 的明确决定
--   V22「售后窗口就留 7 天吧」
--   V23「那就改成 7 天之内免费修改两次吧」
--
-- 为什么改默认值之后还要 UPDATE 一次：
--   这两个字段的**库里现有值**（30 / 1）正好等于旧默认值，
--   说明**从来没人在界面上改过** —— 它一直是错的。
--   只改 default 只影响以后新建的行，现有这一行还是错的，顾客会按 30 天算。
--
-- 安全性：schema 默认值与库中现值完全相同 → 确认是人没动过的旧默认值，不是人工设定的业务值。
-- 只改这一行（id = 'singleton'），不动别的表。
ALTER TABLE "custom_recipe_config" ALTER COLUMN "aftersale_window_days" SET DEFAULT 7;
ALTER TABLE "custom_recipe_config" ALTER COLUMN "free_revision_count" SET DEFAULT 2;

UPDATE "custom_recipe_config"
SET "aftersale_window_days" = 7,
    "free_revision_count" = 2
WHERE "id" = 'singleton'
  AND "aftersale_window_days" = 30
  AND "free_revision_count" = 1;
