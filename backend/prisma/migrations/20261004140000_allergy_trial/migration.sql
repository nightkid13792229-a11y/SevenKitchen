-- 过敏原排查计划：排除性饮食试验（2026-10-04，过敏重构第三期）
--
-- ── 一、这是什么 ────────────────────────────────────────────
--
--   老板第 2 条要求："对于很多需要做过敏排查的用户来说，
--   可以创建过敏原的排查计划。"
--
--   而"排除性饮食试验"是国内外指南**唯一认可**的食物过敏确诊路径
--   （知识库 skin-003；ACVIM 2026 慢性肠病共识明确建议用它、
--    而不是血清过敏原检测）。
--
-- ── 二、产品定位：帮你执行，不替兽医开方案 ──────────────────
--
--   skin-003 / skin-004 都写明"必须由兽医设计并监督"。
--   所以这些表只承载三件事：
--     · 计划本身（排查目标 / 方向 / 起止 / 建议时长）
--     · 每日打卡（痒不痒 / 大便怎么样 / 有没有破戒）
--     · 再挑战与结论（把结果整理成能给兽医看的东西）
--   **不存用药建议、不存系统给出的诊断。**
--
-- ── 三、结论怎么回到过敏记录上 ──────────────────────────────
--
--   再挑战的结论（确诊过敏 / 不过敏 / 仍不确定）会回写
--   allergy_record.certainty，于是"排查完"这件事
--   立刻反映到推荐与配方上 —— 这正是"填了要有回报"。
--   本迁移不自动回写任何历史数据。

CREATE TYPE "AllergyTrialStatus" AS ENUM (
  'DRAFT',        -- 准备中：还没开始排除期
  'ELIMINATION',  -- 排除期：严格忌口
  'CHALLENGE',    -- 再挑战期：单独加回某一种观察
  'COMPLETED',    -- 已结束
  'ABANDONED'     -- 中途放弃（如实记录，不假装没发生过）
);

CREATE TYPE "AllergyTrialDirection" AS ENUM (
  'SKIN',     -- 以皮肤表现为主
  'GI',       -- 以胃肠道表现为主
  'BOTH',     -- 两者都有
  'OTITIS'    -- 反复耳道发炎
);

CREATE TYPE "AllergyChallengeOutcome" AS ENUM (
  'PENDING',      -- 观察中
  'REACTED',      -- 复发了 → 确诊过敏
  'NO_REACTION',  -- 没反应 → 排除
  'UNCERTAIN'     -- 还是不确定
);

CREATE TABLE IF NOT EXISTS "allergy_trial" (
  "id"                TEXT                    NOT NULL,
  "dog_id"            TEXT                    NOT NULL,
  "status"            "AllergyTrialStatus"    NOT NULL DEFAULT 'DRAFT',
  "direction"         "AllergyTrialDirection" NOT NULL DEFAULT 'SKIN',
  -- 这次要排查的过敏原（一般是 1~3 个"怀疑对象"）
  "focus_allergens"   TEXT[]                  NOT NULL DEFAULT ARRAY[]::TEXT[],
  "start_date"        DATE,
  "planned_end_date"  DATE,
  -- 建议时长（天）。按方向算出来，但允许兽医/顾客调整
  "planned_days"      INTEGER                 NOT NULL DEFAULT 42,
  -- 排除期在喂什么（自由记录：可以是自家某个食谱，也可以是处方粮）
  "current_food_note" TEXT,
  -- 必守清单的勾选状态：{ noTreats: true, ... }
  "strict_rules"      JSONB                   NOT NULL DEFAULT '{}'::jsonb,
  "notes"             TEXT,
  "concluded_at"      TIMESTAMP(3),
  "created_at"        TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"        TIMESTAMP(3)            NOT NULL,

  CONSTRAINT "allergy_trial_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "allergy_trial_dog_id_created_at_idx"
  ON "allergy_trial"("dog_id", "created_at" DESC);
-- 一只狗同时只应有一个进行中的计划；用部分唯一索引兜住
CREATE UNIQUE INDEX IF NOT EXISTS "allergy_trial_one_active_per_dog_key"
  ON "allergy_trial"("dog_id")
  WHERE "status" IN ('DRAFT', 'ELIMINATION', 'CHALLENGE');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'allergy_trial_dog_id_fkey'
  ) THEN
    ALTER TABLE "allergy_trial"
      ADD CONSTRAINT "allergy_trial_dog_id_fkey"
      FOREIGN KEY ("dog_id") REFERENCES "dog"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

COMMENT ON TABLE "allergy_trial" IS
  '过敏原排查计划（2026-10-04 第三期）。承载"排除性饮食试验"的执行过程：'
  '排查目标 / 表现方向 / 起止日期 / 必守清单 / 当前在喂什么。'
  '方案本身必须由兽医设计，系统只帮执行与记录。';
