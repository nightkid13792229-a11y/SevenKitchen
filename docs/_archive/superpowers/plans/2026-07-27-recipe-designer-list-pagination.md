# 食谱设计器列表分页与首屏优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让生产端食谱设计器优先显示最新 20 条系列卡片，并在触底时按页继续加载，避免首屏读取所有草稿及原料明细。

**Architecture:** 后端系列查询改为按系列字段分页并仅选择卡片计算所需的摘要字段，使用草稿原料计数替代原料数组。接口返回页元数据；小程序保留当前列表并在触底时请求并追加下一页，筛选或回到页面时从第 1 页刷新。

**Tech Stack:** NestJS、Prisma/PostgreSQL、Jest、uni-app/Vue 3、Vitest。

---

## 文件结构

- `backend/src/interfaces/dto/recipe-designer/recipe-designer.dto.ts`：定义安全的页码和页大小参数。
- `backend/src/application/recipe-designer/recipe-designer.service.ts`：构造轻量、排序稳定的分页查询并返回分页元数据。
- `backend/prisma/schema.prisma` 与新 migration：增加服务端筛选及排序使用的复合索引。
- `backend/tests/application/recipe-designer/recipe-designer.service.spec.ts`：锁定查询字段、分页和卡片语义。
- `miniapp/src/api/recipe-designer.ts`：暴露分页查询和分页响应类型。
- `miniapp/src/api/recipe-designer.spec.ts`：锁定客户端请求参数。
- `miniapp/src/pages/recipe-designer/list.vue`：首次加载、触底追加、筛选刷新及尾部状态。
- `miniapp/src/pages/recipe-designer.regression.spec.ts`：锁定页面的渐进加载行为。

### Task 1: 后端分页 DTO 与服务回归测试

**Files:**
- Modify: `backend/src/interfaces/dto/recipe-designer/recipe-designer.dto.ts`
- Modify: `backend/tests/application/recipe-designer/recipe-designer.service.spec.ts`

- [ ] **Step 1: 写出失败的分页查询测试**

在现有 `recipe designer series workbench` 测试组新增用例，模拟 21 条系列记录并调用：

```ts
await service.listSeries(adminAccess, { page: 2, pageSize: 20 });

expect(prisma.recipeSeries.findMany).toHaveBeenCalledWith(
  expect.objectContaining({
    skip: 20,
    take: 21,
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
  }),
);
expect(result).toEqual(expect.objectContaining({
  page: 2,
  pageSize: 20,
  hasMore: true,
  items: expect.any(Array),
}));
```

另加状态筛选测试，调用 `{ status: 'PUBLIC' }` 并断言 `where.businessStatus === 'PUBLIC'`，以及轻量字段测试，断言 designs 查询含 `_count: { select: { items: true } }`、不含 `complianceStatus` 与 `assessmentSummary`。

- [ ] **Step 2: 运行后端单测并确认失败原因是尚未实现分页**

Run: `pnpm --dir backend exec jest tests/application/recipe-designer/recipe-designer.service.spec.ts --runInBand`

Expected: 新增断言失败，提示查询没有 `skip`／`take` 或返回值不是含 `items` 的分页对象。

- [ ] **Step 3: 扩展列表查询 DTO**

在 `ListRecipeDesignerSeriesDto` 添加：

```ts
@IsOptional()
@Type(() => Number)
@IsNumber()
@Min(1)
page?: number;

@IsOptional()
@Type(() => Number)
@IsNumber()
@Min(1)
@Max(50)
pageSize?: number;
```

同时从 `class-validator` 导入 `Max`。

- [ ] **Step 4: 实现轻量分页查询**

在 `RecipeDesignerService`：

```ts
const page = query.page ?? 1;
const pageSize = query.pageSize ?? 20;
const records = await this.prisma.recipeSeries.findMany({
  where: { ...(await this.buildSeriesVisibilityWhere(context)), ...(query.status ? { businessStatus: query.status } : {}) },
  select: RECIPE_SERIES_LIST_SELECT,
  orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
  skip: (page - 1) * pageSize,
  take: pageSize + 1,
});
const hasMore = records.length > pageSize;
const series = hasMore ? records.slice(0, pageSize) : records;
```

定义专用的 `RECIPE_SERIES_LIST_SELECT`：草稿取构建阶段状态和修订比较需要的标量字段，加 `_count.items`；食谱取构建阶段状态、跳转 ID 与更新时间的标量字段。将 `hasDesignRecipeItems` 改为识别 `_count.items > 0`，保留兼容已有包含 `items` 的内部调用。最终返回 `{ items, page, pageSize, hasMore }`。

