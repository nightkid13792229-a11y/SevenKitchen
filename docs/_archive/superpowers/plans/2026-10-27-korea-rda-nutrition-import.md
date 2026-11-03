# 韩国 RDA 营养库导入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把韩国农村振兴厅「국가표준식품성분 DB 10.4」（2026-05 发布，3,366 种食品 × 130 个营养素）导入本地库，成为第 7 个可检索的本地营养库；补上硒、碘、B5、B7、牛磺酸和可溶/不可溶纤维。

**Architecture:** Excel 不直接进 Node（后端没有 xlsx 依赖，不为一次性导入加运行时依赖）。用一个 Python 转换脚本把 10.4 工作表 + 附录 2（食品代码/英文名/学名）按索引 join，输出 **JSONL**（每行一个食品，含 `nutrients: {header: {value, unit}}`）；Node 导入脚本读 JSONL、走映射表、upsert `nutrition_source_record`（`sourceType='KO_RDA'`…见下）。默认 dry-run。

**Tech Stack:** Python 3 + openpyxl（只用于转换，不参与部署）、ts-node、Prisma、Jest。

**Spec:** `docs/superpowers/specs/2026-10-26-nutrition-source-whitelist-and-data-readiness-design.md`（§六之二：韩国 RDA 第一批进本地）

## Global Constraints

- 只在 `backend/` 内改；不碰 admin-web / miniapp；不加运行时依赖、不改 Prisma schema。
- **sourceType 用 `MEXT` 之外的哪个枚举？** 数据库 `NutritionGovernanceSourceType` 目前没有 `KO_RDA`。实现前先查：如果没有，**必须新增枚举值 + Prisma migration**（这是本计划唯一允许的 schema 变更），并同步 `nutrition-source-contract.ts` 的 `sourceCode`（建议 `KO_RDA_FOOD_COMPOSITION_TABLE`）与 legacy 映射；不要复用 `MEXT`。
- Python 转换脚本进 git；生成的 JSONL（约几十 MB）**不进 git**，只放 `/tmp` 或 `scripts/data/`（若该目录被 ignore）。
- 导入脚本默认 dry-run；`--apply` 才写库；只 upsert `nutrition_source_record`。
- 许可：공공누리 제1유형（KOGL Type 1，出处标注即可商用）。`sourceDetail.licenseNote` 必须写明 `KOGL Type 1 (attribution required)` 与来源机构「농촌진흥청 / RDA」。
- 空值/`-`/`Tr` 一律缺失，不补 0；数值列只接受有限数。
- 同一食品同一列出现多次不可能（表头已确认 134 个唯一名），但表头匹配必须先 `replace(/\s+/g,' ').trim()`。

## Review Focus

1. **单位**：氨基酸、亚油酸、α-亚麻酸、花生四烯酸的目录单位是 **g**，表里是 **mg** → ÷1000；EPA/DPA/DHA 目录是 mg，表里也是 mg → **不除**。
2. **维生素 A/D**：表里是 **µg**，目录是 **IU**；A ×3.33、D ×40，不能原样写。
3. **维生素 E**：表里是 **mg**，目录是 IU → ×1.49。
4. **硒/碘**：表里 µg、目录 µg → 原样；不要误当 mg。
5. **英文名靠附录 2 的 DB 索引 join**：主表没有英文名；join 错位会把别的食品的英文名贴上来。
6. **可溶/不可溶纤维**：表里是两列，目录也是两个字段；不要只写总量。
7. **废弃率（폐기율）**：只进 `sourceDetail`/`rawData`，不进 profile。

---

### Task 0（前置，若枚举缺失）: 新增 KO_RDA 来源枚举 + 合同

**Files:**
- Modify: `backend/prisma/schema.prisma`（enum 加 `KO_RDA`）
- Create: `backend/prisma/migrations/<timestamp>_add_ko_rda_source/migration.sql`
- Modify: `backend/src/domain/ingredient/nutrition-source-contract.ts`（sourceCode/provider/legacy 映射）

- [ ] 先 `grep KO_RDA` 确认不存在；按现有 `MEXT`/`CNF` 的写法加枚举与 contract；跑 `npx prisma generate`；跑 `npx jest tests/domain/ingredient tests/domain/nutrition-governance --runInBand`。

---

### Task 1: 韩国表映射 + 归一化函数

**Files:**
- Create: `backend/src/domain/nutrition-governance/korea-normalize.ts`
- Create: `backend/tests/domain/nutrition-governance/korea-normalize.spec.ts`

**Interfaces:**
- `export interface KoreaNutrientValue { value: number; unit: string }`
- `export interface KoreaFoodInput { index: string; code: string; nameKo: string; nameEn: string | null; scientificName: string | null; foodGroup: string | null; source: string | null; refuseRate: number | null; nutrients: Record<string, KoreaNutrientValue> }`
- `export function buildKoreaNutritionProfile(food: KoreaFoodInput): NutritionProfileV2`
- 映射表 `KOREA_NUTRIENT_MAP`：`{ header: string; tabKey; fieldKey; multiplier?: number; sourceUnit: string }`；header 为**空白折叠后**的韩文列名。

必须覆盖（exact header）：

