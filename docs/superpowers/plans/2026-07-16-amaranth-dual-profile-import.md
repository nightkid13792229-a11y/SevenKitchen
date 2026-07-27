# 苋菜双营养档案导入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在一个“苋菜”标准原料下导入可追溯的 USDA 生鲜与水煮沥干无盐营养档案，并导出只含该原料的生产迁移包。

**Architecture:** 保留既有 `standard-ingredient-import` 受控流程，以 USDA FDC 的两个同源叶菜记录作为两个 `nutritionProfiles`。先通过来源、营养、单位和本地/生产库对齐校验，再将数据写入本地验证库，最后由本地审计记录生成可回滚的 SQL 迁移包；不直接连接写入生产库。

**Tech Stack:** TypeScript、Nest/Prisma、PostgreSQL、USDA FoodData Central API、项目 `adding-standard-ingredients` 脚本。

---

### Task 1: 复核来源与双档案营养数据

**Files:**
- Modify: `.standard-ingredient-import/2026-07-14-amaranth/amaranth.manifest.json`
- Create: `.standard-ingredient-import/2026-07-14-amaranth/source-evidence.json`

- [ ] **Step 1: 获取两个 USDA 官方记录并保存可追溯摘要**

运行：

```bash
cd backend
curl --fail --silent --show-error 'https://api.nal.usda.gov/fdc/v1/food/168385?api_key=DEMO_KEY' > /tmp/amaranth-raw-usda.json
curl --fail --silent --show-error 'https://api.nal.usda.gov/fdc/v1/food/169202?api_key=DEMO_KEY' > /tmp/amaranth-boiled-usda.json
jq '{fdcId,description,scientificName,dataType,publicationDate}' /tmp/amaranth-raw-usda.json
jq '{fdcId,description,scientificName,dataType,publicationDate}' /tmp/amaranth-boiled-usda.json
```

预期：分别显示 `168385 / Amaranth leaves, raw` 和 `169202 / Amaranth leaves, cooked, boiled, drained, without salt`；两者均为 `Amaranthus spp.`。

- [ ] **Step 2: 用现有 USDA 映射器生成两个 NutritionProfileV2 候选值**

运行：

```bash
cd backend
for id in 168385 169202; do
  curl --fail --silent --show-error "https://api.nal.usda.gov/fdc/v1/food/${id}?api_key=DEMO_KEY" \
    | node -r ts-node/register -r tsconfig-paths/register -e '
      let body="";
      process.stdin.on("data", (chunk) => (body += chunk));
      process.stdin.on("end", () => {
        const food = JSON.parse(body);
        const { mapUsdaNutrientsToNutritionProfile } = require("./src/domain/nutrition-governance/nutrition-governance.utils");
        console.log(JSON.stringify(mapUsdaNutrientsToNutritionProfile(food.foodNutrients), null, 2));
      });'
done
```

预期：两个输出均为每 100 g 的嵌套 `NutritionProfileV2`；不得将生鲜值用于熟制档案。

- [ ] **Step 3: 更新清单为两个状态明确的档案**

在 `amaranth.manifest.json` 中保留 FDC 168385 主档案，并新增 FDC 169202 次档案，字段必须为：

```json
{
  "id": "usda-fdc-169202-amaranth-leaves-boiled-drained-without-salt",
  "name": "苋菜（水煮、沥干、无盐）",
  "nameEn": "Amaranth leaves, cooked, boiled, drained, without salt",
  "dataSource": "USDA_FDC",
  "externalId": "USDA_FDC:169202",
  "basis": "PER_100G",
  "preparationState": "cooked",
  "preparationStateLabel": "水煮、沥干、无盐",
  "ediblePortionLabel": "叶，水煮后沥干，每100克",
  "processingLabel": "水煮、沥干、无盐",
  "isPrimary": false,
  "yieldRate": 1
}
```

