# Recipe Cover Title Badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the heavy recipe cover title treatment on the miniapp home recipe cards with a subtle bottom-left cover topic badge.

**Architecture:** Keep the existing home recipe card component inline in `pages/home/index.vue`. Treat `recipe.coverTitle` as optional display metadata: render it only when the card has a real `displayCoverUrl`, and keep the full recipe name in the info section as the primary title.

**Tech Stack:** Vue 3 single-file component, uni-app miniapp markup, scoped CSS, Vitest static regression checks.

---

### Task 1: Add Static Regression Coverage

**Files:**
- Modify: `miniapp/src/pages/home.regression.spec.ts`

- [ ] **Step 1: Write the failing test**

Add this test inside the existing `describe('home runtime regressions', () => { ... })` block:

```ts
  it('renders recipe cover titles as subtle bottom badges only when a real cover image exists', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/home/index.vue'),
      'utf-8',
    )

    expect(source).toContain('coverTitle?: string')
    expect(source).toContain('v-if="recipe.displayCoverUrl && recipe.coverTitle"')
    expect(source).toContain('class="recipe-cover-badge-gradient"')
    expect(source).toContain('class="recipe-cover-title-badge"')
    expect(source).toContain('{{ recipe.coverTitle }}')
    expect(source).toContain('.recipe-cover-badge-gradient')
    expect(source).toContain('.recipe-cover-title-badge')
    expect(source).not.toContain('class="cover-title-overlay"')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd miniapp && npm test -- src/pages/home.regression.spec.ts
```

Expected: FAIL because `coverTitle?: string` and the new badge classes are not present in `src/pages/home/index.vue`.

### Task 2: Implement Home Card Badge

**Files:**
- Modify: `miniapp/src/pages/home/index.vue`

- [ ] **Step 1: Add the template structure**

Inside `.recipe-cover-wrapper`, after the existing `image` / placeholder branch, add:

```vue
          <view
            v-if="recipe.displayCoverUrl && recipe.coverTitle"
            class="recipe-cover-badge-gradient"
          >
            <text class="recipe-cover-title-badge">{{ recipe.coverTitle }}</text>
          </view>
```

- [ ] **Step 2: Add the optional field to the Recipe interface**

In `interface Recipe`, add:

```ts
  coverTitle?: string
```

- [ ] **Step 3: Add scoped styles**

After the `.recipe-cover.placeholder` / `.placeholder-text` styles, add:

```css
.recipe-cover-badge-gradient {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: flex-end;
  padding: 56rpx 24rpx 20rpx;
  box-sizing: border-box;
  pointer-events: none;
  background: linear-gradient(
    180deg,
    rgba(20, 18, 16, 0) 0%,
    rgba(20, 18, 16, 0.18) 52%,
    rgba(20, 18, 16, 0.34) 100%
  );
}

.recipe-cover-title-badge {
  max-width: 340rpx;
  padding: 8rpx 16rpx;
  border-radius: 8rpx;
  background: rgba(32, 29, 25, 0.58);
  color: #fff;
  font-size: 24rpx;
  font-weight: 500;
  line-height: 32rpx;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  box-shadow: 0 4rpx 14rpx rgba(0, 0, 0, 0.16);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd miniapp && npm test -- src/pages/home.regression.spec.ts
```

Expected: PASS.

### Task 3: Verify Build and Review Diff

**Files:**
- Review: `miniapp/src/pages/home/index.vue`
- Review: `miniapp/src/pages/home.regression.spec.ts`
- Review: `docs/superpowers/plans/2026-04-26-recipe-cover-title-badge.md`

- [ ] **Step 1: Run the miniapp build**

Run:

```bash
cd miniapp && npm run build:mp-weixin
```

Expected: command exits 0.

- [ ] **Step 2: Review final diff**

Run:

```bash
git diff -- miniapp/src/pages/home/index.vue miniapp/src/pages/home.regression.spec.ts docs/superpowers/plans/2026-04-26-recipe-cover-title-badge.md
```

Expected: diff only contains the cover badge implementation, the regression test, and this plan.

- [ ] **Step 3: Commit**

Run:

```bash
git add docs/superpowers/plans/2026-04-26-recipe-cover-title-badge.md miniapp/src/pages/home.regression.spec.ts miniapp/src/pages/home/index.vue
git commit -m "feat: refine recipe cover title badges"
```
