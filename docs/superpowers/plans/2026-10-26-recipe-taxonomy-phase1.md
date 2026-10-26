# 食谱需求分类（第一阶段）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在管理后台「食谱列表 & 设计」页新增「按需求分类」视图，让运营能把系列归入五个需求分类的节点，并随时调整分类结构。

**Architecture:** 新增三张独立表（分类/节点/归属），与食谱表完全解耦；食谱表一个字段都不改。后端出一个 `RecipeTaxonomyService` + 一个 admin controller；前端出一个视图组件 + 一个归类弹窗，挂在现有 `RecipeDesigner/index.vue` 的模式切换上。

**Tech Stack:** NestJS + Prisma 6 + PostgreSQL（后端）；Vue 3 + Element Plus + Vitest（admin-web）

**Spec:**
- `docs/superpowers/specs/2026-10-26-product-line-and-recipe-naming-design.md`
- `docs/superpowers/specs/2026-10-26-recipe-taxonomy-nodes.md`（节点词典，种子数据的唯一来源）
- `docs/superpowers/specs/../mockups/recipe-taxonomy-prototype.html`（界面原型）

## Global Constraints

- 术语统一：**需求分类**（kind）、**节点**（node）、**归属**（link）。不要用"维度""标签""分组"。
- 五个分类的 code 固定：`MAIN_PROTEIN`、`HEALTH_NEED`、`SCENARIO`、`SEASON`、`PROCESS`。
- **归属只挂叶子节点**；父节点只做汇总，永不接受归属。
- **同一分类内最多一个归属**（数据库唯一约束 + 服务层校验双保险）。
- **跨分类可多挂**，且允许为空。
- 节点 `definition` 必填，长度 ≤ 200 字；为空直接拒绝保存。
- 停用（`DISABLED`）节点保留历史归属，树里收起，不再接受新归属。
- 删除节点只允许「无子节点 + 无归属」时执行，否则拒绝并说明原因。
- **不改 `recipe` / `recipe_series` 表既有字段**，只加关联。
- 数据库字段一律 snake_case（见 `docs/DATABASE_NAMING_CONVENTIONS.md`）。
- 后端验证命令：`cd backend && npx jest <path>`；类型检查用 `npx tsc --noEmit`。
  ⚠️ 该仓库 `tsc` **本来就不干净**（2026-10-26 基线：297 个历史错误，集中在
  `tests/scripts/*` 与营养档案相关用例）。所以验收口径是**本次触碰的文件不新增错误**，
  不是「零错误」，别去修那 297 个。
  **联调期间禁止 `npm run build`**（会删 `dist/` 并杀死本地联调后端）。
- admin-web 验证命令：`cd admin-web && npm run test -- <path>`；类型检查 `npx vue-tsc --noEmit`。
- 提交信息用中文，格式 `feat(recipe-taxonomy): ...`。
- 执行前先建隔离工作区（当前分支 `feature/custom-recipe-delivery-p1` 有未提交改动）。

## Review Focus

- **同一分类一次传入两个节点**（手工调用或批量参数错误）→ 必须整单拒绝并提示，不能写入两条或静默保留最后一条。
- **删除有归属的节点** → 必须拒绝并说明"还有 N 道菜归在这里"，归属不能跟着消失。
- **停用节点后查看列表** → 树里收起，但已归在该节点的卡片仍要显示这个名字，否则运营会以为归类丢了。
- **完全未归类的系列** → 必须出现在「未归类」入口；已归部分分类的，其余分类要以虚线占位显示，不能只是不显示。
- **节点定义留空或超 200 字** → 拒绝保存并指出是哪个字段。
- **批量归类传空数组** → 语义是"清空这些分类的归属"，必须明确而不是当成无操作。

---

### Task 1: 三张表与迁移

**Files:**
- Modify: `backend/prisma/schema.prisma`（文件末尾追加模型；`RecipeSeries` 内加一条反向关系）
- Create: `backend/prisma/migrations/<timestamp>_add_recipe_taxonomy/migration.sql`（由 `prisma migrate dev` 生成）

**Interfaces:**
- Produces: Prisma 模型 `RecipeTaxonomyKind`、`RecipeTaxonomyNode`、`RecipeSeriesTaxonomy`，枚举 `TaxonomyNodeStatus { ACTIVE, DISABLED }`

- [ ] **Step 1: 写模型**

在 `schema.prisma` 末尾追加（字段名严格按此）：