同时在 `sourceCandidates` 中声明两个 USDA 候选，状态分别为 `raw` 和 `cooked`，并用审计实测覆盖率更新 `essentialCoveragePercent`。

- [ ] **Step 4: 写入来源证据文件**

`source-evidence.json` 必须包含：每条 FDC ID、官方描述、学名、状态、检索日期、原始记录 URL、选择理由，以及排除 MEXT 的原因（MEXT 仅为苋属谷粒，不是叶菜）。

- [ ] **Step 5: 校验 JSON 格式**

运行：

```bash
jq empty ../.standard-ingredient-import/2026-07-14-amaranth/amaranth.manifest.json
jq empty ../.standard-ingredient-import/2026-07-14-amaranth/source-evidence.json
```

预期：两条命令均无输出且退出码为 0。

### Task 2: 执行来源、营养与数据库对齐审计

**Files:**
- Create: `.standard-ingredient-import/2026-07-14-amaranth/db-alignment.json`
- Create: `.standard-ingredient-import/2026-07-14-amaranth/amaranth.audit.json`
- Modify: `.standard-ingredient-import/2026-07-14-amaranth/amaranth.manifest.json`

- [ ] **Step 1: 建立本地与生产只读库对齐报告**

运行：

```bash
cd backend
node -r ts-node/register -r tsconfig-paths/register ../skills/adding-standard-ingredients/scripts/check-db-alignment.ts \
  --local-env .env \
  --production-env .env.production.readonly \
  --out ../.standard-ingredient-import/2026-07-14-amaranth/db-alignment.json
```

预期：输出 `DB alignment passed: <id>`。

- [ ] **Step 2: 将输出的对齐 ID 写入清单**

在清单中设置：

```json
"dbAlignmentReport": {
  "id": "<步骤 1 输出的 id>",
  "status": "passing"
}
```

并保持 `operatorConfirmation.localWriteApproved` 为 `false`，直到审计完成后获得用户明确确认。

- [ ] **Step 3: 运行导入前审计**

运行：

```bash
cd backend
node -r ts-node/register -r tsconfig-paths/register ../skills/adding-standard-ingredients/scripts/audit-ingredient-import.ts \
  --manifest ../.standard-ingredient-import/2026-07-14-amaranth/amaranth.manifest.json \
  --out ../.standard-ingredient-import/2026-07-14-amaranth/amaranth.audit.json
jq '{ok, rankedSources, nutritionAudits: [.nutritionAudits[] | {profileId, essentialCoveragePercent: .audit.essentialCoveragePercent, blockingIssues: .audit.blockingIssues, reviewIssues: .audit.reviewIssues}]}' \
  ../.standard-ingredient-import/2026-07-14-amaranth/amaranth.audit.json
```

预期：`ok: true`、排名中 USDA 生鲜档案为首选，两个档案均无 `blockingIssues`；必须报告而非忽略 `reviewIssues`。

- [ ] **Step 4: 审查范围与重复项**

运行：

```bash
cd backend
node -r ts-node/register -r tsconfig-paths/register -e '
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  prisma.ingredient.findMany({ where: { name: "苋菜", type: "FOOD" }, select: { id: true, name: true } })
    .then((rows) => { console.log(JSON.stringify(rows)); return prisma.$disconnect(); })
    .catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });'
```

预期：本地库不存在重复“苋菜”FOOD 原料；若存在，停止并改用 `updateExistingIngredientId`，不得创建重复记录。

### Task 3: 本地验证写入与生产迁移包

**Files:**
- Modify: `.standard-ingredient-import/2026-07-14-amaranth/amaranth.manifest.json`
- Create: `.standard-ingredient-import/2026-07-14-amaranth/amaranth.local-apply.json`
- Create: `.standard-ingredient-import/2026-07-14-amaranth/amaranth-production-package/manifest.json`
- Create: `.standard-ingredient-import/2026-07-14-amaranth/amaranth-production-package/review-summary.md`
- Create: `.standard-ingredient-import/2026-07-14-amaranth/amaranth-production-package/up.sql`
- Create: `.standard-ingredient-import/2026-07-14-amaranth/amaranth-production-package/down.sql`
- Create: `.standard-ingredient-import/2026-07-14-amaranth/amaranth-production-package/source-audit.json`
- Create: `.standard-ingredient-import/2026-07-14-amaranth/amaranth-production-package/unit-audit.json`

