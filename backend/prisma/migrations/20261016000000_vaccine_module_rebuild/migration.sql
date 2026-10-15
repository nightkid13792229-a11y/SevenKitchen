-- 疫苗板块重构（2026-10-15）：数据模型重做
--
-- 前提：疫苗板块**尚未在正式版上线**，库里现有的疫苗数据都是测试数据。
--      改动前已用 backend/scripts/export-vaccine-data.js 导出存档。
--
-- 本次共四处 DDL：
--   ① 新增 vaccine_decision（替代 dog_vaccine_plan.decisions 那个 JSON blob）
--   ② 新增 antibody_test_record（抗体检测）
--   ③ vaccine_record 删两列：next_due_date（整个不用）、status（恒为已完成，是残留）
--   ④ 删表 dog_vaccine_plan、删枚举 VaccineStatus

-- ① 决定表（先建表，再把旧 JSON 搬进来，最后才删旧表）
CREATE TABLE "vaccine_decision" (
    "id" TEXT NOT NULL,
    "dog_id" TEXT NOT NULL,
    "step_key" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "vaccine_decision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vaccine_decision_dog_id_step_key_key" ON "vaccine_decision"("dog_id", "step_key");
CREATE INDEX "vaccine_decision_dog_id_idx" ON "vaccine_decision"("dog_id");

ALTER TABLE "vaccine_decision"
    ADD CONSTRAINT "vaccine_decision_dog_id_fkey"
    FOREIGN KEY ("dog_id") REFERENCES "dog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 搬迁旧决定：{ "core-puppy-1": "ACCEPT" } → 一行一条
INSERT INTO "vaccine_decision" ("id", "dog_id", "step_key", "decision", "reason", "created_at", "updated_at")
SELECT gen_random_uuid()::text, d."dog_id", kv.key, kv.value, NULL, now(), now()
FROM "dog_vaccine_plan" d
CROSS JOIN LATERAL jsonb_each_text(d."decisions") AS kv(key, value)
WHERE kv.value IN ('ACCEPT', 'DEFER', 'SKIP');

-- ② 抗体检测表
CREATE TYPE "AntibodyTestResult" AS ENUM ('PASS', 'FAIL', 'UNKNOWN');

CREATE TABLE "antibody_test_record" (
    "id" TEXT NOT NULL,
    "dog_id" TEXT NOT NULL,
    "tested_at" DATE NOT NULL,
    "targets" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "result" "AntibodyTestResult" NOT NULL DEFAULT 'UNKNOWN',
    "value" TEXT,
    "unit" TEXT,
    "next_review_at" DATE,
    "notes" TEXT,
    "attachments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "antibody_test_record_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "antibody_test_record_dog_id_idx" ON "antibody_test_record"("dog_id");
CREATE INDEX "antibody_test_record_dog_id_tested_at_idx" ON "antibody_test_record"("dog_id", "tested_at");

ALTER TABLE "antibody_test_record"
    ADD CONSTRAINT "antibody_test_record_dog_id_fkey"
    FOREIGN KEY ("dog_id") REFERENCES "dog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ③ vaccine_record 删两列（列上的索引随列一起消失）
ALTER TABLE "vaccine_record" DROP COLUMN IF EXISTS "next_due_date";
ALTER TABLE "vaccine_record" DROP COLUMN IF EXISTS "status";

-- ④ 删旧表与旧枚举
DROP TABLE IF EXISTS "dog_vaccine_plan";
DROP TYPE IF EXISTS "VaccineStatus";
