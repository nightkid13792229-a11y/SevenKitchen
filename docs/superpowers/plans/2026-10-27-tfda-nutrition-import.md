# TFDA 营养库导入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把台湾 FDA「食品營養成分資料集」（官方 CSV，2026-10 版，2,213 种食品、104 个营养素、长表）导入本地库，成为第 6 个可检索的本地营养库；中文名原生可搜，补 CFCT 只有 12 条的缺口。

**Architecture:** 两段式——先把长表按「整合編號」聚成每食品一行，再用一张显式映射表翻译成 `NutritionProfileV2`；导入脚本 upsert 到 `nutrition_source_record`（`sourceType='TFDA'`、`sourceKey='TFDA:{整合編號}'`），并把每食品的原始营养素行存进 `rawData`，以后映射有错可重算。脚本默认 dry-run。

**Tech Stack:** NestJS 项目内 ts-node 脚本、Prisma、Jest。

**Spec:** `docs/superpowers/specs/2026-10-26-nutrition-source-whitelist-and-data-readiness-design.md`（§六之二：TFDA 第一批进本地）

## Global Constraints

- 只在 `backend/` 内改；不碰 admin-web / miniapp；不改 Prisma schema（`TFDA` 枚举已存在）、不加依赖。
- **不要把 63MB 官方 CSV 提交进 git**；测试用一个小 fixture（≤5 食品），大文件只放 `backend/scripts/data/tfda/`（gitignore 已忽略 `scripts/data` 则直接放）。
- 导入脚本默认 dry-run；`--apply` 才写库；写库只 upsert `nutrition_source_record`，不改其它表。
- 只处理 `每100克含量` 为非空数字的行；空字符串、`Tr`、`-` 一律当缺失，不补 0。
- 同一食品同一营养素出现多行时，**`樣品平均值` 优先于 `樣品基本資料`**；同类型重复取第一行。
- 单位换算必须显式：mg→g 除以 1000；维生素 E mg→IU 乘 1.49；维生素 D µg→IU 乘 40；其余按目录单位原样。
- 任何映射不上的营养素名直接忽略，但要在报告里按名称计数（可见，不静默）。

## Review Focus

1. **单位错位**：氨基酸、亚油酸等目录是 **g**、TFDA 是 **mg**，必须 /1000；EPA/DPA/DHA 目录是 **mg**，TFDA 也是 mg，**不能**再 /1000。
2. **维生素 E**：目录是 IU、TFDA 是 mg，必须 ×1.49；忘了就是 1.49 倍偏差。
3. **维生素 A/D**：优先用 TFDA 的 IU 总量；只有缺失时才用 µg 换算（A: ×3.33，D: ×40），不能重复写。
4. **长表聚合**：同一食品 104 行；`樣品平均值` 与 `樣品基本資料` 可能同时存在，取错会把平均值覆盖成单样本。
5. **中文名/英文名**：`樣品英文名稱` 只有约 80% 有值，空值必须存 null，不能存空字符串；中文名必须原样保留（含全角括号）。
6. **可重算**：`rawData` 必须能独立重建 profile；丢了原始行，以后映射修正就要重新下载 63MB。

---

### Task 1: 映射表 + 可测试的 TFDA 归一化函数

**Files:**
- Create: `backend/src/domain/nutrition-governance/tfda-normalize.ts`
- Create: `backend/tests/domain/nutrition-governance/tfda-normalize.spec.ts`

**Interfaces:**
- `export interface TfdaNutrientRow { name: string; unit: string; value: number; dataType: '樣品平均值' | '樣品基本資料' | string }`
- `export interface TfdaFoodInput { foodCode: string; name: string; nameEn: string | null; category: string | null; refuseRate: number | null; rows: readonly TfdaNutrientRow[] }`
- `export function buildTfdaNutritionProfile(food: TfdaFoodInput): NutritionProfileV2`
- 映射表 `TFDA_NUTRIENT_MAP`：每项 `{ match: string; tabKey: 'macros'|'minerals'|'vitamins'|'fattyAcids'|'aminoAcids'; fieldKey: string; multiplier?: number; sourceUnit: string; preferred?: '平均值' }`；`match` 为 TFDA 分析項全名（精确匹配）。

