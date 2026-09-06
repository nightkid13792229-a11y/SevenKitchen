---
name: adding-standard-ingredients
description: Use when adding a new FOOD or SUPPLEMENT standard ingredient to SevenKitchen, including local nutrition database lookup, draft generation, one-step user confirmation, and writing to production through the admin API.
---

# Adding Standard Ingredients（半自动轻流程）

## Purpose

用三步轻流程新增标准原料：**本地秒查营养 → 生成草稿 → 用户确认一次 → 写入正式环境**。
不再联网查源、不再 SQL 迁移包、营养不完整不再卡死创建。

## 核心规则（Non-Negotiable）

- 半自动：任何正式环境写入前必须得到用户一次明确确认。
- 营养数据只从本地 `nutrition_source_record` 营养库查找，不凭模型记忆补数据。
  本地库当前覆盖：USDA SR Legacy + Foundation（约 8,300 条）、加拿大 CNF 2026（5,993 条）、
  MEXT 日本八訂（2,478 条，含氨基酸/脂肪酸别册）、NZFCD 新西兰（2,857 条），
  以及 CFCT/NEVO 等零星记录，共约 1.9 万条。MEXT 食品名为日语，匹配器内置常用中→日别名表，
  未命中时可让用户补充中文名或英语名再查。
- 营养不完整可以创建：草稿必须标注"营养待补"及缺失清单，营养档案保持"待验证"状态。
- 食材（FOOD）可挂采购 SKU；补剂（SUPPLEMENT）禁止挂采购 SKU。
- 补剂必须有包装照片或等价标签依据；缺证据时先向用户要，不得凭空填浓度。
- 写入前自动查重 + 生产库备份；写入后必须回读验证。
- 凭据从 `backend/.env.ingredient-agent.local` 读取，绝不把密码写进任何会入库的文件。

## 流程（3 步）

### 第 1 步：生成草稿

1. 判断原料类型 FOOD / SUPPLEMENT（不确定就问用户）。
2. 本地营养匹配（秒级，不联网）：

```bash
cd backend
node -r ts-node/register -r tsconfig-paths/register ../skills/adding-standard-ingredients/scripts/match-local-nutrition.ts \
  --name 原料中文名 --name-en english-name --state raw \
  --out ../.standard-ingredient-import/<slug>.match.json
```

3. 从匹配结果选主档案：状态匹配优先，再看覆盖率；记录 `sourceRecordId` 与覆盖率和缺失营养素。
4. 按 `assets/ingredient-draft-template.json` 生成草稿，写入 `../.standard-ingredient-import/<slug>.draft.json`：
   - 营养数据直接取自匹配结果的营养档案（含犬用 A/D/E 口径换算，由后端审计模块处理）。
   - `coveragePercent < 60` 或存在关键缺失 → `nutritionPending = true`，营养档案照常创建（状态=待验证）。
   - FOOD 需要采购时附 `procurementSku`（品牌/渠道/规格/价格只进 SKU，不进原料本体）。
   - SUPPLEMENT 单层产品字段（品牌/型号/渠道/规格）落在 `ingredient` 本体，`procurementSku` 必须为 null。

### 第 2 步：用户确认（一次）

向用户输出大白话总结：名称、类型、状态、营养来源、覆盖率、缺失营养素、待补标记、采购价格、包装依据（补剂）。
用户确认后进入第 3 步。用户否定 → 改草稿再确认。

### 第 3 步：写入正式环境

1. 生产库备份（沿用 `production-ssh` 技能，在服务器执行一次 pg_dump，目录沿用 `/opt/sevenkitchen/backups/standard-ingredient-import/`）。
2. 先预演（不写）：

```bash
cd backend
node -r ts-node/register -r tsconfig-paths/register ../skills/adding-standard-ingredients/scripts/apply-production-ingredient.ts \
  --draft ../.standard-ingredient-import/<slug>.draft.json \
  --credentials-env .env.ingredient-agent.local
```

3. 预演通过后正式写入（加 `--confirm`）：

```bash
cd backend
node -r ts-node/register -r tsconfig-paths/register ../skills/adding-standard-ingredients/scripts/apply-production-ingredient.ts \
  --draft ../.standard-ingredient-import/<slug>.draft.json \
  --credentials-env .env.ingredient-agent.local --confirm
```

4. 脚本自动完成：登录 → 查重 → 创建原料 → 创建营养档案（待验证）→ 设主档案 → 创建采购 SKU → 回读验证。
5. 把结果和后台链接（admin.sevenkitchen.cloud → 原料管理）告诉用户，请用户到后台复核。

## 营养待补标记

- 覆盖率不达标的原料：`ingredient.properties.nutritionPending = true`，附 `nutritionCoveragePercent` 与 `missingNutrients`。
- 营养档案默认创建为"待验证"状态，后台营养治理页可看到并后续补齐。
- 达标档案（覆盖率 ≥ 60 且无阻断问题）同样先"待验证"，由后台治理流程转"已验证"，本流程不擅自放行。

## 查重与安全

- 写入脚本自动查同名/同品牌/同规格，命中即停。
- 写入走正式 admin API（与后台"保存"同一条通道）。
- 写入中断时脚本报告已创建的原料 ID，可到后台删除或人工处理。

## 禁止事项

- 禁止跳过用户确认直接 --confirm。
- 禁止无备份写入正式环境。
- 禁止给补剂创建采购 SKU。
- 禁止把品牌/渠道/规格写进食材原料本体（这些属于采购 SKU）。
- 禁止凭记忆或普通网页补营养数值。
- 禁止恢复旧流程的 manifest 校验、DB 对齐、SQL 迁移包路径（代码保留归档，不再作为默认流程）。

## 参考资料（按需加载）

- `references/source-policy.md`：营养来源政策（本地库同样适用其白名单与状态匹配规则）。
- `references/nutrition-audit.md`：覆盖率、单位、犬用口径审计规则。