```ts
// macros
'에너지' energyKcal (kcal); '수분' moisture; '단백질' crudeProtein; '지방' crudeFat;
'회분' ash; '탄수화물' carbohydrate; '총 식이섬유' fiber;
'수용성 식이섬유' solubleFiber; '불용성 식이섬유' insolubleFiber;
// minerals (mg; 셀레늄/요오드 µg)
'칼슘' calcium; '철' iron; '마그네슘' magnesium; '인' phosphorus; '칼륨' potassium;
'나트륨' sodium; '아연' zinc; '구리' copper; '망간' manganese;
'셀레늄' selenium (µg); '요오드' iodine (µg)
// vitamins
'비타민 A' vitaminA (µg → IU ×3.33);
'비타민 D' vitaminD (µg → IU ×40);
'비타민 E' vitaminE (mg → IU ×1.49);
'비타민 K' vitaminK (µg);
'티아민' vitaminB1; '리보플라빈' vitaminB2; '니아신' vitaminB3; '판토텐산' vitaminB5;
'비타민 B6' vitaminB6; '비오틴' vitaminB7 (µg); '엽산_엽산당량' vitaminB9 (µg);
'비타민 B12' vitaminB12 (µg); '비타민 C' vitaminC
// fatty acids
'총 포화 지방산' saturatedFattyAcids (g); '총 단일 불포화지방산' monounsaturatedFattyAcids (g);
'총 다가 불포화지방산' polyunsaturatedFattyAcids (g);
'리놀레산(18:2(n-6))' linoleicAcid (mg→g); '알파 리놀렌산(18:3 (n-3))' alphaLinolenicAcid (mg→g);
'아라키돈산(20:4(n-6))' arachidonicAcid (mg→g);
'에이코사 펜타에노산(20:5(n-3))' epa (mg); '도코사 펜타에노산(22:5(n-3))' dpa (mg);
'도코사 헥사에노산(22:6(n-3))' dha (mg)
// amino acids (mg→g)
'아르기닌' arginine; '라이신' lysine; '메티오닌' methionine; '시스테인' cystine;
'트립토판' tryptophan; '트레오닌' threonine; '류신' leucine; '이소류신' isoleucine;
'발린' valine; '페닐알라닌' phenylalanine; '티로신' tyrosine; '히스티딘' histidine;
'글루탐산' glutamicAcid; '글라이신' glycine; '프롤린' proline; '타우린' taurine
```

- [ ] **Step 1: 写失败的测试**：能量/蛋白/钙；硒/碘 µg 原样；牛磺酸 mg→g；A/D/E 换算；可溶/不可溶纤维；`nameEn` null；缺失 → null（不补 0）。
- [ ] **Step 2: 红**（模块不存在）。
- [ ] **Step 3: 实现**；`meta` 用注册口径（Task 0 的 sourceCode/provider/title/version `RDA_DB_10_4`/externalId `KO_RDA:{code}`）。
- [ ] **Step 4: 绿**；`npx jest tests/domain/nutrition-governance --runInBand`。
- [ ] **Step 5: 提交** `feat(nutrition): map Korean RDA nutrients into profile`。

---

### Task 2: Excel → JSONL 转换 + 导入脚本

**Files:**
- Create: `backend/scripts/data/prepare-korea-xlsx.py`
- Create: `backend/scripts/import-korea.ts`
- Create: `backend/tests/domain/nutrition-governance/korea-jsonl.spec.ts`（如果解析逻辑抽成纯函数）

**转换脚本**（`prepare-korea-xlsx.py <xlsx> <out.jsonl>`）：
1. 读 `국가표준식품성분 Database 10.4` 工作表：第 2 行表头、第 3 行单位、第 4 行起数据；表头空白折叠。
2. 读 `부록2)식품코드,국문명,영문명,학명 정보 `：`DB색인 → {code, ko, en, sci}`。
3. 按主表第 1 列（DB10.4 색인）join；join 不到就报错退出（不静默）。
4. 每行输出：`{index, code, nameKo, nameEn, scientificName, foodGroup, source, refuseRate, nutrients: {header: {value, unit}}}`；只保留有限数值。
5. 打印 `foods / joined / numericCells`。

- [ ] 先跑转换，得到 `/tmp/korea_10_4.jsonl`，确认 `foods=3366, joined=3366`。
- [ ] 导入脚本 `--jsonl <path>`、`--apply`、`--limit`、`--report`、`--help`；默认 dry-run；upsert `(sourceType, sourceKey=buildNutritionSourceKey('KO_RDA', code))`；`rawData` 存 `{food:{...}, nutrients}`；报告 `{scanned, created, updated, skipped, unitMismatches, samples}`。
- [ ] 真实 dry-run 报告给老板看。

---

### Task 3: 生产 dry-run → apply → 验证

- 上传 JSONL 到生产 `/tmp/korea_10_4.jsonl`；同步源码；dry-run（期望 `scanned=3366`、`created=3366`、`skipped=0`）。
- 备份（若有旧 KO_RDA 记录）→ apply → 验证：总数 3,366、唯一键 3,366、硒/碘/牛磺酸/可溶纤维有值数、抽样中文/英文名。
- 更新白名单文档 §四/§七；删除服务器临时文件。

---

## 不在本计划

- CFCT 补数据。
- 白名单登记表代码化。
- 韩国 DB 的 130 列里未映射的脂肪酸/糖明细（留在 rawData）。
