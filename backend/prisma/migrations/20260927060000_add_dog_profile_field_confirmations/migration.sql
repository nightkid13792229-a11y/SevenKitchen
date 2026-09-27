-- 「顾客是否亲自确认过体况评分 / 活动量 / 每日餐数」
--
-- 背景（2026-09-27，老板决定 U3/U4）：
--   建档表单给这三项预填了默认值并渲染成"已选中"，顾客一路点下一步也会提交。
--   于是数据库里它们**永远有值**，却分不清"顾客真的选过"还是"系统替他选的"
--   —— 生产里 4544 只狗中有 3466 只（76%）体况评分等于默认值 5。
--   老板定的定制门槛若只看"有没有值"，就永远拦不住任何人。
--
-- 现在把「值」与「是否被确认」分开记录。门槛改判"是否确认过"。
--
-- 老档案**不回填**（老板决定「不追溯」）：
--   这三列保持 NULL = 未确认，符合"老数据不代表顾客选过"的事实。
--   老顾客日常不受打扰，只在进入定制页（此刻数据必须准确）时才被要求补确认。

ALTER TABLE "dog" ADD COLUMN "bcs_score_confirmed_at" TIMESTAMP(3);
ALTER TABLE "dog" ADD COLUMN "activity_level_confirmed_at" TIMESTAMP(3);
ALTER TABLE "dog" ADD COLUMN "meals_per_day_confirmed_at" TIMESTAMP(3);
