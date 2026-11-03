# 私密食谱分享令牌访问 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让持有有效分享令牌的客户可完整使用未绑定归属的私密食谱 DIY 链路。

**Architecture:** 后端将有效的 `RecipeShareToken` 作为 `PRIVATE_CUSTOM` 的第三种访问授权方式，保留员工和已绑定客户权限。小程序把 `shareToken` 视为页面导航状态，在食谱详情、DIY 配置、制作单接口和制作单页面间连续透传；图片仍由已授权页面本地生成。

**Tech Stack:** NestJS、Prisma、Jest/Supertest、Vue 3、uni-app、Vitest。

---

### Task 1: 后端私密食谱令牌授权

**Files:**
- Modify: `backend/tests/interfaces/controllers/recipes.controller.spec.ts`
- Modify: `backend/src/interfaces/controllers/recipes.controller.ts`

- [ ] **Step 1: 写出失败的接口测试**

在 `RecipesController (e2e)` 中构造一条 `PRIVATE_CUSTOM` 食谱，并令 `mockPrismaService.recipeShareToken.findFirst` 对 `shared-private-token` 返回未过期记录。断言：

```ts
it('allows an unbound private recipe through a valid share token', async () => {
  mockPrismaService.recipeShareToken.findFirst.mockResolvedValue({ id: 'token-row' });

  const response = await request(app.getHttpServer())
    .get('/api/v1/recipes/private-shareable-recipe?shareToken=shared-private-token')
    .expect(200);

  expect(response.body.code).toBe(0);
  expect(mockPrismaService.recipeShareToken.findFirst).toHaveBeenCalledWith({
    where: expect.objectContaining({
      token: 'shared-private-token',
      expiresAt: { gt: expect.any(Date) },
    }),
  });
});
```