COMMENT ON COLUMN "allergy_trial"."direction" IS
  '表现方向，决定建议排除期长度：皮肤 6～12 周、肠胃 2～4 周、'
  '慢性外耳炎可能 4～6 个月（小动物临床营养学第 5 版 第 31 章）。';
COMMENT ON COLUMN "allergy_trial"."strict_rules" IS
  '排除期必守清单的勾选状态。清单内容来自 skin-004：零食、调味补充剂、'
  '可咀嚼药物、脂肪酸补充剂、咬嚼玩具都要停，多宠家庭要确认吃不到别人的粮。';

-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "allergy_trial_log" (
  "id"          TEXT         NOT NULL,
  "trial_id"    TEXT         NOT NULL,
  "log_date"    DATE         NOT NULL,
  -- 0 = 最好，数字越大问题越明显；null = 当天没记这一项
  "itch_score"  INTEGER,
  "stool_score" INTEGER,
  -- 今天有没有破戒（偷吃 / 有人喂了别的）
  "broke_strict" BOOLEAN     NOT NULL DEFAULT false,
  "note"        TEXT,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL,

  CONSTRAINT "allergy_trial_log_pkey" PRIMARY KEY ("id")
);

-- 一天一条：重复打卡按更新处理，而不是堆成两条互相打架的记录
CREATE UNIQUE INDEX IF NOT EXISTS "allergy_trial_log_trial_id_log_date_key"
  ON "allergy_trial_log"("trial_id", "log_date");
CREATE INDEX IF NOT EXISTS "allergy_trial_log_trial_id_log_date_idx"
  ON "allergy_trial_log"("trial_id", "log_date");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'allergy_trial_log_trial_id_fkey'
  ) THEN
    ALTER TABLE "allergy_trial_log"
      ADD CONSTRAINT "allergy_trial_log_trial_id_fkey"
      FOREIGN KEY ("trial_id") REFERENCES "allergy_trial"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'allergy_trial_log_itch_range'
  ) THEN
    ALTER TABLE "allergy_trial_log"
      ADD CONSTRAINT "allergy_trial_log_itch_range"
      CHECK ("itch_score" IS NULL OR ("itch_score" >= 0 AND "itch_score" <= 3));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'allergy_trial_log_stool_range'
  ) THEN
    ALTER TABLE "allergy_trial_log"
      ADD CONSTRAINT "allergy_trial_log_stool_range"
      CHECK ("stool_score" IS NULL OR ("stool_score" >= 0 AND "stool_score" <= 3));
  END IF;
END $$;

COMMENT ON TABLE "allergy_trial_log" IS
  '排查计划的每日打卡（2026-10-04 第三期）。指南建议连续数周记饮食日记 —— '
  '日记常能发现与复诊时陈述不同的情况（skin-004）。';
COMMENT ON COLUMN "allergy_trial_log"."broke_strict" IS
  '今天有没有破戒。破戒会直接影响结论可信度：排除期没守住，'
  '"没好转"就不能说明这种食物没问题。';

-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "allergy_trial_challenge" (
  "id"            TEXT                       NOT NULL,
  "trial_id"      TEXT                       NOT NULL,
  "allergen"      TEXT                       NOT NULL,
  "started_at"    DATE,
  "ended_at"      DATE,
  "outcome"       "AllergyChallengeOutcome"  NOT NULL DEFAULT 'PENDING',
  -- 复发时记下时间与表现，方便给兽医看
  "reaction_note" TEXT,
  "created_at"    TIMESTAMP(3)               NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3)               NOT NULL,

  CONSTRAINT "allergy_trial_challenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "allergy_trial_challenge_trial_id_allergen_key"
  ON "allergy_trial_challenge"("trial_id", "allergen");
CREATE INDEX IF NOT EXISTS "allergy_trial_challenge_trial_id_idx"
  ON "allergy_trial_challenge"("trial_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'allergy_trial_challenge_trial_id_fkey'
  ) THEN
    ALTER TABLE "allergy_trial_challenge"
      ADD CONSTRAINT "allergy_trial_challenge_trial_id_fkey"
      FOREIGN KEY ("trial_id") REFERENCES "allergy_trial"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

COMMENT ON TABLE "allergy_trial_challenge" IS
  '再挑战（激发试验，2026-10-04 第三期）。指南：不做再挑战会导致'
  '食物敏感性被明显过度诊断 —— 所以它是结论的必要一步，不是可选项。';
COMMENT ON COLUMN "allergy_trial_challenge"."outcome" IS
  'REACTED → 该过敏原标为确诊；NO_REACTION → 标为已排除（不再避开）；'
  'UNCERTAIN → 保持待排查。结论由顾客/兽医给，系统只负责回写。';

SELECT 1;
