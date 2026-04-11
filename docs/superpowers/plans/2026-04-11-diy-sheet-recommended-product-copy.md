# DIY 制作单推荐商品文案统一 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一 DIY 制作单页面、弹窗和生成图片中的“推荐商品”相关文案，并用可测试的页面级常量避免再次漂移。

**Architecture:** 在 `miniapp/src/pages/diy-sheet/` 目录下新增一个轻量文案模块，导出页面表头、弹窗标题和购买标签等常量；`index.vue` 改为复用这些常量，保证页面 DOM 和打印表格共享同一套文案。测试只覆盖常量导出值，避免把页面渲染测试做得过重。

**Tech Stack:** Vue 3 `script setup`, TypeScript, uni-app, Vitest

---

### Task 1: 为 DIY 制作单文案模块写失败测试

**Files:**
- Create: `miniapp/src/pages/diy-sheet/copy.spec.ts`
- Create: `miniapp/src/pages/diy-sheet/copy.ts`
- Test: `miniapp/src/pages/diy-sheet/copy.spec.ts`

- [ ] **Step 1: 写出失败测试，锁定“推荐商品”统一文案**

```ts
import { describe, expect, it } from 'vitest'
import {
  DIY_SHEET_FOOD_RECOMMENDATION_LABEL,
  DIY_SHEET_SUPPLEMENT_RECOMMENDATION_LABEL,
  DIY_SHEET_SPEC_MODAL_TITLE,
  DIY_SHEET_PURCHASE_LABEL
} from './copy'

describe('diy-sheet copy', () => {
  it('uses 推荐商品 for all diy sheet recommendation labels', () => {
    expect(DIY_SHEET_FOOD_RECOMMENDATION_LABEL).toBe('推荐商品')
    expect(DIY_SHEET_SUPPLEMENT_RECOMMENDATION_LABEL).toBe('推荐商品')
    expect(DIY_SHEET_SPEC_MODAL_TITLE).toBe('推荐商品')
    expect(DIY_SHEET_PURCHASE_LABEL).toBe('推荐商品')
  })
})
```

- [ ] **Step 2: 运行测试，确认它因为缺少模块而失败**

Run: `npm test -- src/pages/diy-sheet/copy.spec.ts`
Expected: FAIL，报错类似 `Failed to resolve import "./copy"` 或找不到导出

- [ ] **Step 3: 提交测试骨架**

```bash
git add miniapp/src/pages/diy-sheet/copy.spec.ts
git commit -m "test: cover diy sheet recommended product copy"
```

### Task 2: 实现文案常量模块并接入 DIY 制作单页面

**Files:**
- Create: `miniapp/src/pages/diy-sheet/copy.ts`
- Modify: `miniapp/src/pages/diy-sheet/index.vue`
- Test: `miniapp/src/pages/diy-sheet/copy.spec.ts`

- [ ] **Step 1: 实现页面级文案常量模块**

```ts
export const DIY_SHEET_FOOD_RECOMMENDATION_LABEL = '推荐商品'
export const DIY_SHEET_SUPPLEMENT_RECOMMENDATION_LABEL = '推荐商品'
export const DIY_SHEET_SPEC_MODAL_TITLE = '推荐商品'
export const DIY_SHEET_PURCHASE_LABEL = '推荐商品'
```

- [ ] **Step 2: 在 `index.vue` 中导入常量并替换页面表头、弹窗标题和购买标签**

```ts
import {
  DIY_SHEET_FOOD_RECOMMENDATION_LABEL,
  DIY_SHEET_SUPPLEMENT_RECOMMENDATION_LABEL,
  DIY_SHEET_SPEC_MODAL_TITLE,
  DIY_SHEET_PURCHASE_LABEL
} from './copy'
```

```vue
<text class="header-item recommend-col">{{ DIY_SHEET_FOOD_RECOMMENDATION_LABEL }}</text>
<text class="header-item brand-col">{{ DIY_SHEET_SUPPLEMENT_RECOMMENDATION_LABEL }}</text>
<text class="spec-title">{{ DIY_SHEET_SPEC_MODAL_TITLE }}</text>
<text class="spec-label">{{ DIY_SHEET_PURCHASE_LABEL }}：</text>
```

- [ ] **Step 3: 替换生成图片中的表格表头，复用同一套常量**

```ts
builder.drawTable(
  ['原料名称', DIY_SHEET_FOOD_RECOMMENDATION_LABEL, '制备方法', '采购量'],
  foodRows,
  { /* existing options */ }
)

builder.drawTable(
  ['补剂名称', DIY_SHEET_SUPPLEMENT_RECOMMENDATION_LABEL, '规格', '最佳添加时机', '添加总量', '营养素', '营养素总量'],
  supplementRows,
  { /* existing options */ }
)
```

- [ ] **Step 4: 运行聚焦测试，确认新常量模块通过**

Run: `npm test -- src/pages/diy-sheet/copy.spec.ts`
Expected: PASS，显示 `1 passed`

- [ ] **Step 5: 运行现有 DIY 页面回归测试，确保没有引入页面级回归**

Run: `npm test -- src/pages/home.regression.spec.ts src/pages/recipe-stats.regression.spec.ts`
Expected: PASS，相关用例全部通过

- [ ] **Step 6: 提交实现**

```bash
git add miniapp/src/pages/diy-sheet/copy.ts miniapp/src/pages/diy-sheet/copy.spec.ts miniapp/src/pages/diy-sheet/index.vue
git commit -m "feat: unify diy sheet recommended product copy"
```
