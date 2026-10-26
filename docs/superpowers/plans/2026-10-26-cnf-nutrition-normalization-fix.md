# CNF 矿物质归一化修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 CNF（加拿大营养库）5,993 条记录里被导入映射漏掉的矿物质重新归一化进 `normalizedNutrition.minerals`，让检索与覆盖率不再把“有数据”误判成“缺数据”。

**Architecture:** 不重新下载 26MB 源文件。CNF 的 `rawData.amounts` 已经保留了每条记录的全部原始营养值；新增一个纯函数把 amounts 按“CNF 编码 → FDC id”翻译后复用现有 `mapUsdaNutrientsToNutritionProfile`，再用一个可 dry-run 的脚本回填 `normalizedNutrition`。只改这一个字段，不动 `rawData`、来源元数据、状态。

**Tech Stack:** NestJS 项目内的 ts-node 脚本、Prisma、Jest。

**Spec:** `docs/superpowers/specs/2026-10-26-nutrition-source-whitelist-and-data-readiness-design.md`（§四、§七第 1 条）

## Global Constraints

- 只在 `backend/` 内改；不碰 admin-web / miniapp。
- 不改 Prisma schema、不加 migration、不加依赖。
- 给生产库做数据修复的脚本必须**默认 dry-run**，只有显式 `--apply` 才写库；写库前打印将影响的条数。
- 只更新 `normalizedNutrition`（和 Prisma 自动维护的 `updatedAt`）；`rawData`、`foodName`、`sourceKey`、`status` 一律不动。
- 修复只针对 `sourceType='CNF'` 且 `rawData.amounts` 非空的记录。
- 任何一步失败就停下，不跳过、不“部分成功也算过”。

## 部署与数据的关系（为什么不会被下次部署覆盖）

这次修复分两部分，落点不同：

| 部分 | 落在哪 | 下次部署会怎样 |
|---|---|---|
| 编码映射 + 归一化函数 + 回填脚本 | git（`origin/main`） | 部署脚本把生产源码 `git reset --hard origin/main`，**会带上这些改动**，不会退回旧版 |
| `normalizedNutrition` 的回填结果 | 生产数据库的行数据 | 部署只跑 `prisma migrate deploy`（本计划没有新迁移），**不碰行数据**；回填值保留 |

唯一会让它“回到原样”的操作是：有人用旧代码重新跑一次 CNF 全量导入（upsert 会覆盖 `normalizedNutrition`）。映射已经修在主线里，所以即使重跑导入，结果也是带矿物质的。备份表只是回滚用，验证通过后删掉，不留在生产。

这不是 schema 变更，所以不走 migration；它是对**派生字段**的一次性修复，源数据 `rawData` 始终没动，随时可以重建。

## Review Focus

1. **编码映射错位**：301 必须是钙、303 铁、304 镁、305 磷、306 钾、307 钠、309 锌、312 铜、314 锰、315 硒、317 碘——错一个就是把一种矿物质写成另一种，比缺失更糟。
2. **单位**：硒、碘原库是 µg，映射到目录的 µg；其余是 mg。不能把 µg 当 mg。
3. **重复归一化**：脚本可重复跑；第二次跑结果应与第一次一致（幂等），不能越跑越多值。
4. **只动 CNF**：不能碰 USDA/CNF 之外任何来源；不能把 CNF 的 `sourceDetail`/`sourceTitle` 覆盖掉。
5. **失败可见**：某条记录 amounts 解析失败时，报告里要有 id，不能静默跳过。

---

### Task 1: 补齐矿物质编码映射 + 可测试的 CNF 归一化函数

**Files:**
- Modify: `backend/scripts/data/usda-nutrient-nbr-to-fdc-id.json`
- Create: `backend/src/domain/nutrition-governance/cnf-normalize.ts`
- Create: `backend/tests/domain/nutrition-governance/cnf-normalize.spec.ts`

**Interfaces:**
- 现有映射文件是 `Record<string, { fdcId: number; name: string }>`；新增 12 条（见下）。
- `export interface CnfRawAmount { nutrientCode: string; value: number }`
- `export interface CnfCodeMapEntry { fdcId: number; name: string }`
- `export function buildCnfNutritionProfile(input: { amounts: readonly CnfRawAmount[]; codeMap: Record<string, CnfCodeMapEntry>; food: { foodCode: string; description: string } }): NutritionProfileV2`
  - 用 `codeMap` 把 `nutrientCode` 翻成 `{ id, name, unitName: '' }`，过滤掉翻不出的；
  - 调 `mapUsdaNutrientsToNutritionProfile`；
  - 按 `scripts/import-cnf-bulk.ts` 现有逻辑补 `meta`：`sourceType='CNF'`、`sourceCode='CNF'`、`sourceProvider='Health Canada'`、`sourceTitle='Canadian Nutrient File (CNF) 2026'`、`externalId='CNF:{foodCode}'`、`sourceVersion='CNF_2026_14TH'`、`confidenceLevel='MEDIUM'`。
  - 不负责写库。