必须覆盖的映射（exact names）：

```ts
// macros（g / kcal）
'熱量' → energyKcal ×1 (kcal)
'水分' → moisture
'粗蛋白' → crudeProtein
'粗脂肪' → crudeFat
'灰分' → ash
'總碳水化合物' → carbohydrate
'膳食纖維' → fiber
'飽和脂肪' → saturatedFattyAcids
// fatty acids（mg → g，÷1000）
'脂肪酸S總量' → saturatedFattyAcids (fallback only if 飽和脂肪 missing)
'脂肪酸M總量' → monounsaturatedFattyAcids ÷1000
'脂肪酸P總量' → polyunsaturatedFattyAcids ÷1000
'亞麻油酸(18:2)' → linoleicAcid ÷1000
'次亞麻油酸(18:3)' → alphaLinolenicAcid ÷1000
'花生油酸(20:4)' → arachidonicAcid ÷1000
'廿碳五烯酸(20:5)' → epa ×1 (mg)
'廿二碳五烯酸(22:5)' → dpa ×1 (mg)
'廿二碳六烯酸(22:6)' → dha ×1 (mg)
// minerals（mg）
'鈣' calcium; '磷' phosphorus; '鉀' potassium; '鈉' sodium; '鎂' magnesium;
'鐵' iron; '鋅' zinc; '銅' copper; '錳' manganese
// vitamins
'維生素A總量(IU)' → vitaminA ×1 (IU)；缺失时 '視網醇當量(RE)' µg ×3.33
'維生素D總量(IU)' → vitaminD ×1；缺失时 '維生素D總量(ug)' ×40
'維生素E總量' → vitaminE ×1.49 (mg→IU)；缺失时 'α-維生素E當量(α-TE)' ×1.49
'維生素K1' + '維生素K2' → vitaminK 相加 (µg)
'維生素B1' B1; '維生素B2' B2; '菸鹼素' B3; '維生素B6' B6; '葉酸' B9; '維生素B12' B12; '維生素C' C
// amino acids（mg → g，÷1000）
'精胺酸(Arg)' arginine; '離胺酸(Lys)' lysine; '甲硫胺酸(Met)' methionine;
'胱胺酸(Cys)' cystine; '色胺酸(Trp)' tryptophan; '酥胺酸(Thr)' threonine;
'白胺酸(Leu)' leucine; '異白胺酸(Ile)' isoleucine; '纈胺酸(Val)' valine;
'苯丙胺酸(Phe)' phenylalanine; '酪胺酸(Tyr)' tyrosine; '組胺酸(His)' histidine;
'麩胺酸(Glu)' glutamicAcid; '甘胺酸(Gly)' glycine; '脯胺酸(Pro)' proline
```

- [ ] **Step 1: 写失败的测试**

