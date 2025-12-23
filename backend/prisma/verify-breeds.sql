-- 200品种数据验证脚本
-- 使用方法: psql -U postgres -d sevenkitchen -f verify-breeds.sql

\echo '================================================'
\echo '200品种数据验证报告'
\echo '================================================'
\echo ''

-- 1. 总数检查
\echo '1. 品种总数'
SELECT COUNT(*) as total_breeds FROM "DogBreed";
\echo ''

-- 2. 各体型分类统计
\echo '2. 各体型分类统计'
SELECT
  "sizeCategory",
  COUNT(*) as count,
  MIN("averageAdultWeightKg") as min_weight,
  MAX("averageAdultWeightKg") as max_weight,
  ROUND(AVG("averageAdultWeightKg"), 2) as avg_weight
FROM "DogBreed"
GROUP BY "sizeCategory"
ORDER BY "sizeCategory";
\echo ''

-- 3. 成熟月龄分布
\echo '3. 成熟月龄分布'
SELECT "adultAgeMonths", COUNT(*) as count
FROM "DogBreed"
GROUP BY "adultAgeMonths"
ORDER BY "adultAgeMonths";
\echo ''

-- 4. 老龄年龄分布
\echo '4. 老龄年龄分布'
SELECT "seniorAgeYears", COUNT(*) as count
FROM "DogBreed"
GROUP BY "seniorAgeYears"
ORDER BY "seniorAgeYears";
\echo ''

-- 5. Top 20 常见品种（按ID排序）
\echo '5. Top 20 常见品种（按导入顺序）'
SELECT
  id,
  name,
  "sizeCategory",
  "averageAdultWeightKg",
  "adultAgeMonths",
  "seniorAgeYears"
FROM "DogBreed"
ORDER BY id
LIMIT 20;
\echo ''

-- 6. 体重范围检查（异常值）
\echo '6. 异常体重值检查（<1kg 或 >100kg）'
SELECT name, "averageAdultWeightKg", "sizeCategory"
FROM "DogBreed"
WHERE "averageAdultWeightKg" < 1 OR "averageAdultWeightKg" > 100
ORDER BY "averageAdultWeightKg";
\echo ''

-- 7. 生长曲线类型统计
\echo '7. 生长曲线类型统计'
SELECT "growthCurveType", COUNT(*) as count
FROM "DogBreed"
GROUP BY "growthCurveType";
\echo ''

-- 8. 验证AAHA标准合规性
\echo '8. AAHA标准合规性检查'
SELECT
  "sizeCategory",
  COUNT(*) as count,
  CASE
    WHEN "sizeCategory" = 'SMALL' AND "adultAgeMonths" = 10 THEN '✓'
    WHEN "sizeCategory" = 'SMALL' AND "seniorAgeYears" = 11 THEN '✓'
    WHEN "sizeCategory" = 'MEDIUM' AND "adultAgeMonths" = 12 THEN '✓'
    WHEN "sizeCategory" = 'MEDIUM' AND "seniorAgeYears" = 10 THEN '✓'
    WHEN "sizeCategory" = 'LARGE' AND "adultAgeMonths" = 18 THEN '✓'
    WHEN "sizeCategory" = 'LARGE' AND "seniorAgeYears" = 8 THEN '✓'
    WHEN "sizeCategory" = 'GIANT' AND "adultAgeMonths" = 24 THEN '✓'
    WHEN "sizeCategory" = 'GIANT' AND "seniorAgeYears" = 7 THEN '✓'
    ELSE '✗'
  END as aaha_compliance
FROM "DogBreed"
GROUP BY "sizeCategory";
\echo ''

-- 9. 中文品种名示例
\echo '9. 中文品种名示例（随机10个）'
SELECT name, "sizeCategory"
FROM "DogBreed"
ORDER BY RANDOM()
LIMIT 10;
\echo ''

-- 10. 完整性检查
\echo '10. 数据完整性检查（必填字段）'
SELECT
  COUNT(*) FILTER (WHERE name IS NULL) as null_names,
  COUNT(*) FILTER (WHERE "sizeCategory" IS NULL) as null_sizes,
  COUNT(*) FILTER (WHERE "adultAgeMonths" IS NULL) as null_adult_ages,
  COUNT(*) FILTER (WHERE "seniorAgeYears" IS NULL) as null_senior_ages,
  COUNT(*) FILTER (WHERE "averageAdultWeightKg" IS NULL) as null_weights
FROM "DogBreed";
\echo ''

\echo '================================================'
\echo '验证完成'
\echo '================================================'
