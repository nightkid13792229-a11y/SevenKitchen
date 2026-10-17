# 燕麦米标准原料导入审核摘要

## 当前结论

- 原料类型：FOOD
- 原料名称：燕麦米
- 处理口径：去壳燕麦 / oat groats / hulled oats，未煮熟，未调味，未强化
- 当前状态：已写入本地开发库
- 不做生产部署，也不生成生产迁移包

## 本地写入结果

- Ingredient ID：`fcd93c98-3500-4c89-afe3-1bce83afa092`
- NutritionFood ID：`6852c161-55b9-4b36-a8d3-283ae19315f2`
- NutritionFoodMapping ID：`16bf0aec-9237-4458-885a-27d25bc390f8`
- Procurement SKU：无
- DB alignment：本地写入不再要求；local apply audit 中记录为 `not-required-for-local`

## 来源选择

主 raw 档案：

- AFCD `F006136` - Oats, hulled, uncooked
- 理由：身份最贴近“燕麦米/去壳燕麦”；官方 AFCD Release 3.0 Excel 中 Derivation=Analysed。
- 不足：未找到精确同源的 hulled oats cooked 档案。

补字段来源：

- USDA FDC SR Legacy `173904` - Cereals, oats, regular and quick, not fortified, dry
- 用途：补铜、锰、必需氨基酸、胆碱、维生素 K
- MEXT `01004` - CEREALS/Common oats/oatmeal, raw
- 用途：补泛酸 B5、生物素 B7

熟制档案处理：

- USDA FDC SR Legacy `173905` 是 cooked oats with water，但语义是 regular/quick oats，不是精确燕麦米熟制档案。
- 本轮不把它导入为“燕麦米熟制档案”，只作为审核参考保留。

## 必需营养素覆盖率

- FEDIAF 2025 犬必需营养素分母：46 项
- 当前 raw 档案覆盖：42 / 46
- 覆盖率：91.30%
- 阻断问题：无
- 复核问题：无

缺失项：

- chloride
- vitaminA
- vitaminD
- vitaminB12

## 犬用换算

维生素 E：

- 来源：AFCD F006136
- 原始分项：alpha-tocopherol 0.4 mg，beta 0 mg，gamma 0.3 mg，delta 0 mg；Vitamin E total 0.48 mg
- FEDIAF 犬用活性系数：alpha 1.49 IU/mg，beta 0.33 IU/mg，gamma 0.01 IU/mg，delta 0.25 IU/mg
- 换算结果：0.599 IU / 100g
- 审计结果：已写入 sourceForms，并由 backend converter 在审计中规范化为 vitaminEIu

## 数据库状态

- 本地 Postgres：运行中
- Prisma migrate status：本地 schema up to date，110 migrations
- 本地查重：已有“燕麦”，未发现“燕麦米”；本轮新增“燕麦米”成功
- 生产只读 DB alignment：仍未配置；这只阻断生产包/生产迁移，不阻断本地开发库写入

## 已生成文件

- `.standard-ingredient-import/oat-groats.manifest.json`
- `.standard-ingredient-import/oat-groats.audit.json`
- `.standard-ingredient-import/oat-groats.nutrition-audit.json`
- `.standard-ingredient-import/oat-groats.local-apply.json`
- `.standard-ingredient-import/oat-groats.review-summary.md`

## 生产前置

未来若要生成生产迁移包或部署到生产，仍需补齐 `backend/.env.production.readonly` 并通过 DB alignment。