新增映射（FDC id 与官方名称）：
```json
"301": {"fdcId": 1087, "name": "Calcium, Ca"},
"303": {"fdcId": 1089, "name": "Iron, Fe"},
"304": {"fdcId": 1090, "name": "Magnesium, Mg"},
"305": {"fdcId": 1091, "name": "Phosphorus, P"},
"306": {"fdcId": 1092, "name": "Potassium, K"},
"307": {"fdcId": 1093, "name": "Sodium, Na"},
"309": {"fdcId": 1095, "name": "Zinc, Zn"},
"312": {"fdcId": 1098, "name": "Copper, Cu"},
"313": {"fdcId": 1099, "name": "Fluoride, F"},
"314": {"fdcId": 1101, "name": "Manganese, Mn"},
"315": {"fdcId": 1103, "name": "Selenium, Se"},
"317": {"fdcId": 1100, "name": "Iodine, I"}
```

- [ ] **Step 1: 写失败的测试**

```ts
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { buildCnfNutritionProfile } from 'src/domain/nutrition-governance/cnf-normalize';

const codeMap = JSON.parse(
  readFileSync(resolve(process.cwd(), 'scripts/data/usda-nutrient-nbr-to-fdc-id.json'), 'utf8'),
);

describe('buildCnfNutritionProfile', () => {
  it('把 301/303/315 归进矿物质，且单位不改数值', () => {
    const profile = buildCnfNutritionProfile({
      amounts: [
        { nutrientCode: '203', value: 20.5 },
        { nutrientCode: '301', value: 120 },
        { nutrientCode: '303', value: 1.2 },
        { nutrientCode: '315', value: 8.4 }, // µg 硒
      ],
      codeMap,
      food: { foodCode: '1507', description: 'Apricot, dried' },
    });
    expect(profile.macros.crudeProtein).toBeCloseTo(20.5);
    expect(profile.minerals.calcium).toBeCloseTo(120);
    expect(profile.minerals.iron).toBeCloseTo(1.2);
    expect(profile.minerals.selenium).toBeCloseTo(8.4);
    expect(profile.meta.externalId).toBe('CNF:1507');
  });

  it('翻不出的编码直接忽略，不抛错', () => {
    const profile = buildCnfNutritionProfile({
      amounts: [{ nutrientCode: '99999', value: 1 }],
      codeMap,
      food: { foodCode: 'x', description: 'x' },
    });
    expect(profile.minerals.calcium).toBeNull();
  });

  it('同一编码重复出现时取第一个值，不累加', () => {
    const profile = buildCnfNutritionProfile({
      amounts: [
        { nutrientCode: '301', value: 100 },
        { nutrientCode: '301', value: 200 },
      ],
      codeMap,
      food: { foodCode: 'x', description: 'x' },
    });
    expect(profile.minerals.calcium).toBeCloseTo(100);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/domain/nutrition-governance/cnf-normalize.spec.ts --runInBand`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 补映射 + 实现函数**