```ts
import { buildTfdaNutritionProfile } from 'src/domain/nutrition-governance/tfda-normalize';

const rows = (items: Array<[string, string, number]>, dataType = '樣品基本資料') =>
  items.map(([name, unit, value]) => ({ name, unit, value, dataType }));

describe('buildTfdaNutritionProfile', () => {
  it('宏量/矿物质/维生素按目录单位落位', () => {
    const p = buildTfdaNutritionProfile({
      foodCode: 'J0200201', name: '雙髻鯊', nameEn: 'Hammerhead shark',
      category: '魚貝類', refuseRate: 62.2,
      rows: rows([
        ['熱量','kcal',117], ['粗蛋白','g',20.1], ['鈣','mg',9],
        ['維生素E總量','mg',2], ['維生素D總量(IU)','IU',40], ['維生素K1','ug',1], ['維生素K2','ug',2],
      ]),
    });
    expect(p.macros.energyKcal).toBe(117);
    expect(p.macros.crudeProtein).toBeCloseTo(20.1);
    expect(p.minerals.calcium).toBe(9);
    expect(p.vitamins.vitaminE).toBeCloseTo(2.98); // ×1.49
    expect(p.vitamins.vitaminD).toBe(40);
    expect(p.vitamins.vitaminK).toBe(3);
    expect(p.meta.externalId).toBe('TFDA:J0200201');
  });

  it('氨基酸 mg→g、EPA 保持 mg', () => {
    const p = buildTfdaNutritionProfile({ foodCode:'x', name:'x', nameEn:null, category:null, refuseRate:null,
      rows: rows([['精胺酸(Arg)','mg',1200], ['廿碳五烯酸(20:5)','mg',30]]) });
    expect(p.aminoAcids.arginine).toBeCloseTo(1.2);
    expect(p.fattyAcids.epa).toBe(30);
  });

  it('平均值优先于基本資料', () => {
    const p = buildTfdaNutritionProfile({ foodCode:'x', name:'x', nameEn:null, category:null, refuseRate:null,
      rows: [
        { name:'鈣', unit:'mg', value: 10, dataType:'樣品基本資料' },
        { name:'鈣', unit:'mg', value: 99, dataType:'樣品平均值' },
      ] });
    expect(p.minerals.calcium).toBe(99);
  });

  it('空/未知营养素忽略，不补 0', () => {
    const p = buildTfdaNutritionProfile({ foodCode:'x', name:'x', nameEn:null, category:null, refuseRate:null,
      rows: rows([['不存在的营养素','mg',5]]) });
    expect(p.minerals.calcium).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/domain/nutrition-governance/tfda-normalize.spec.ts --runInBand`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 实现**

`tfda-normalize.ts` 里用 `createEmptyNutritionProfile()`（与 CNF 同一个工具）初始化；按映射表逐行取值；为每个写入字段设置 `meta.sourceForms[fieldPath] = { sourceNutrientName, originalValue, originalUnit, canonicalValue, canonicalUnit, basisType: 'PER_100_G' }`；`refuseRate` **不写进 profile**（`NutritionProfileMeta` 没有这个字段，别硬造）；它只保留在输入对象与导入脚本的 `rawData`/`sourceDetail` 里。`meta` 按 CNF 的 7 个字段填，`sourceTitle: 'Taiwan Food Nutrition Database (TFDA) 2026-10'`、`sourceVersion: 'TFDA_2026_10'`。

- [ ] **Step 4: 跑绿**

Run: 同上 → PASS（4/4）。

- [ ] **Step 5: 提交**

```bash
git add backend/src/domain/nutrition-governance/tfda-normalize.ts backend/tests/domain/nutrition-governance/tfda-normalize.spec.ts
git commit -m "feat(nutrition): map TFDA nutrients into nutrition profile"
```

---

### Task 2: CSV 解析 + 导入脚本（默认 dry-run）

**Files:**
- Create: `backend/src/domain/nutrition-governance/tfda-csv.ts`
- Create: `backend/tests/domain/nutrition-governance/tfda-csv.spec.ts`
- Create: `backend/scripts/import-tfda.ts`

**Interfaces:**
- `export function parseTfdaCsv(text: string): TfdaFoodInput[]`
  - 处理 UTF-8 BOM、带引号字段、字段内逗号（用 `csv-parse/sync`？项目已有依赖就复用；没有就写一个最小 RFC4180 解析器，不新增依赖）；
  - 按 `整合編號` 聚合；`樣品名稱` 取第一行；`樣品英文名稱` 取第一个非空；`食品分類` 取第一行；`廢棄率` 取第一个能 parse 的数；
  - 只保留 `每100克含量` 能 parse 成有限数的行；`資料類別` 原样带上；
  - 返回 `TfdaFoodInput[]`（按首次出现顺序）。