- [ ] **Step 5: 运行后端单测并确认通过**

Run: `pnpm --dir backend exec jest tests/application/recipe-designer/recipe-designer.service.spec.ts --runInBand`

Expected: exit code 0，所有 `RecipeDesignerService` 测试通过。

- [ ] **Step 6: 提交后端行为与测试**

```bash
git add backend/src/interfaces/dto/recipe-designer/recipe-designer.dto.ts backend/src/application/recipe-designer/recipe-designer.service.ts backend/tests/application/recipe-designer/recipe-designer.service.spec.ts
git commit -m "feat(recipe-designer): paginate lightweight series list"
```

### Task 2: 数据库索引 migration

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260727000000_recipe_series_list_pagination_index/migration.sql`
- Test: `backend/tests/prisma/recipe-designer-local-repair.spec.ts`

- [ ] **Step 1: 写出失败的 schema/migration 断言**

在现有 Prisma 测试或新增针对 migration 的测试中读取 schema 与 migration 内容，断言它们包含：

```ts
expect(schema).toContain('@@index([createdBy, status, businessStatus, updatedAt])');
expect(migration).toContain('CREATE INDEX IF NOT EXISTS "recipe_series_created_by_status_business_status_updated_at_idx"');
```

- [ ] **Step 2: 运行该 Prisma 测试并确认失败**

Run: `pnpm --dir backend exec jest tests/prisma/recipe-designer-local-repair.spec.ts --runInBand`

Expected: 新增索引断言失败，因为 schema 和 migration 尚未包含该索引。

- [ ] **Step 3: 添加 Prisma schema 索引及 migration**

在 `RecipeSeries` 模型添加：

```prisma
@@index([createdBy, status, businessStatus, updatedAt])
```

创建 migration，使用：

```sql
CREATE INDEX IF NOT EXISTS "recipe_series_created_by_status_business_status_updated_at_idx"
  ON "recipe_series"("created_by", "status", "business_status", "updated_at" DESC);
```

- [ ] **Step 4: 重新运行 Prisma 测试**

Run: `pnpm --dir backend exec jest tests/prisma/recipe-designer-local-repair.spec.ts --runInBand`

Expected: exit code 0。

- [ ] **Step 5: 提交索引变更**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260727000000_recipe_series_list_pagination_index/migration.sql backend/tests/prisma/recipe-designer-local-repair.spec.ts
git commit -m "perf(recipe-designer): index paginated series list"
```

### Task 3: 小程序 API 分页契约

**Files:**
- Modify: `miniapp/src/api/recipe-designer.ts`
- Modify: `miniapp/src/api/recipe-designer.spec.ts`

- [ ] **Step 1: 写出失败的 API 参数测试**

在系列端点测试中调用：

```ts
recipeDesignerApi.listSeries({ status: 'PUBLIC', page: 2, pageSize: 20 });
```

断言第一个请求的 `data` 等于 `{ status: 'PUBLIC', page: 2, pageSize: 20 }`；再新增 TypeScript 赋值，证明响应可被声明为：

```ts
const response: RecipeDesignerSeriesListResponse = {
  items: [], page: 1, pageSize: 20, hasMore: false,
};
```

- [ ] **Step 2: 运行 API 测试并确认失败**

Run: `pnpm --dir miniapp test -- src/api/recipe-designer.spec.ts`

Expected: 类型或请求断言失败，因为现有查询类型不含分页字段／响应类型不存在。

- [ ] **Step 3: 添加 API 类型**

扩展 `RecipeDesignerSeriesListQuery`：

```ts
page?: number;
pageSize?: number;
```

并导出：

```ts
export type RecipeDesignerSeriesListResponse = {
  items: Array<RecipeDesignerSeriesCard | RecipeDesignerCustomerSeriesCard>;
  page: number;
  pageSize: number;
  hasMore: boolean;
};
```

保持 `listSeries` 的请求写法不变，让调用端只需传入查询对象。

- [ ] **Step 4: 运行 API 测试并确认通过**

Run: `pnpm --dir miniapp test -- src/api/recipe-designer.spec.ts`

Expected: exit code 0。

- [ ] **Step 5: 提交 API 契约变更**

```bash
git add miniapp/src/api/recipe-designer.ts miniapp/src/api/recipe-designer.spec.ts
git commit -m "feat(miniapp): add recipe series pagination contract"
```

