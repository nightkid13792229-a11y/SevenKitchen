-- 20261114_fix_insoluble_fiber_and_taurine_targets.sql
--
-- 一次性数据修正（老板 2026-11-14 确认）。两条都是「补剂目标写错了口径」，
-- 不是结构变更，所以走 manual_migrations 而不是 schema migration。
--
-- Apply:
--   psql "$DATABASE_URL" -f backend/prisma/manual_migrations/20261114_fix_insoluble_fiber_and_taurine_targets.sql
--
-- 两条都按「旧值」匹配，重复执行不会二次生效。

BEGIN;

-- ① 定制食谱「Foxy定制 · 十字花科全谷物三文鱼鸡肉」
--    纤维素粉条目：补剂目标由「膳食纤维（总）」改为「不可溶性纤维」。
--    原因：纤维素粉档案只标了不可溶性纤维（1 g/g），没有总纤维，按总纤维算不出用量。
--    克数不变（20.18 g/kg 保持原值，纤维素粉 1g/g → 克数等价）。
UPDATE recipe_item
SET supplement_targets = jsonb_set(
        jsonb_set(
            supplement_targets,
            '{0,fieldPath}',
            '"macros.insolubleFiber"'
        ),
        '{0,label}',
        '"不可溶性纤维"'
    ),
    nutrient_target_key = 'insolubleFiber'
WHERE id = 'c4cca2e5-9756-4ea7-9135-b6e10d4f2226'
  AND supplement_targets -> 0 ->> 'fieldPath' = 'macros.fiber';

-- ② 设计稿「小米山药猪肉」的 3 条牛磺酸目标：370 g/kg → 0.37 g/kg
--    原因：同一个目标在已发布版本里是 370 mg/kg（= 0.37 g/kg），草稿把单位写成 g
--    却保留了 370，等于放大 1000 倍；照此发布会把牛磺酸用量写成 370 g/kg。
UPDATE design_recipe_item
SET supplement_targets = jsonb_set(supplement_targets, '{0,targetValue}', '0.37'),
    nutrient_target_value = 0.37
WHERE supplement_targets -> 0 ->> 'fieldPath' = 'aminoAcids.taurine'
  AND supplement_targets -> 0 ->> 'unit' = 'g'
  AND (supplement_targets -> 0 ->> 'targetValue')::numeric = 370;

COMMIT;