- 脚本 `--csv <path>`（必填）、`--apply`、`--limit N`、`--report <path>`、`--help`；默认 dry-run。
  - `findMany` CNF 同款：按 `sourceKey` 查已存在（`sourceType:'TFDA'`），存在则 `update`，否则 `create`；
  - `rawData = { food: { foodCode, name, nameEn, category, refuseRate }, nutrients: rows }`；
  - `sourceTitle/sourceDetail` 里写明许可：`OGDL 1.0 (Government Open Data License, Taiwan); attribution required`；
  - 报告 `{ scanned, created, updated, skipped: [{foodCode, reason}], samples }`。

- [ ] **Step 1: 写解析器测试（小 fixture 字符串）**

覆盖：BOM、引号内逗号、空值、重复营养素、平均值优先标志透传、非数字忽略。

- [ ] **Step 2: 红 → 实现 → 绿**

Run: `cd backend && npx jest tests/domain/nutrition-governance/tfda-csv.spec.ts --runInBand`。

- [ ] **Step 3: 写脚本 + `--help` 自检**

Run: `npx ts-node -r tsconfig-paths/register scripts/import-tfda.ts --help` → exit 0。

- [ ] **Step 4: 提交**

```bash
git add backend/src/domain/nutrition-governance/tfda-csv.ts backend/tests/domain/nutrition-governance/tfda-csv.spec.ts backend/scripts/import-tfda.ts
git commit -m "feat(nutrition): add TFDA CSV import script"
```

---

### Task 3: 生产 dry-run → 审核 → 导入 → 验证

**前置**：把官方 `20_2.csv` 放到生产机（scp，不要进 git），路径 `/tmp/tfda/20_2.csv`。

- [ ] **Step 1: 推送并同步生产源码**

```bash
git push origin HEAD:main
ssh ... "cd /opt/.../backend && git fetch origin && git reset --hard origin/main"
```

- [ ] **Step 2: dry-run**

```bash
ssh ... "cd /opt/.../backend && npx ts-node -r tsconfig-paths/register scripts/import-tfda.ts --csv /tmp/tfda/20_2.csv --report /tmp/tfda-dry.json"
```
期望：`scanned≈2213`、`created≈2213`、`updated=0`、`skipped` 个位数；报告里抽样显示中文名、英文名、蛋白质、钙、精氨酸。

- [ ] **Step 3: 给老板看 dry-run 报告，确认后 apply**

```bash
ssh ... "... --apply --report /tmp/tfda-applied.json"
```
期望：`created≈2213`。

- [ ] **Step 4: 验证**

```sql
select count(*) from nutrition_source_record where source_type='TFDA';            -- 约 2213
select count(*) filter (where normalized_nutrition->'minerals'->>'calcium' is not null) from ... where source_type='TFDA';
select count(*) filter (where normalized_nutrition->'aminoAcids'->>'arginine' is not null) from ...;
select food_name, normalized_nutrition->'macros'->>'crudeProtein' from ... where food_name like '%鯊%' limit 3;
```
期望：总数 ≈2,213；钙/精氨酸有值比例与源数据一致（约 80–90%）；中文名可读。

- [ ] **Step 5: 检索抽查**

用 `listNutritionNames('鯊魚')` / `searchNames('雞蛋')` 之类在本地跑一次（不写库），确认能命中 TFDA 记录（中文名）。

- [ ] **Step 6: 提交结果到白名单文档并清理**

更新 `docs/.../2026-10-26-nutrition-source-whitelist-and-data-readiness-design.md` §四：TFDA 记录数、字段覆盖、导入日期；把 `/tmp` 大文件删掉。

---

## 不在本计划

- 韩国 RDA 导入（下一个）。
- CFCT 补数据。
- 白名单登记表代码化。
- TFDA 的 `廢棄率` 写入原料卡可食部（导入只存 sourceDetail，原料卡仍由 AI/人填）。
