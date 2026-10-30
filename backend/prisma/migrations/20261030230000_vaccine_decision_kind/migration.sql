-- 2026-10-30 · 四块地基 #2：决定从“步骤”改挂“类别”
--
-- 旧：一条决定挂在一个 stepKey 上（会随记录变化而漂移）。
-- 新：一条决定挂在一个类别上（core / core_early / rabies / lepto），
--     “这次先不打”带 30 天到期日，“不再接种”长期有效。
--
-- 生产库当前 0 条决定（2026-10-30 只读预检），所以这次迁移在生产是空操作；
-- 下面仍保留完整的回填/去重逻辑，供其它环境与演练使用。

ALTER TABLE "vaccine_decision" ADD COLUMN "kind" TEXT;
ALTER TABLE "vaccine_decision" ADD COLUMN "snooze_until" DATE;

-- 旧 stepKey → 类别（core_early 必须先判，否则会被 core 前缀吃掉）
UPDATE "vaccine_decision"
SET "kind" = CASE
  WHEN "step_key" LIKE 'core_early%' THEN 'core_early'
  WHEN "step_key" LIKE 'core%' THEN 'core'
  WHEN "step_key" LIKE 'rabies%' THEN 'rabies'
  WHEN "step_key" LIKE 'lepto%' THEN 'lepto'
  ELSE NULL
END;

-- 旧 NOT_NOW：从“当时决定的时间”算 30 天（不是从今天算）
UPDATE "vaccine_decision"
SET "snooze_until" = ("updated_at" + INTERVAL '30 days')::date
WHERE "reason" = 'NOT_NOW';

-- 旧 SKIP 但没填原因：按“这次先不打”处理，避免它变成永久静默
UPDATE "vaccine_decision"
SET "reason" = 'NOT_NOW',
    "snooze_until" = ("updated_at" + INTERVAL '30 days')::date
WHERE "decision" = 'SKIP' AND "reason" IS NULL;

-- 认不出类别的旧决定：清掉（不硬套到别的针）
DELETE FROM "vaccine_decision" WHERE "kind" IS NULL;

-- 同一只狗、同一类别只留最新一条（旧模型可能有多条 stepKey）
DELETE FROM "vaccine_decision" a
USING "vaccine_decision" b
WHERE a."dog_id" = b."dog_id"
  AND a."kind" = b."kind"
  AND (
    a."updated_at" < b."updated_at"
    OR (a."updated_at" = b."updated_at" AND a."id" < b."id")
  );

ALTER TABLE "vaccine_decision" ALTER COLUMN "kind" SET NOT NULL;
ALTER TABLE "vaccine_decision" ALTER COLUMN "step_key" DROP NOT NULL;

-- 旧唯一键（dog_id, step_key）不再需要；换成（dog_id, kind）
DROP INDEX IF EXISTS "vaccine_decision_dog_id_step_key_key";
CREATE UNIQUE INDEX "vaccine_decision_dog_id_kind_key"
  ON "vaccine_decision"("dog_id", "kind");
