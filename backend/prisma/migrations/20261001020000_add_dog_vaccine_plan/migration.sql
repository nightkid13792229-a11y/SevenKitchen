-- 疫苗计划：顾客对建议程序做出的决定（2026-10-01，第四期）。
--
-- ── 为什么只存"决定"，不存"建议" ────────────────────────────
--
--   建议（这只狗第几周该打哪一针）是**从出生日期算出来的**。
--   把算出来的结果也存一份，就会有"出生日期改了、程序没跟着改"的风险；
--   而且免疫程序本身以后会随指南更新，存历史计算结果只会越积越乱。
--
--   所以要存的只有一件事：**顾客怎么决定的**。
--     ACCEPT 按建议打 / DEFER 推迟 / SKIP 决定不做
--
--   键是程序里那一步的稳定标识，如 "core-puppy-1"、"rabies-2"。
--
-- ── 与 vaccine_record 的分工 ────────────────────────────────
--   vaccine_record  记的是"真的打了什么"（事实）
--   dog_vaccine_plan 记的是"打算怎么打"（意图）
--   两者不一致，就是老板第 17 条要提醒的"顾客计划与我们不一致"。

CREATE TABLE "dog_vaccine_plan" (
  "id"         TEXT         NOT NULL,
  "dog_id"     TEXT         NOT NULL,
  "decisions"  JSONB        NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "dog_vaccine_plan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dog_vaccine_plan_dog_id_key" ON "dog_vaccine_plan"("dog_id");
CREATE INDEX "dog_vaccine_plan_dog_id_idx" ON "dog_vaccine_plan"("dog_id");

ALTER TABLE "dog_vaccine_plan"
  ADD CONSTRAINT "dog_vaccine_plan_dog_id_fkey"
  FOREIGN KEY ("dog_id") REFERENCES "dog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMENT ON COLUMN "dog_vaccine_plan"."decisions" IS
  '顾客对免疫程序每一步的决定：ACCEPT 按建议 / DEFER 推迟 / SKIP 不做；键为程序步骤标识';