注意：`mapUsdaNutrientsToNutritionProfile` 内部对同字段按 `fieldPriority` 取优先，重复编码不保证“取第一个”；测试要求“不累加”，实现时先按 `nutrientCode` 去重（保留第一次出现）再传入。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest tests/domain/nutrition-governance/cnf-normalize.spec.ts --runInBand`
Expected: PASS（3/3）。

- [ ] **Step 5: 提交**

```bash
git add backend/scripts/data/usda-nutrient-nbr-to-fdc-id.json backend/src/domain/nutrition-governance/cnf-normalize.ts backend/tests/domain/nutrition-governance/cnf-normalize.spec.ts
git commit -m "fix(nutrition): map CNF mineral codes into normalized profile"
```

---

### Task 2: 回填脚本（默认 dry-run）

**Files:**
- Create: `backend/scripts/renormalize-cnf-nutrition.ts`

**Interfaces:**
- 复用 Task 1 的 `buildCnfNutritionProfile`。
- CLI：`--limit N`、`--apply`、`--report <path>`、`--help`；默认 dry-run。
- 输出报告：`{ scanned, changed, mineralsBefore, mineralsAfter, skipped: [{id, reason}], samples: [{id, name, calcium}] }`。

- [ ] **Step 1: 写脚本**

逻辑：
1. 读 `scripts/data/usda-nutrient-nbr-to-fdc-id.json`（与导入脚本同一个文件）。
2. `prisma.nutritionSourceRecord.findMany({ where: { sourceType: 'CNF' }, select: { id, sourceType, foodName, rawData, normalizedNutrition } })`。
3. `rawData.amounts` 必须是数组；元素取 `nutrientCode` 与 `value`（`value` 非有限数则跳过）。
4. 调 `buildCnfNutritionProfile`。
5. 统计“修复前 minerals 有值数”和“修复后”；`changed` 定义为前后 JSON 不相等。
6. `--apply` 时 `update({ where: { id }, data: { normalizedNutrition } })`，每 100 条打印一次进度。
7. 报告写文件（若给 `--report`），否则打印摘要。

- [ ] **Step 2: 本地类型检查**

Run: `cd backend && npx tsc --noEmit -p tsconfig.json 2>&1 | grep renormalize-cnf-nutrition || echo CLEAN`
Expected: 无该文件的错误。

- [ ] **Step 3: 合并推送，并把脚本同步到生产机**

生产机的源码目录会被部署脚本重置到 `origin/main`，所以脚本必须先合并进主线：

```bash
git push origin HEAD:main
ssh -i ~/.ssh/claude_deploy root@1.14.3.2 "cd /opt/sevenkitchen/SevenKitchen/backend && git fetch origin && git reset --hard origin/main"
```
Expected: 生产机 HEAD 等于刚推的提交；`git status` 干净。

- [ ] **Step 4: 生产 dry-run**

Run（在仓库根目录）:
```bash
ssh -i ~/.ssh/claude_deploy root@1.14.3.2 "cd /opt/sevenkitchen/SevenKitchen/backend && npx ts-node -r tsconfig-paths/register scripts/renormalize-cnf-nutrition.ts --report /tmp/cnf-renorm.json" 
```
Expected：`scanned=5993`，`mineralsBefore=0`，`mineralsAfter>=5000` 量级，`skipped` 为空或个位数；报告里抽样能看到 calcium 有值。

- [ ] **Step 5: 提交脚本（先不 apply）**

```bash
git add backend/scripts/renormalize-cnf-nutrition.ts
git commit -m "chore(nutrition): add CNF re-normalization script"
```

---

### Task 3: 生产回填 + 验证

- [ ] **Step 1: 先备份受影响字段**

```bash
ssh -i ~/.ssh/claude_deploy root@1.14.3.2 "cd /opt/sevenkitchen/SevenKitchen/backend && DB=\$(grep -m1 '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '\"' | sed 's/?.*//') && psql \"\$DB\" -c \"create table cnf_nutrition_backup_20261026 as select id, normalized_nutrition from nutrition_source_record where source_type='CNF';\""
```
Expected: `SELECT 5993`。若表已存在（重跑），先 `drop table cnf_nutrition_backup_20261026;` 再建，避免误以为已备份。

- [ ] **Step 2: apply**

```bash
ssh -i ~/.ssh/claude_deploy root@1.14.3.2 "cd /opt/sevenkitchen/SevenKitchen/backend && npx ts-node -r tsconfig-paths/register scripts/renormalize-cnf-nutrition.ts --apply --report /tmp/cnf-renorm-applied.json"
```
Expected: `changed` 接近 5993；无异常退出。

- [ ] **Step 3: 验证覆盖率**

```bash
ssh -i ~/.ssh/claude_deploy root@1.14.3.2 "cd /opt/sevenkitchen/SevenKitchen/backend && DB=\$(grep -m1 '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '\"' | sed 's/?.*//') && psql \"\$DB\" -tAc \"select count(*) filter (where normalized_nutrition->'minerals'->>'calcium' is not null) calcium, count(*) filter (where normalized_nutrition->'minerals'->>'iron' is not null) iron, count(*) total from nutrition_source_record where source_type='CNF';\""
```
Expected: calcium/iron 均 ≥5,000（目标 ≥90%）。

- [ ] **Step 4: 抽样对原值**

取一条记录，对比 `rawData.amounts` 里 301 的值与 `normalizedNutrition.minerals.calcium` 是否相等（允许浮点误差 0）。再取一条硒（315）确认没有被 ×1000。

- [ ] **Step 5: 幂等性**

再跑一次 `--apply`，报告 `changed=0`（或个位数浮点差异），矿物质数量不增长。

- [ ] **Step 6: 清理备份表**

验证通过、观察一天无异常后：
```bash
ssh ... "psql \"\$DB\" -c 'drop table cnf_nutrition_backup_20261026;'"
```
（保留一天是为了万一发现数值异常还能整表回滚；确认无误后删掉，避免生产留垃圾表。）

- [ ] **Step 7: 记录结果**

把 before/after 覆盖率、样本、幂等结果写进 `docs/superpowers/specs/2026-10-26-nutrition-source-whitelist-and-data-readiness-design.md` §四的表格下方，作为“CNF 已修复”的证据。

**回滚**：`update nutrition_source_record r set normalized_nutrition = b.normalized_nutrition from cnf_nutrition_backup_20261026 b where r.id=b.id;`（仅在验证失败时用）。

---

## 不在本计划

- CNF 的维生素 C / 叶酸 / 胆碱 / 脂肪酸 / 氨基酸编码（这次只修矿物质；其余需要 `nutrient_name.csv` 才能准确映射，单列一项）。
- TFDA、韩国 RDA 导入。
- 白名单登记表代码化。
- CFCT 补数据。
