-- 售后单来源（2026-10-27）
--
-- 此前定制食谱售后只能由顾客在小程序提交；老板遇到「顾客不满意但不会/不方便提单」
-- 就没有任何入口能把改好的食谱重新交给他。这一列让后台可以代客发起同一条记录：
--   CUSTOMER = 顾客提交（占免费次数、受售后窗口限制）
--   STAFF    = 员工代客发起（不占次数、不受窗口限制，创建即 ACCEPTED）
--
-- 历史数据全部是顾客提交的，所以默认值即正确回填值，不需要额外的 UPDATE。
ALTER TABLE "custom_recipe_aftersale"
  ADD COLUMN "source" VARCHAR(16) NOT NULL DEFAULT 'CUSTOMER';
