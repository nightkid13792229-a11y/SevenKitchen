-- 阶段 A：妊娠 / 哺乳的信息录入（2026-09-29）
--
-- 背景：原来只有 life_stage_override 一个枚举，顾客无法把狗切到怀孕/哺乳，
-- 也没有任何日期字段，导致算法只能对孕期给全程平铺的定值（旧值 3.0），
-- 而 FEDIAF 表 VII-8b 是按孕周分段、哺乳按窝仔数与产后周数分段的。
--
-- 新增四列，全部可空，不影响存量数据：
--   mating_date       配种日
--   expected_due_date 预产期（兽医 B 超值，优先于配种日推算）
--   delivery_date     分娩日（哺乳期分期的唯一依据）
--   litter_size       窝仔数（哺乳期系数随窝仔数变化）

ALTER TABLE "dog" ADD COLUMN "mating_date" TIMESTAMP(3);
ALTER TABLE "dog" ADD COLUMN "expected_due_date" TIMESTAMP(3);
ALTER TABLE "dog" ADD COLUMN "delivery_date" TIMESTAMP(3);
ALTER TABLE "dog" ADD COLUMN "litter_size" INTEGER;