```prisma
enum TaxonomyNodeStatus {
  ACTIVE
  DISABLED

  @@map("taxonomy_node_status")
}

model RecipeTaxonomyKind {
  id        String   @id @default(uuid()) @map("id")
  code      String   @unique @map("code") @db.VarChar(40)
  name      String   @map("name") @db.VarChar(50)
  sort      Int      @default(0) @map("sort")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  nodes RecipeTaxonomyNode[]

  @@map("recipe_taxonomy_kind")
}

model RecipeTaxonomyNode {
  id         String             @id @default(uuid()) @map("id")
  kindId     String             @map("kind_id")
  parentId   String?            @map("parent_id")
  name       String             @map("name") @db.VarChar(50)
  definition String             @map("definition") @db.VarChar(200)
  sort       Int                @default(0) @map("sort")
  status     TaxonomyNodeStatus @default(ACTIVE) @map("status")
  createdAt  DateTime           @default(now()) @map("created_at")
  updatedAt  DateTime           @updatedAt @map("updated_at")

  kind     RecipeTaxonomyKind   @relation(fields: [kindId], references: [id], onDelete: Restrict)
  parent   RecipeTaxonomyNode?  @relation("TaxonomyNodeHierarchy", fields: [parentId], references: [id], onDelete: Restrict)
  children RecipeTaxonomyNode[] @relation("TaxonomyNodeHierarchy")
  links    RecipeSeriesTaxonomy[]

  @@index([kindId, parentId, sort])
  @@index([parentId])
  @@map("recipe_taxonomy_node")
}

model RecipeSeriesTaxonomy {
  id        String   @id @default(uuid()) @map("id")
  seriesId  String   @map("series_id")
  kindId    String   @map("kind_id")
  nodeId    String   @map("node_id")
  createdBy String?  @map("created_by")
  createdAt DateTime @default(now()) @map("created_at")

  series RecipeSeries       @relation(fields: [seriesId], references: [id], onDelete: Cascade)
  node   RecipeTaxonomyNode @relation(fields: [nodeId], references: [id], onDelete: Restrict)

  @@unique([seriesId, kindId])
  @@index([nodeId])
  @@index([kindId])
  @@map("recipe_series_taxonomy")
}
```

在 `RecipeSeries` 模型里加反向关系（放在 `orderDesign` 那行之后）：

```prisma
  taxonomyLinks      RecipeSeriesTaxonomy[]
```

- [ ] **Step 2: 生成迁移**

Run: `cd backend && npx prisma migrate dev --name add_recipe_taxonomy --create-only`
Expected: 生成 `prisma/migrations/<timestamp>_add_recipe_taxonomy/migration.sql`，包含 3 张 `CREATE TABLE` 与 `recipe_series_taxonomy_series_id_kind_id_key` 唯一索引

- [ ] **Step 3: 应用迁移并生成客户端**

Run: `cd backend && npx prisma migrate dev && npx prisma generate`
Expected: `Your database is now in sync with your schema.` 且 `Generated Prisma Client`

- [ ] **Step 4: 校验模型可用**

Run: `cd backend && npx tsc --noEmit`
Expected: 无错误（`prisma.recipeTaxonomyKind` 等可被引用）

- [ ] **Step 5: 提交**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(recipe-taxonomy): add taxonomy kind/node/link tables"
```

---

### Task 2: 节点词典种子

**Files:**
- Create: `backend/src/domain/recipe-taxonomy/taxonomy-seed.data.ts`
- Create: `backend/prisma/seed-recipe-taxonomy.ts`
- Modify: `backend/package.json`（scripts 加两条）
- Test: `backend/tests/domain/recipe-taxonomy/taxonomy-seed.spec.ts`

**Interfaces:**
- Produces:
  - `TAXONOMY_SEED: TaxonomySeedKind[]`，其中
    `interface TaxonomySeedKind { code: string; name: string; sort: number; nodes: TaxonomySeedNode[] }`，
    `interface TaxonomySeedNode { name: string; definition: string; sort: number; children?: TaxonomySeedNode[] }`
  - `TAXONOMY_KIND_CODES: readonly string[]` = `['MAIN_PROTEIN','HEALTH_NEED','SCENARIO','SEASON','PROCESS']`

- [ ] **Step 1: 写数据完整性测试**

```ts
// backend/tests/domain/recipe-taxonomy/taxonomy-seed.spec.ts
import { TAXONOMY_SEED, TAXONOMY_KIND_CODES } from 'src/domain/recipe-taxonomy/taxonomy-seed.data';

const flatten = () => TAXONOMY_SEED.flatMap((k) =>
  k.nodes.flatMap((n) => [{ kind: k.code, ...n }, ...(n.children ?? []).map((c) => ({ kind: k.code, ...c }))]));