### Task 4: 小程序首屏与触底追加

**Files:**
- Modify: `miniapp/src/pages/recipe-designer/list.vue`
- Modify: `miniapp/src/pages/recipe-designer.regression.spec.ts`

- [ ] **Step 1: 写出失败的列表页回归测试**

在 `recipe-designer.regression.spec.ts` 的列表加载测试中断言页面源码包含：

```ts
expect(listSource).toContain("import { onReachBottom, onShow } from '@dcloudio/uni-app'")
expect(listSource).toContain('const RECIPE_SERIES_PAGE_SIZE = 20')
expect(loadSeriesBlock).toContain('page: targetPage')
expect(loadSeriesBlock).toContain('pageSize: RECIPE_SERIES_PAGE_SIZE')
expect(listSource).toContain('onReachBottom(() => {')
expect(listSource).toContain('void loadSeries({ append: true })')
expect(listSource).toContain('hasMoreSeries.value')
expect(listSource).toContain('series.value = [...series.value, ...items]')
```

- [ ] **Step 2: 运行回归测试并确认失败**

Run: `pnpm --dir miniapp test -- src/pages/recipe-designer.regression.spec.ts`

Expected: 新增断言失败，因为页面尚未实现分页状态和触底加载。

- [ ] **Step 3: 实现列表加载状态与分页解析**

在 `list.vue` 新增 `RECIPE_SERIES_PAGE_SIZE`、`currentPage`、`hasMoreSeries`、`loadingMoreSeries`。将 `loadSeries` 设计为：

```ts
async function loadSeries(options: { append?: boolean } = {}) {
  const append = options.append === true;
  if (append && (!hasMoreSeries.value || loadingMoreSeries.value)) return;
  const targetPage = append ? currentPage.value + 1 : 1;
  // 首屏只设置 loading；追加页只设置 loadingMoreSeries
  const res = await recipeDesignerApi.listSeries({
    status: selectedSeriesStatusFilter.value || undefined,
    page: targetPage,
    pageSize: RECIPE_SERIES_PAGE_SIZE,
  });
  const payload = res?.data ?? res;
  const items = Array.isArray(payload) ? payload : payload?.items || [];
  series.value = append ? [...series.value, ...items] : items;
  currentPage.value = targetPage;
  hasMoreSeries.value = Array.isArray(payload) ? false : Boolean(payload?.hasMore);
}
```

失败时，首屏保留现有 toast；追加失败保留已经显示的 `series`，并把 `hasMoreSeries` 维持为真供用户再次触底。响应中的数组分支仅用于部署时兼容旧服务。

- [ ] **Step 4: 实现触底行为与非阻塞状态提示**

导入 `onReachBottom` 并注册：

```ts
onReachBottom(() => {
  void loadSeries({ append: true });
});
```

在两个列表容器后增加一个仅在 `loadingMoreSeries` 时显示的尾部“加载更多食谱…”提示；首屏加载条件仅为 `loading && series.length === 0`，从而不会在加载下一页时遮挡已有卡片。筛选切换调用 `loadSeries()`，从第 1 页替换列表。

- [ ] **Step 5: 运行小程序回归与 API 测试并确认通过**

Run: `pnpm --dir miniapp test -- src/pages/recipe-designer.regression.spec.ts src/api/recipe-designer.spec.ts`

Expected: exit code 0。

- [ ] **Step 6: 提交小程序渐进加载**

```bash
git add miniapp/src/pages/recipe-designer/list.vue miniapp/src/pages/recipe-designer.regression.spec.ts
git commit -m "perf(miniapp): load recipe series incrementally"
```

### Task 5: 全量验证

**Files:**
- Verify only: 后端和小程序改动。

- [ ] **Step 1: 执行后端相关测试**

Run: `pnpm --dir backend exec jest tests/application/recipe-designer/recipe-designer.service.spec.ts tests/interfaces/controllers/recipe-designer.controller.spec.ts --runInBand`

Expected: exit code 0。

- [ ] **Step 2: 执行小程序完整测试**

Run: `pnpm --dir miniapp test`

Expected: exit code 0。

- [ ] **Step 3: 执行微信小程序发布构建**

Run: `pnpm --dir miniapp build:mp-weixin`

Expected: exit code 0，构建产物位于 `miniapp/dist/build/mp-weixin`。

- [ ] **Step 4: 核对变更范围并提交验证修正（如有）**

Run: `git status --short && git diff --check`

Expected: 仅包含本计划中的后端、Prisma 与小程序文件；没有空白错误。