- [ ] **Step 1: 获得用户对本地写入的明确确认后更新清单**

设置：

```json
"operatorConfirmation": {
  "localWriteApproved": true,
  "productionPackageApproved": true
}
```

- [ ] **Step 2: 写入本地验证库**

运行：

```bash
cd backend
node -r ts-node/register -r tsconfig-paths/register ../skills/adding-standard-ingredients/scripts/apply-local-ingredient-import.ts \
  --manifest ../.standard-ingredient-import/2026-07-14-amaranth/amaranth.manifest.json \
  --alignment ../.standard-ingredient-import/2026-07-14-amaranth/db-alignment.json \
  --audit-out ../.standard-ingredient-import/2026-07-14-amaranth/amaranth.local-apply.json
```

预期：审计文件记录恰好 1 个 `ingredientId`、2 个 `nutritionFoodIds`、2 个 `nutritionFoodMappingIds`。

- [ ] **Step 3: 验证本地映射与状态**

运行：

```bash
cd backend
node -r ts-node/register -r tsconfig-paths/register -e '
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  prisma.ingredient.findFirst({
    where: { name: "苋菜", type: "FOOD" },
    include: { nutritionFoodMappings: { include: { nutritionFood: true }, orderBy: { isPrimary: "desc" } } }
  }).then((ingredient) => {
    const profiles = ingredient?.nutritionFoodMappings.map((mapping) => ({
      isPrimary: mapping.isPrimary,
      externalId: mapping.nutritionFood.externalId,
      preparationState: mapping.nutritionFood.preparationState,
      preparationStateLabel: mapping.nutritionFood.preparationStateLabel
    }));
    console.log(JSON.stringify(profiles, null, 2));
    return prisma.$disconnect();
  }).catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });'
```

预期：返回两个映射；`USDA_FDC:168385` 为主且状态 `raw`，`USDA_FDC:169202` 为次且状态 `cooked`。

- [ ] **Step 4: 生成生产迁移包**

运行：

```bash
cd backend
node -r ts-node/register -r tsconfig-paths/register ../skills/adding-standard-ingredients/scripts/build-production-migration-package.ts \
  --manifest ../.standard-ingredient-import/2026-07-14-amaranth/amaranth.manifest.json \
  --local-audit ../.standard-ingredient-import/2026-07-14-amaranth/amaranth.local-apply.json \
  --out-dir ../.standard-ingredient-import/2026-07-14-amaranth/amaranth-production-package
```

预期：生成 `manifest.json`、`review-summary.md`、`up.sql`、`down.sql`、`source-audit.json`、`unit-audit.json` 六个文件。

- [ ] **Step 5: 验证迁移包严格限定为苋菜双档案**

运行：

```bash
jq '{scope, wholeDatabaseMigration, ingredientName, recordCounts}' \
  .standard-ingredient-import/2026-07-14-amaranth/amaranth-production-package/manifest.json
rg -n '苋菜|USDA_FDC:168385|USDA_FDC:169202' \
  .standard-ingredient-import/2026-07-14-amaranth/amaranth-production-package/up.sql
```

预期：`scope` 为 `new-standard-ingredient-records-only`、`wholeDatabaseMigration` 为 `false`，且 SQL 只含苋菜、新建营养食品和两条映射。

- [ ] **Step 6: 人工审核迁移包后交由生产发布流程执行**

不得执行 `up.sql`、`prisma migrate`、数据库 restore 或任意生产写命令。交付迁移包、`down.sql` 和审计文件给具备生产发布权限的操作人。