describe('需求分类种子数据', () => {
  it('恰好五个分类，code 与约定一致', () => {
    expect(TAXONOMY_SEED.map((k) => k.code)).toEqual([...TAXONOMY_KIND_CODES]);
  });

  it('每个节点都有定义，且不超过 200 字', () => {
    for (const node of flatten()) {
      expect(node.definition.trim().length).toBeGreaterThan(0);
      expect(node.definition.length).toBeLessThanOrEqual(200);
    }
  });

  it('同一分类内节点名不重复', () => {
    for (const kind of TAXONOMY_SEED) {
      const names = kind.nodes.flatMap((n) => [n.name, ...(n.children ?? []).map((c) => c.name)]);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('只有主蛋白和健康需求是两层，其余一层', () => {
    const twoLevel = TAXONOMY_SEED.filter((k) => k.nodes.some((n) => (n.children ?? []).length > 0)).map((k) => k.code);
    expect(twoLevel).toEqual(['MAIN_PROTEIN', 'HEALTH_NEED']);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && npx jest tests/domain/recipe-taxonomy/taxonomy-seed.spec.ts`
Expected: FAIL — `Cannot find module 'src/domain/recipe-taxonomy/taxonomy-seed.data'`

- [ ] **Step 3: 按词典文件逐条录入数据**

把 `docs/superpowers/specs/2026-10-26-recipe-taxonomy-nodes.md` 五节里的节点与定义**原文**录入 `taxonomy-seed.data.ts`：
主蛋白 3 个父节点 + 17 个子节点；健康需求 11 个父节点 + 36 个子节点（「肿瘤」无子节点，直接是一级）；场景 4；季节 6；工艺形态 5。`sort` 用序号（10、20、30…）留出插入空间。

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && npx jest tests/domain/recipe-taxonomy/taxonomy-seed.spec.ts`
Expected: PASS（4 passed）

- [ ] **Step 5: 写 seed 脚本（默认 dry-run）**

`prisma/seed-recipe-taxonomy.ts` 行为：不带 `--apply` 只打印将写入的分类/节点数量与差异；带 `--apply` 才落库。
写入策略：按 `code` upsert 分类；节点按 `(kindId, parentId, name)` 匹配，存在则更新 `definition`/`sort`，不存在则创建；**不删除**任何节点。

- [ ] **Step 6: 注册 npm 脚本**

```json
"seed:recipe-taxonomy": "DATABASE_URL=${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/sevenkitchen} ts-node -r tsconfig-paths/register prisma/seed-recipe-taxonomy.ts",
"seed:recipe-taxonomy:apply": "DATABASE_URL=${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/sevenkitchen} ts-node -r tsconfig-paths/register prisma/seed-recipe-taxonomy.ts --apply"
```

- [ ] **Step 7: 空跑一次确认输出**

Run: `cd backend && npm run seed:recipe-taxonomy`
Expected: 打印 5 个分类、82 个节点（20 主蛋白、47 健康需求、4 场景、6 季节、5 工艺），不写库

- [ ] **Step 8: 提交**

```bash
git add backend/src/domain/recipe-taxonomy backend/prisma/seed-recipe-taxonomy.ts backend/package.json backend/tests/domain/recipe-taxonomy
git commit -m "feat(recipe-taxonomy): add node dictionary and idempotent seed"
```

---

### Task 3: 分类树与计数

**Files:**
- Create: `backend/src/domain/recipe-taxonomy/taxonomy-tree.ts`
- Create: `backend/src/application/recipe-taxonomy/recipe-taxonomy.service.ts`
- Test: `backend/tests/domain/recipe-taxonomy/taxonomy-tree.spec.ts`

**Interfaces:**
- Produces:
```ts
export interface TaxonomyKindRow { id: string; code: string; name: string; sort: number }
export interface TaxonomyNodeRow {
  id: string; kindId: string; parentId: string | null;
  name: string; definition: string; sort: number;
  status: 'ACTIVE' | 'DISABLED';
}
export interface TaxonomyNodeView extends TaxonomyNodeRow {
  seriesCount: number;          // 本节点直接归属数
  rollupSeriesCount: number;    // 含子孙的总数
  children: TaxonomyNodeView[];
}
export interface TaxonomyKindView extends TaxonomyKindRow {
  nodes: TaxonomyNodeView[];
  rollupSeriesCount: number;
}
export function buildTaxonomyTree(
  kinds: TaxonomyKindRow[],
  nodes: TaxonomyNodeRow[],
  directCounts: Record<string, number>,
): TaxonomyKindView[];
```
- `RecipeTaxonomyService.getTree(): Promise<TaxonomyKindView[]>`

- [ ] **Step 1: 写树的测试**

```ts
import { buildTaxonomyTree } from 'src/domain/recipe-taxonomy/taxonomy-tree';

const kinds = [{ id: 'k1', code: 'MAIN_PROTEIN', name: '主蛋白', sort: 10 }];
const nodes = [
  { id: 'n1', kindId: 'k1', parentId: null, name: '鱼类', definition: 'd', sort: 10, status: 'ACTIVE' as const },
  { id: 'n2', kindId: 'k1', parentId: 'n1', name: '三文鱼', definition: 'd', sort: 10, status: 'ACTIVE' as const },
  { id: 'n3', kindId: 'k1', parentId: 'n1', name: '鳕鱼', definition: 'd', sort: 20, status: 'DISABLED' as const },
];

describe('buildTaxonomyTree', () => {
  it('按 parentId 组装两层，并按 sort 升序', () => {
    const tree = buildTaxonomyTree(kinds, nodes, {});
    expect(tree[0].nodes[0].children.map((c) => c.name)).toEqual(['三文鱼', '鳕鱼']);
  });

  it('父节点 rollup 等于子孙直接计数之和', () => {
    const tree = buildTaxonomyTree(kinds, nodes, { n2: 4, n3: 2 });
    expect(tree[0].nodes[0].children.map((c) => c.seriesCount)).toEqual([4, 2]);
    expect(tree[0].nodes[0].rollupSeriesCount).toBe(6);
    expect(tree[0].rollupSeriesCount).toBe(6);
  });

  it('孤儿节点（父不存在）提升为一级，不丢失', () => {
    const tree = buildTaxonomyTree(kinds, [...nodes, { id: 'n9', kindId: 'k1', parentId: 'gone', name: '孤儿', definition: 'd', sort: 5, status: 'ACTIVE' }], {});
    expect(tree[0].nodes.map((n) => n.name)).toContain('孤儿');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && npx jest tests/domain/recipe-taxonomy/taxonomy-tree.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 实现 `buildTaxonomyTree`**

纯函数：按 `kindId` 分组 → 建 map → 挂父子（父不存在的当一级）→ 每层按 `sort` 升序、`sort` 相同时按 `name` → 自底向上累加 `rollupSeriesCount`。不修改入参。

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && npx jest tests/domain/recipe-taxonomy/taxonomy-tree.spec.ts`
Expected: PASS（3 passed）

- [ ] **Step 5: 写服务方法 `getTree`**

在 `recipe-taxonomy.service.ts` 中：并行查 `kind`（按 sort）、`node`（按 sort）、按 `node_id` 分组计数（`recipe_series_taxonomy` 一条记录算一次），传给 `buildTaxonomyTree`。

- [ ] **Step 6: 服务测试**

在 `backend/tests/application/recipe-taxonomy/recipe-taxonomy.service.spec.ts` 用 stub prisma（`jest.fn()`）验证：返回的分类顺序与 sort 一致；计数字典形如 `{ nodeId: number }`。

- [ ] **Step 7: 运行服务测试**

Run: `cd backend && npx jest tests/application/recipe-taxonomy`
Expected: PASS

- [ ] **Step 8: 提交**

```bash
git add backend/src/domain/recipe-taxonomy/taxonomy-tree.ts backend/src/application/recipe-taxonomy backend/tests
git commit -m "feat(recipe-taxonomy): build tree view with rollup counts"
```

---

### Task 4: 归类写入（单道 + 批量）

**Files:**
- Modify: `backend/src/application/recipe-taxonomy/recipe-taxonomy.service.ts`
- Test: `backend/tests/application/recipe-taxonomy/recipe-taxonomy.links.spec.ts`

**Interfaces:**
- Produces:
```ts
replaceSeriesLinks(seriesId: string, nodeIds: string[], actorId: string | null): Promise<void>
batchClassify(seriesIds: string[], nodeIds: string[], actorId: string | null): Promise<{ updated: number }>
```
- 语义：`nodeIds` 表示这些系列在**涉及的每个分类**上的最终状态；某分类不在 `nodeIds` 里 = 不动该分类；`nodeIds` 为空数组 = 清空全部归属。

- [ ] **Step 1: 写失败用例**

```ts
it('同一分类传两个节点直接拒绝', async () => {
  await expect(service.replaceSeriesLinks('s1', ['n-fish', 'n-chicken'], null))
    .rejects.toThrow(BadRequestException);
});

it('传父节点拒绝', async () => {
  await expect(service.replaceSeriesLinks('s1', ['n-parent'], null)).rejects.toThrow(/叶子/);
});

it('停用节点拒绝', async () => {
  await expect(service.replaceSeriesLinks('s1', ['n-disabled'], null)).rejects.toThrow(/停用/);
});

it('清空时只删涉及的分类', async () => {
  await service.replaceSeriesLinks('s1', [], null);
  expect(prisma.recipeSeriesTaxonomy.deleteMany).toHaveBeenCalledWith({ where: { seriesId: 's1' } });
});

it('批量把同一节点写到多个系列', async () => {
  const res = await service.batchClassify(['s1', 's2'], ['n-fish'], null);
  expect(res.updated).toBe(2);
});

it('批量传空数组等于清空这些系列的全部归属', async () => {
  await service.batchClassify(['s1'], [], null);
  expect(prisma.recipeSeriesTaxonomy.deleteMany).toHaveBeenCalledWith({ where: { seriesId: 's1' } });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && npx jest tests/application/recipe-taxonomy/recipe-taxonomy.links.spec.ts`
Expected: FAIL — `replaceSeriesLinks is not a function`

- [ ] **Step 3: 实现**

步骤：①查节点（不存在→400）；②校验 `status === ACTIVE`；③校验无子节点（`count({ where: { parentId: in nodeIds } }) === 0`）；④按 `kindId` 去重校验（同一 kind 出现两次→400，文案「同一分类只能选一个节点」）；⑤事务内 `deleteMany({ seriesId, kindId in [...] })` + `createMany`（`createdBy = actorId`）。
批量：校验一次，循环系列执行同一事务；返回实际更新条数。

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && npx jest tests/application/recipe-taxonomy`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/src/application/recipe-taxonomy backend/tests/application/recipe-taxonomy
git commit -m "feat(recipe-taxonomy): classify series with one-node-per-kind guard"
```

---

### Task 5: 系列查询（按节点 / 未归类）

**Files:**
- Modify: `backend/src/application/recipe-taxonomy/recipe-taxonomy.service.ts`
- Test: `backend/tests/application/recipe-taxonomy/recipe-taxonomy.list.spec.ts`

**Interfaces:**
- Produces:
```ts
export interface ListTaxonomySeriesQuery {
  nodeId?: string; unclassified?: boolean; keyword?: string;
  page?: number; pageSize?: number;
}
export interface TaxonomySeriesItem {
  id: string; name: string; businessStatus: string;
  referenceDogName: string | null; updatedAt: string;
  links: { kindId: string; kindCode: string; kindName: string; nodeId: string; nodeName: string }[];
  missingKindCodes: string[];   // 未归的分类（含 MAIN_PROTEIN），顺序同分类排序
}
listSeries(query: ListTaxonomySeriesQuery): Promise<{ items: TaxonomySeriesItem[]; total: number }>
```
- `unclassified: true` 语义：**没有任何归属**的系列。

- [ ] **Step 1: 写失败用例**

```ts
it('unclassified 只返回零归属的系列', async () => {
  const res = await service.listSeries({ unclassified: true });
  expect(res.items.every((i) => i.links.length === 0)).toBe(true);
  expect(res.items[0].missingKindCodes).toEqual(['MAIN_PROTEIN', 'HEALTH_NEED', 'SCENARIO', 'SEASON', 'PROCESS']);
});

it('已归部分分类时，其余分类出现在 missingKindCodes', async () => {
  const res = await service.listSeries({ nodeId: 'n-fish' });
  expect(res.items[0].missingKindCodes).toEqual(['SCENARIO', 'SEASON', 'PROCESS']);
});

it('父节点查询包含其所有子孙的系列', async () => {
  const res = await service.listSeries({ nodeId: 'n-fish-parent' });
  expect(res.items.map((i) => i.id)).toContain('s-salmon');
});

it('节点被停用后，已有归属的系列仍返回该节点名', async () => {
  const res = await service.listSeries({ nodeId: 'n-disabled' });
  expect(res.items[0].links[0].nodeName).toBe('鳕鱼');
});
```

- [ ] **Step 2: 运行确认失败**

- [ ] **Step 3: 实现**

先查全部分类（用于 `missingKindCodes` 与排序）→ 构造 `where`：
`nodeId` 时先解析该节点及其全部子孙 id（服务内递归，最多两层），再 `where: { series: { taxonomyLinks: { some: { nodeId: { in: ids } } } } }`；
`unclassified` 时 `where: { taxonomyLinks: { none: {} } }`；
`keyword` 时对 `name` 做 `contains`（不区分大小写）。
分页在数据库层（`skip/take` + `count`），`links` 用 `include` 带出 `node.kind`。

- [ ] **Step 4: 运行确认通过**

- [ ] **Step 5: 提交**

```bash
git add backend/src/application/recipe-taxonomy backend/tests/application/recipe-taxonomy
git commit -m "feat(recipe-taxonomy): list series by node and unclassified"
```

---

### Task 6: 接口与注册

**Files:**
- Create: `backend/src/interfaces/controllers/admin-recipe-taxonomy.controller.ts`
- Create: `backend/src/interfaces/dto/recipe-taxonomy/recipe-taxonomy.dto.ts`
- Modify: `backend/src/app.module.ts`（`controllers` 与 `providers` 各加一行）
- Test: `backend/tests/controllers/admin-recipe-taxonomy.controller.spec.ts`

**Interfaces:**
- Produces 路由（全部在 `api/v1/admin/recipe-taxonomy` 下）：
  - `GET /tree` → `{ kinds: TaxonomyKindView[] }`
  - `GET /series?nodeId&unclassified&keyword&page&pageSize` → `{ items, total }`
  - `PUT /series/:seriesId/links` body `{ nodeIds: string[] }`
  - `POST /series/batch-links` body `{ seriesIds: string[]; nodeIds: string[] }`
  - `POST /nodes` body `{ kindId, parentId?, name, definition, sort? }`
  - `PATCH /nodes/:id` body `{ name?, definition?, sort?, status? }`
  - `DELETE /nodes/:id`

- [ ] **Step 1: 写路由契约测试**

断言控制器类上存在这些方法，且装饰器路径与上表一致（用 `Reflect.getMetadata('path', ...)` 读 `@Get/@Put/@Post/@Patch/@Delete`）。

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && npx jest tests/controllers/admin-recipe-taxonomy.controller.spec.ts`

- [ ] **Step 3: 实现控制器**

类级 `@Controller('api/v1/admin/recipe-taxonomy')` 与 `@UseGuards(AuthGuard, StaffGuard)`；
查询类方法继承类级守卫；**写操作方法（PUT/POST/PATCH/DELETE）额外加 `@UseGuards(AdminGuard)`**；
守卫从 `../guards/role.guard` 引入，`AuthGuard` 与 `CurrentUser` 从 `../auth` 引入；
每个返回值统一 `ApiResponseDto.success(...)`。

- [ ] **Step 4: 注册到 `app.module.ts`**

`controllers` 数组加 `AdminRecipeTaxonomyController`，`providers` 数组加 `RecipeTaxonomyService`。

- [ ] **Step 5: 类型检查 + 测试**

Run: `cd backend && npx tsc --noEmit && npx jest tests/controllers/admin-recipe-taxonomy.controller.spec.ts`
Expected: 无类型错误；测试 PASS

- [ ] **Step 6: 提交**

```bash
git add backend/src/interfaces backend/src/app.module.ts backend/tests/controllers
git commit -m "feat(recipe-taxonomy): expose admin taxonomy endpoints"
```

---

### Task 7: 前端 API 与时序契约

**Files:**
- Create: `admin-web/src/api/recipeTaxonomy.ts`
- Create: `admin-web/src/utils/recipeDesigner/taxonomyChips.ts`
- Modify: `admin-web/src/types/recipeDesigner.ts`（追加类型）
- Test: `admin-web/src/utils/recipeDesigner/__tests__/taxonomyChips.spec.ts`
- Test: `admin-web/src/api/recipeTaxonomy.regression.spec.ts`

**Interfaces:**
- Produces:
```ts
// types
export interface TaxonomyNodeView { id: string; kindId: string; parentId: string | null; name: string;
  definition: string; sort: number; status: 'ACTIVE' | 'DISABLED';
  seriesCount: number; rollupSeriesCount: number; children: TaxonomyNodeView[] }
export interface TaxonomyKindView { id: string; code: string; name: string; sort: number;
  nodes: TaxonomyNodeView[]; rollupSeriesCount: number }
export interface TaxonomySeriesItem { id: string; name: string; businessStatus: string;
  referenceDogName: string | null; updatedAt: string;
  links: { kindId: string; kindCode: string; kindName: string; nodeId: string; nodeName: string }[];
  missingKindCodes: string[] }
// api
export const recipeTaxonomyApi = { getTree, listSeries, replaceLinks, batchLinks, createNode, updateNode, deleteNode }
// util
export function buildTaxonomyChips(item: TaxonomySeriesItem, kinds: TaxonomyKindView[]):
  { key: string; label: string; missing: boolean }[]
```

- [ ] **Step 1: 写 chips 单测**

```ts
it('已归分类显示「分类 节点」，未归分类显示虚线占位', () => {
  const chips = buildTaxonomyChips(item, kinds);
  expect(chips.map((c) => c.missing)).toEqual([false, true, false, true, true]);
  expect(chips[0].label).toBe('主蛋白 三文鱼');
  expect(chips[1].label).toBe('健康需求 未归类');
});

it('分类顺序与后端 kind.sort 一致，不受 links 返回顺序影响', () => {
  expect(buildTaxonomyChips(item, kinds).map((c) => c.key))
    .toEqual(['MAIN_PROTEIN', 'HEALTH_NEED', 'SCENARIO', 'SEASON', 'PROCESS']);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd admin-web && npm run test -- src/utils/recipeDesigner/__tests__/taxonomyChips.spec.ts`

- [ ] **Step 3: 实现类型、api、util**

api 全部走 `api.get/post/put/patch/delete`，路径与 Task 6 一一对应。

- [ ] **Step 4: 写接口契约测试（沿用仓库 `?raw` 风格）**

断言 `recipeTaxonomy.ts` 里出现 7 个路径字符串，且 `types/recipeDesigner.ts` 里出现 `missingKindCodes`。

- [ ] **Step 5: 运行全部相关测试**

Run: `cd admin-web && npm run test -- src/utils/recipeDesigner/__tests__/taxonomyChips.spec.ts src/api/recipeTaxonomy.regression.spec.ts`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add admin-web/src/api/recipeTaxonomy.ts admin-web/src/types/recipeDesigner.ts admin-web/src/utils/recipeDesigner
git commit -m "feat(admin-web): add taxonomy api client and chip mapping"
```

---

### Task 8: 「按需求分类」视图

**Files:**
- Create: `admin-web/src/views/RecipeDesigner/components/TaxonomyView.vue`
- Modify: `admin-web/src/views/RecipeDesigner/index.vue`（卡片头加模式切换；两视图互斥渲染）
- Test: `admin-web/src/views/RecipeDesigner/taxonomyView.regression.spec.ts`

**Interfaces:**
- Consumes: Task 7 的 `recipeTaxonomyApi`、`buildTaxonomyChips`、类型
- Produces: 组件 props `{ }, events: none`；暴露 `refresh()` 供父组件在切回时刷新

- [ ] **Step 1: 写回归测试（先钉死结构）**

```ts
import viewSource from '@/views/RecipeDesigner/components/TaxonomyView.vue?raw';
import indexSource from '@/views/RecipeDesigner/index.vue?raw';
it('视图含未归类入口与树/列表两栏', () => {
  expect(viewSource).toContain('未归类');
  expect(viewSource).toContain('el-tree');
  expect(viewSource).toContain('buildTaxonomyChips');
});
it('列表页挂了模式切换', () => {
  expect(indexSource).toContain('按需求分类');
  expect(indexSource).toContain('TaxonomyView');
});
```

- [ ] **Step 2: 运行确认失败**

- [ ] **Step 3: 实现视图**

布局按原型：左 `el-tree`（250px，`node-key="id"`，`default-expand-all=false`），右侧列表。
树顶部固定「未归类」项并显示计数；节点文案为 `name`，右侧显示 `rollupSeriesCount`；`status === 'DISABLED'` 的节点默认折叠进「已停用」分组。
列表项：`name` + 状态标签 + `buildTaxonomyChips` 的 chips + 行尾「归类」。
顶部显示 `共 N 道` 与「批量归类」（有勾选时可用）。

- [ ] **Step 4: 接入 `index.vue`**

在 `.card-header-controls` 末尾加一个 `el-radio-group`：`按系列` / `按需求分类`；新增 `viewMode` ref（默认 `'SERIES'`）；`viewMode === 'TAXONOMY'` 时渲染 `TaxonomyView`，否则渲染现有 `series-grid`。**不改动既有卡片逻辑。**

- [ ] **Step 5: 运行测试 + 类型检查**

Run: `cd admin-web && npm run test -- src/views/RecipeDesigner/taxonomyView.regression.spec.ts && npx vue-tsc --noEmit`
Expected: PASS，无类型错误

- [ ] **Step 6: 提交**

```bash
git add admin-web/src/views/RecipeDesigner
git commit -m "feat(admin-web): add taxonomy view to recipe designer"
```

---

### Task 9: 归类弹窗（单道 + 批量）

**Files:**
- Create: `admin-web/src/views/RecipeDesigner/components/TaxonomyClassifyDialog.vue`
- Modify: `admin-web/src/views/RecipeDesigner/components/TaxonomyView.vue`
- Test: `admin-web/src/views/RecipeDesigner/taxonomyClassify.regression.spec.ts`

**Interfaces:**
- Produces: props
```ts
{
  modelValue: boolean,
  seriesIds: string[],            // 单道传 1 个，批量传 N 个
  seriesName?: string,            // 单道时的标题
  kinds: TaxonomyKindView[],
  initialNodeIds: string[],       // 单道时的现有归属；批量为 []
}
```
- emits: `update:modelValue`、`saved`

- [ ] **Step 1: 写回归测试**

断言组件内含：按分类分组的单选（`el-radio` 或 `type="radio"`）、节点定义展示（`definition`）、`批量` 文案、保存时调用 `replaceLinks`（单道）或 `batchLinks`（多道）。

- [ ] **Step 2: 运行确认失败**

- [ ] **Step 3: 实现弹窗**

按原型：每个分类一块，块内节点单选（`v-model` 用 `nodeIdsByKind: Record<string, string | null>`），节点下方小字显示 `definition`；底部说明「只写归属关系，不改配方、不触发发布」。
保存：`seriesIds.length === 1` → `replaceLinks`；否则 → `batchLinks`。成功后 `emit('saved')` 并关闭。

- [ ] **Step 4: 接到视图**

行内「归类」→ 打开弹窗（传该行 `id`、现有 link 的 `nodeId`）；顶部「批量归类」→ 传选中行 ids。

- [ ] **Step 5: 运行测试 + 类型检查**

- [ ] **Step 6: 提交**

```bash
git add admin-web/src/views/RecipeDesigner
git commit -m "feat(admin-web): classify dialog for single and batch"
```

---

### Task 10: 结构维护（新增 / 改名 / 停用 / 排序）

**Files:**
- Create: `admin-web/src/views/RecipeDesigner/components/TaxonomyNodeDialog.vue`
- Modify: `admin-web/src/views/RecipeDesigner/components/TaxonomyView.vue`
- Test: `backend/tests/application/recipe-taxonomy/recipe-taxonomy.nodes.spec.ts`
- Test: `admin-web/src/views/RecipeDesigner/taxonomyNodeDialog.regression.spec.ts`

**Interfaces:**
- Consumes: `recipeTaxonomyApi.createNode / updateNode / deleteNode`
- 服务新增：`createNode` / `updateNode` / `deleteNode`，并在 Task 4 的校验之外补三条：
  - 定义为空 → 400「节点定义不能为空」
  - 定义 > 200 字 → 400「节点定义不能超过 200 字」
  - 删除有子节点或有归属 → 400「还有 N 道菜归在这里，或该节点下还有子节点」

- [ ] **Step 1: 写服务端失败用例**

```ts
it('定义为空拒绝', async () => {
  await expect(service.createNode({ kindId: 'k1', name: '鱼', definition: '  ' }))
    .rejects.toThrow(/定义不能为空/);
});
it('删除有归属的节点拒绝并报数量', async () => {
  await expect(service.deleteNode('n-with-links')).rejects.toThrow(/还有 3 道菜/);
});
it('停用节点保留归属', async () => {
  await service.updateNode('n1', { status: 'DISABLED' });
  expect(prisma.recipeSeriesTaxonomy.deleteMany).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: 运行确认失败**

- [ ] **Step 3: 实现服务端三个方法**

- [ ] **Step 4: 运行服务测试**

- [ ] **Step 5: 实现前端维护弹窗**

树的每个一级节点 hover 出现「+ 子节点」；节点右键或 hover 出现「编辑」。弹窗字段：名称、定义（必填，显示字数 x/200）、排序；编辑态多一个「停用/启用」开关与「删除」（删除前二次确认并展示后端返回的原因）。

- [ ] **Step 6: 运行前端测试 + 类型检查**

- [ ] **Step 7: 提交**

```bash
git add backend admin-web
git commit -m "feat(recipe-taxonomy): maintain nodes from admin tree"
```

---

## 验收

1. `cd backend && npx jest tests/application/recipe-taxonomy tests/domain/recipe-taxonomy` 全绿
2. `cd admin-web && npm run test` 全绿，`npx vue-tsc --noEmit` 无错误
3. 本地跑 `npm run seed:recipe-taxonomy:apply` 后，页面树上有 5 个分类、82 个节点
4. 把生产库 26 道菜逐道归属一遍：**每道都能归进去**；归不进去的记下来，回到节点维护补节点（这是第二阶段开始前的输入）

---

## 执行记录（2026-10-26 完成）

分支：`feature/recipe-taxonomy-phase1`

| 任务 | 提交 | 结果 |
|---|---|---|
| 1 三张表与迁移 | `e34dd4bf` | ✅ 手写迁移（shadow DB 被 20260109 历史迁移的 P3006 挡住） |
| 2 节点词典种子 | `5acfeb88` | ✅ 82 个节点，幂等；「肿瘤」折叠为一级，与词典同步 |
| 3 分类树与计数 | `f1e44f8f` | ✅ 纯函数 + 服务；测试抓到 rollup 未递归的 bug |
| 4 归类写入 | `b9c774b3` | ✅ 四条校验 + 单道/批量 |
| 5 系列查询 | `39a50e06` | ✅ 含 missingKindCodes；参考爱犬单独查一次 |
| 6 接口与注册 | `ec9ff8f8` | ✅ 7 条路由，写操作限管理员 |
| 7 前端 API | `dcd721ad` | ✅ 7 条路径 + chips 映射 |
| 8 视图 | `c80b02d3` | ✅ 左树右列表 + 未归类入口 |
| 9 归类弹窗 | `c80b02d3` | ✅ 同分类单选、节点定义随行显示 |
| 10 结构维护 | `98f46ba2` | ✅ 仅管理员可见；停用保留归属 |

### 验证证据

- 后端：`npx jest tests/application/recipe-taxonomy tests/domain/recipe-taxonomy tests/controllers/admin-recipe-taxonomy.controller.spec.ts` → **7 suites / 39 tests 全绿**
- 前端：`npx vitest run` → **76 files / 876 tests 全绿**
- 类型：`vue-tsc --noEmit` 无 taxonomy 相关错误；后端 `tsc` 基线 297 个历史错误，本次新增 0
- 本地库端到端（脚本临时运行后已删除）：5 个分类 / 82 节点；22 个未归类系列；把一个系列归到「鱼 · 三文鱼 + 应季」后 `missingKindCodes` 只剩三个；清空后未归类数复原

### 已知与本次无关

`tests/controllers/custom-recipe.customer-batch-delivery.spec.ts` 有 1 个用例失败（交付响应体多字段），在该分支改动之前就存在。

### 下一步（不在本次范围）

把这 26 道已上架菜逐道归档一遍；归不进去的，就是节点词典要补的东西。
