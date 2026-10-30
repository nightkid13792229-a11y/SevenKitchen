-- 2026-10-30 · #2 兼容层：旧代码写 vaccine_decision 时不会带 kind。
--
-- 新代码总是显式写 kind；但部署切换/回滚窗口里，旧代码按 step_key upsert，
-- 只写 dog_id / step_key / decision / reason。这里用 BEFORE 触发器从 step_key
-- 自动补 kind，保证旧写入不会撞上 kind NOT NULL。
CREATE OR REPLACE FUNCTION "vaccine_decision_fill_kind"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."kind" IS NULL THEN
    NEW."kind" := CASE
      WHEN NEW."step_key" LIKE 'core_early%' THEN 'core_early'
      WHEN NEW."step_key" LIKE 'core%' THEN 'core'
      WHEN NEW."step_key" LIKE 'rabies%' THEN 'rabies'
      WHEN NEW."step_key" LIKE 'lepto%' THEN 'lepto'
      ELSE NULL
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "vaccine_decision_fill_kind_trigger" ON "vaccine_decision";
CREATE TRIGGER "vaccine_decision_fill_kind_trigger"
BEFORE INSERT OR UPDATE ON "vaccine_decision"
FOR EACH ROW EXECUTE FUNCTION "vaccine_decision_fill_kind"();
