-- 2026-10-30 · #2 兼容层：保留旧的 (dog_id, step_key) 唯一键。
--
-- 新代码按 (dog_id, kind) 记决定；但部署切换/回滚期间，旧代码仍可能
-- 按 step_key upsert。两条唯一键可以并存（每个 stepKey 只属于一个类别），
-- 这样旧接口不会在切换窗口里报错。
--
-- 新代码每条决定都会写入当前的 step_key，所以这里可以恢复 NOT NULL。
ALTER TABLE "vaccine_decision" ALTER COLUMN "step_key" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "vaccine_decision_dog_id_step_key_key"
  ON "vaccine_decision"("dog_id", "step_key");
