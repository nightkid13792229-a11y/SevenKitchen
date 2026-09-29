-- 阶段 B：体重管理计划（增减重可执行方案）
--
-- 老板原话：不只是给用户一个记录体重的工具，而是真真正正能指导用户
-- **通过饮食增减重的可执行方案**。
--
-- 两张表：
--   weight_goal_plan             计划主表
--   weight_goal_plan_adjustment  调整历史（每次自动/手动调整记一条）
--
-- 与能量算法的关系：计划生效期间，该狗的每日能量目标改用 plan.current_kcal，
-- 而不是算法默认输出；计划结束/取消后立即恢复默认维持量。
--
-- 只新增表与枚举，不改动既有数据，可安全重跑。

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WeightGoalDirection') THEN
        CREATE TYPE "WeightGoalDirection" AS ENUM ('LOSS', 'GAIN');
    END IF;

    -- 状态机：
    --   ACTIVE ──达标──→ MAINTENANCE ──满 3 个月──→ COMPLETED
    --      │                  ↑
    --      ├─连续 8 周未称重─→ PAUSED（提醒后可恢复）
    --      ├─计划期间怀孕 ───→ PAUSED（阶段 A 联动）
    --      └─顾客中途放弃 ───→ CANCELLED（可重新新建）
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WeightGoalPlanStatus') THEN
        CREATE TYPE "WeightGoalPlanStatus" AS ENUM (
            'ACTIVE', 'PAUSED', 'MAINTENANCE', 'COMPLETED', 'CANCELLED'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WeightGoalAdjustmentReason') THEN
        CREATE TYPE "WeightGoalAdjustmentReason" AS ENUM (
            'RATE_TOO_SLOW',        -- 减重慢于 0.5%/周 → 下调 10-20%
            'RATE_TOO_FAST',        -- 快于 2%/周（会掉肌肉）→ 上调约 10%
            'MANUAL',               -- 顾客手动改目标体重 / 力度
            'GOAL_REACHED',         -- 达标转维持期（热量上浮 10%）
            'MAINTENANCE_UNDERSHOOT', -- 维持期仍继续掉重 → 再加 10%
            'FLOOR_REACHED'         -- 撞到安全下限，不再下调
        );
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "weight_goal_plan" (
    "id"                            TEXT NOT NULL,
    "dog_id"                        TEXT NOT NULL,
    "direction"                     "WeightGoalDirection" NOT NULL,
    "status"                        "WeightGoalPlanStatus" NOT NULL,
    "start_weight_kg"               DOUBLE PRECISION NOT NULL,
    "start_bcs_score"               INTEGER NOT NULL,
    "target_weight_kg"              DOUBLE PRECISION NOT NULL,
    "suggested_target_weight_kg"    DOUBLE PRECISION NOT NULL,
    "current_kcal"                  INTEGER NOT NULL,
    "floor_kcal"                    INTEGER NOT NULL,
    "ceiling_kcal"                  INTEGER NOT NULL,
    "target_rate_percent_per_week"  DOUBLE PRECISION NOT NULL,
    "start_date"                    TIMESTAMP(3) NOT NULL,
    "estimated_goal_date"           TIMESTAMP(3),
    "next_review_date"              TIMESTAMP(3),
    "last_weigh_in_date"            TIMESTAMP(3),
    "last_rate_percent_per_week"    DOUBLE PRECISION,
    "paused_at"                     TIMESTAMP(3),
    "paused_reason"                 TEXT,
    "maintenance_started_at"        TIMESTAMP(3),
    "completed_at"                  TIMESTAMP(3),
    "cancelled_at"                  TIMESTAMP(3),
    "created_at"                    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"                    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "weight_goal_plan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "weight_goal_plan_adjustment" (
    "id"                    TEXT NOT NULL,
    "plan_id"               TEXT NOT NULL,
    "reason"                "WeightGoalAdjustmentReason" NOT NULL,
    "energy_before"         INTEGER NOT NULL,
    "energy_after"          INTEGER NOT NULL,
    "rate_percent_per_week" DOUBLE PRECISION,
    "weight_kg"             DOUBLE PRECISION,
    "note"                  TEXT,
    "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "weight_goal_plan_adjustment_pkey" PRIMARY KEY ("id")
);

-- 一只狗同时只能有一个「未结束」的计划。
--
-- 用**部分唯一索引**而不是普通唯一索引：COMPLETED / CANCELLED 是终态，
-- 一只狗结束一个计划后必须能再新建，所以只约束三种进行中的状态。
-- Prisma schema 表达不了 WHERE 条件，只能写在这里。
CREATE UNIQUE INDEX IF NOT EXISTS "weight_goal_plan_one_open_per_dog"
    ON "weight_goal_plan" ("dog_id")
    WHERE "status" IN ('ACTIVE', 'PAUSED', 'MAINTENANCE');

CREATE INDEX IF NOT EXISTS "weight_goal_plan_dog_id_status_idx"
    ON "weight_goal_plan" ("dog_id", "status");

-- 提醒调度（每 2 周称重提醒、维持期复查）按这个索引扫
CREATE INDEX IF NOT EXISTS "weight_goal_plan_status_next_review_date_idx"
    ON "weight_goal_plan" ("status", "next_review_date");

CREATE INDEX IF NOT EXISTS "weight_goal_plan_adjustment_plan_id_created_at_idx"
    ON "weight_goal_plan_adjustment" ("plan_id", "created_at");

DO $$
BEGIN
    -- 计划随档案一起结束（老板定的边界情况：狗去世 / 档案删除 → 计划一并结束）
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'weight_goal_plan_dog_id_fkey'
    ) THEN
        ALTER TABLE "weight_goal_plan"
            ADD CONSTRAINT "weight_goal_plan_dog_id_fkey"
            FOREIGN KEY ("dog_id") REFERENCES "dog"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'weight_goal_plan_adjustment_plan_id_fkey'
    ) THEN
        ALTER TABLE "weight_goal_plan_adjustment"
            ADD CONSTRAINT "weight_goal_plan_adjustment_plan_id_fkey"
            FOREIGN KEY ("plan_id") REFERENCES "weight_goal_plan"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$$;
