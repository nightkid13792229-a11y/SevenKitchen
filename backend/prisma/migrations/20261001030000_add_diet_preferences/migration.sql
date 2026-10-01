-- 饮食偏好结构化 + 变更历史（2026-10-01，第五期）
-- 以及给体检记录补备注字段。
--
-- ── 一、为什么要结构化 ──────────────────────────────────────
--
--   原先只有 dog.preferred_foods / dog.picky_foods 两个自由文本框：
--     · 答不了老板第 9 条要的"什么时候从爱吃鸡肉变成不吃鸡肉"
--     · 也没法按食材做推荐与配方匹配
--
-- ── 二、旧字段一个字符都不动（保守做法）────────────────────
--
--   这两个新表是**增量**的：
--     · dog.preferred_foods / dog.picky_foods 原样保留，配方设计继续合并使用
--     · 新界面展示结构化条目；旧文本还在、结构化表为空时，
--       由系统给出候选、**顾客确认后**才写入
--   不做自动分词迁移：把"鸡胸肉、南瓜"自动拆成两条，看着省事，
--   但一旦拆错（"鸡胸肉南瓜"到底是一种还是两种），顾客原来的话就被改坏了。
--
-- ── 三、变更历史从功能上线那天开始 ──────────────────────────
--
--   第五期之前没有"变更"这个概念，所以历史是空的。界面上要如实说明
--   "历史从 XX 开始记录"，而不是让顾客以为自己的记录丢了。

-- 体检记录补备注：合并表单里"就诊能写备注、体检不能"说不通
ALTER TABLE "checkup_record" ADD COLUMN "notes" TEXT;

COMMENT ON COLUMN "checkup_record"."notes" IS
  '备注；2026-10-01 第五期新增。此前只有病史表有 notes，合并成「病例」表单后不一致。';

CREATE TYPE "DietPreferenceKind" AS ENUM ('LIKED', 'DISLIKED');
CREATE TYPE "DietPreferenceAction" AS ENUM ('ADDED', 'REMOVED');

CREATE TABLE "dog_diet_preference" (
  "id"         TEXT                NOT NULL,
  "dog_id"     TEXT                NOT NULL,
  "kind"       "DietPreferenceKind" NOT NULL,
  "food_name"  VARCHAR(60)         NOT NULL,
  "source"     VARCHAR(16)         NOT NULL DEFAULT 'MANUAL',
  "created_at" TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3)        NOT NULL,

  CONSTRAINT "dog_diet_preference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dog_diet_preference_dog_id_kind_food_name_key"
  ON "dog_diet_preference"("dog_id", "kind", "food_name");
CREATE INDEX "dog_diet_preference_dog_id_idx" ON "dog_diet_preference"("dog_id");

ALTER TABLE "dog_diet_preference"
  ADD CONSTRAINT "dog_diet_preference_dog_id_fkey"
  FOREIGN KEY ("dog_id") REFERENCES "dog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "dog_diet_preference_change" (
  "id"         TEXT                   NOT NULL,
  "dog_id"     TEXT                   NOT NULL,
  "kind"       "DietPreferenceKind"   NOT NULL,
  "food_name"  VARCHAR(60)            NOT NULL,
  "action"     "DietPreferenceAction" NOT NULL,
  "changed_by" VARCHAR(24)            NOT NULL,
  "changed_at" TIMESTAMP(3)           NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "dog_diet_preference_change_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dog_diet_preference_change_dog_id_changed_at_idx"
  ON "dog_diet_preference_change"("dog_id", "changed_at");

ALTER TABLE "dog_diet_preference_change"
  ADD CONSTRAINT "dog_diet_preference_change_dog_id_fkey"
  FOREIGN KEY ("dog_id") REFERENCES "dog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMENT ON TABLE "dog_diet_preference" IS
  '结构化饮食偏好（爱吃/不吃）。与 dog.preferred_foods / dog.picky_foods 并存，旧字段不动。';
COMMENT ON TABLE "dog_diet_preference_change" IS
  '饮食偏好变更历史，只记"加了什么/去掉了什么"；当前状态在 dog_diet_preference 里。';