再增加 `POST /api/v1/recipes/:id/diy-sheet` 使用同一令牌成功的测试，以及无令牌时保持 404 的测试。

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- --runInBand tests/interfaces/controllers/recipes.controller.spec.ts`

Expected: 新的有效令牌私密食谱请求返回 404，因为当前 `getAccessibleRecipe` 在 `PRIVATE_CUSTOM` 分支直接拒绝非归属客户。

- [ ] **Step 3: 实现最小授权改动**

在 `backend/src/interfaces/controllers/recipes.controller.ts` 的 `getAccessibleRecipe` 中，保留员工和归属客户通过的分支，并在其余 `PRIVATE_CUSTOM` 请求时调用既有 `hasRestrictedRecipeAccess(id, shareToken, req)`：

```ts
if (recipe.status === RecipeStatus.PRIVATE_CUSTOM) {
  const user = this.getRequestUser(req);
  if (user && (user.role === 'STAFF' || user.role === 'ADMIN' ||
      recipe.customerOwnerId === (user.customerId || user.userId))) {
    return recipe;
  }

  return (await this.hasRestrictedRecipeAccess(id, shareToken, req))
    ? recipe
    : null;
}
```

不改变令牌生成接口及 30 天有效期。

- [ ] **Step 4: 运行后端测试并确认通过**

Run: `npm test -- --runInBand tests/interfaces/controllers/recipes.controller.spec.ts`

Expected: 退出码 0；有效令牌的 GET 与制作单 POST 成功，无令牌请求仍为 404。

### Task 2: DIY 页面链路携带令牌

**Files:**
- Modify: `miniapp/src/pages/recipe-detail/index.vue`
- Modify: `miniapp/src/pages/recipe-diy/index.vue`
- Modify: `miniapp/src/pages/diy-sheet/index.vue`
- Modify: `miniapp/src/pages/recipe-detail.regression.spec.ts`
- Modify: `miniapp/src/pages/diy-sheet.regression.spec.ts`
- Create: `miniapp/src/pages/recipe-diy.regression.spec.ts`

- [ ] **Step 1: 写出失败的页面回归测试**

新增/扩展静态源码测试，要求：

```ts
expect(recipeDetailSource).toContain("query.push(`shareToken=${encodeURIComponent(shareToken.value)}`)")
expect(recipeDiySource).toContain("shareToken.value = options.shareToken || ''")
expect(recipeDiySource).toContain('shareToken: shareToken.value')
expect(recipeDiySource).toContain('shareToken: shareToken.value,')
expect(diySheetSource).toContain("shareToken.value = options.shareToken || ''")
expect(diySheetSource).toContain('shareToken: shareToken.value')
expect(diySheetSource).toContain('shareToken=${encodeURIComponent(shareToken.value)}')
```

测试只在令牌非空时要求加入查询参数，避免公开食谱 URL 变化。

- [ ] **Step 2: 运行小程序测试并确认失败**

Run: `npm test -- --run src/pages/recipe-detail.regression.spec.ts src/pages/recipe-diy.regression.spec.ts src/pages/diy-sheet.regression.spec.ts`

Expected: 新增断言失败，因为 DIY 配置和制作单页面目前没有读取或传递令牌。

- [ ] **Step 3: 实现详情页到 DIY 配置页的令牌透传**

在 `generateDiySheet()` 中，当 `shareToken.value` 非空时向现有 `query` 添加：

```ts
query.push(`shareToken=${encodeURIComponent(shareToken.value)}`)
```

- [ ] **Step 4: 实现 DIY 配置页到制作单接口/页面的透传**

在 `recipe-diy/index.vue`：

```ts
const shareToken = ref('')
// onMounted
shareToken.value = options.shareToken || ''
```

构建详情请求参数时合并 `lifeStage` 与非空令牌。调用 `/recipes/:id/diy-sheet` 时仅在令牌非空时将其加入请求体。`navigateToSheet()` 的参数对象在令牌非空时加入 `shareToken`，再由现有编码循环构造 URL。

- [ ] **Step 5: 实现制作单页令牌读取、加载和分享保留**

在 `diy-sheet/index.vue` 增加 `const shareToken = ref('')`，并在 `onMounted` 从 `options.shareToken` 读取。`loadRecipe()` 的 GET 请求在令牌存在时传入 `{ shareToken: shareToken.value }`。`sharePath` 和 `onShareTimeline` 的 query 在令牌存在时追加 URL 编码后的令牌。不要把令牌传入 `/user/diy-sheets` 保存数据。

- [ ] **Step 6: 运行小程序回归测试并确认通过**

Run: `npm test -- --run src/pages/recipe-detail.regression.spec.ts src/pages/recipe-diy.regression.spec.ts src/pages/diy-sheet.regression.spec.ts`

Expected: 退出码 0；新断言与已有页面回归测试均通过。

### Task 3: 完整验证

**Files:**
- Verify: `backend/tests/interfaces/controllers/recipes.controller.spec.ts`
- Verify: `miniapp/src/pages/recipe-detail.regression.spec.ts`
- Verify: `miniapp/src/pages/recipe-diy.regression.spec.ts`
- Verify: `miniapp/src/pages/diy-sheet.regression.spec.ts`

- [ ] **Step 1: 运行针对性后端测试**

Run: `npm test -- --runInBand tests/interfaces/controllers/recipes.controller.spec.ts`

Expected: 退出码 0。

- [ ] **Step 2: 运行针对性小程序测试**

Run: `npm test -- --run src/pages/recipe-detail.regression.spec.ts src/pages/recipe-diy.regression.spec.ts src/pages/diy-sheet.regression.spec.ts`

Expected: 退出码 0。

- [ ] **Step 3: 构建小程序**

Run: `npm run build:mp-weixin`

Expected: 退出码 0，生成微信小程序构建产物。

- [ ] **Step 4: 审阅变更范围**

Run: `git diff --check && git diff -- backend/src/interfaces/controllers/recipes.controller.ts backend/tests/interfaces/controllers/recipes.controller.spec.ts miniapp/src/pages/recipe-detail/index.vue miniapp/src/pages/recipe-diy/index.vue miniapp/src/pages/diy-sheet/index.vue miniapp/src/pages/recipe-detail.regression.spec.ts miniapp/src/pages/recipe-diy.regression.spec.ts miniapp/src/pages/diy-sheet.regression.spec.ts`

Expected: `git diff --check` 无输出；变更仅覆盖规格中的授权和令牌透传范围。
