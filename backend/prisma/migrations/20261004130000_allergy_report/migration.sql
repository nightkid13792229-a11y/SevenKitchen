-- 过敏检测报告实体化（2026-10-04，过敏重构第二期）
--
-- ── 一、为什么需要"报告"这一层 ──────────────────────────────
--
--   老板第 1 条要求：「可以记录自己狗狗的过敏检查报告，
--   特别是报告中**有哪些需要注意的、可疑的**过敏原食物」。
--
--   改造前系统里没有"报告"这个概念，只有 allergy_record 一行行散装的过敏原：
--     · 一份写了 12 项结果的报告存进来 = 12 条互不相干的记录
--     · 记录里**没有检测日期**，健康时间线只能拿"录入时间"冒充检测时间
--       （一份 2023 年的报告今天录进去，会显示成"今天"）
--     · 看不出"哪一份报告说了什么、用的什么方法"
--     · **顾客上传的报告原件传完就丢**：识别完 attachments 填空数组，
--       云端文件标识被丢弃 —— 顾客再也看不到自己传的报告
--
--   这一期给"报告"建实体，把原件留住，并让每条过敏原能追溯到它的来源。
--
-- ── 二、只增不删 ────────────────────────────────────────────
--
--   allergy_record 现有的 allergen / notes / certainty / source /
--   attachments / createdAt 一个都不动，老记录一条都不迁移。
--   report_id 允许为空：顾客自己怀疑的、"我记一下"的，本来就没有报告。
--
-- ── 三、检测方式为什么照抄而不是判断 ────────────────────────
--
--   知识库 skin-003 明确：皮试、血清 IgE/RAST/ELISA 对食物不良反应
--   **既不适用于筛查、也不能确诊**，只有排除性饮食试验能确诊。
--   但"这份报告是什么方法"是**报告上写的事实**，照抄即可；
--   系统不做任何"这个结果可不可信"的判断 —— 那是兽医的事。
--   界面会如实标注方法并引导，但不会替顾客否定他手里的报告。

CREATE TYPE "AllergyTestMethod" AS ENUM (
  'SERUM',        -- 血清 / IgE 检测
  'INTRADERMAL',  -- 皮内试验
  'ELIMINATION',  -- 排除性饮食试验
  'OTHER',        -- 其它
  'UNKNOWN'       -- 报告上没写 / 看不清
);

CREATE TABLE IF NOT EXISTS "allergy_report" (
  "id"          TEXT               NOT NULL,
  "dog_id"      TEXT               NOT NULL,
  "test_date"   DATE,
  "test_method" "AllergyTestMethod" NOT NULL DEFAULT 'UNKNOWN',
  "institution" VARCHAR(120),
  "summary"     TEXT,
  "attachments" TEXT[]             NOT NULL DEFAULT ARRAY[]::TEXT[],
  "ocr_text"    TEXT,
  "created_at"  TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3)       NOT NULL,

  CONSTRAINT "allergy_report_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "allergy_report_dog_id_test_date_idx"
  ON "allergy_report"("dog_id", "test_date");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'allergy_report_dog_id_fkey'
  ) THEN
    ALTER TABLE "allergy_report"
      ADD CONSTRAINT "allergy_report_dog_id_fkey"
      FOREIGN KEY ("dog_id") REFERENCES "dog"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

COMMENT ON TABLE "allergy_report" IS
  '过敏检测报告（2026-10-04 第二期）。一份报告 = 检测日期 + 方式 + 机构 + 原件 + '
  '该报告得出的多条过敏原结论（allergy_record.report_id 指回来）。';
COMMENT ON COLUMN "allergy_report"."test_date" IS
  '检测日期。此前过敏记录没有日期，健康时间线只能用"录入时间"冒充检测时间。';
COMMENT ON COLUMN "allergy_report"."test_method" IS
  '检测方式，照抄报告上写的。知识库 skin-003：皮试/血清 IgE 对食物不良反应'
  '既不适用于筛查也不能确诊；系统只如实标注，不做可信度判断。';
COMMENT ON COLUMN "allergy_report"."attachments" IS
  '报告原件（照片 / PDF）。2026-10-04 之前顾客上传的识别用图片'
  '**传完就丢**，这里把它留住，顾客随时能翻出来给医生看。';
COMMENT ON COLUMN "allergy_report"."ocr_text" IS
  '识别出的原文，便于客服核对识别是否可靠。';

-- 过敏记录加两个字段：追溯来源报告 + 主人观察到的时间
ALTER TABLE "allergy_record"
  ADD COLUMN IF NOT EXISTS "report_id" TEXT;

ALTER TABLE "allergy_record"
  ADD COLUMN IF NOT EXISTS "observed_at" DATE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'allergy_record_report_id_fkey'
  ) THEN
    ALTER TABLE "allergy_record"
      ADD CONSTRAINT "allergy_record_report_id_fkey"
      FOREIGN KEY ("report_id") REFERENCES "allergy_report"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "allergy_record_report_id_idx"
  ON "allergy_record"("report_id");

COMMENT ON COLUMN "allergy_record"."report_id" IS
  '来自哪份检测报告（2026-10-04 第二期）。为空表示没有报告依据'
  '（顾客自己怀疑 / 员工录入 / 排查计划结论）。';
COMMENT ON COLUMN "allergy_record"."observed_at" IS
  '主人观察到异常的时间（2026-10-04 第二期）。与检测报告的 test_date 不同：'
  '这是"我什么时候发现它吃了这个会挠"的记录。';

SELECT 1;
