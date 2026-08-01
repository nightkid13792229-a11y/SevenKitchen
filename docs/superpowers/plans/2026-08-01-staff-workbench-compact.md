# Compact Staff Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the vertical staff workbench with a compact overview-first nine-grid and move refund review discovery into the administrator order workflow.

**Architecture:** The existing workbench summary API remains the only homepage data source; its administrator refund count is folded into the order badge rather than exposed as a separate module. The Vue page renders a typed, declarative list of modules so every entry has one source of truth for icon, navigation, visibility, and badge. The order list remains the single surface for order and refund-review discovery, while the existing backend refund-review endpoint and order-detail refund controls remain unchanged.

**Tech Stack:** Uni-app, Vue 3 Composition API, TypeScript, SCSS, Vitest, NestJS, Prisma, Jest.

---

## File structure

- Modify `backend/src/interfaces/controllers/staff-workbench.controller.ts`: merge the administrator’s refund-review count into `badges.orders` and remove the `refunds` summary field.
- Create `backend/tests/interfaces/controllers/staff-workbench.controller.spec.ts`: unit-test staff and administrator summary aggregation using a mocked Prisma service.
- Modify `miniapp/src/pages/staff-workbench/index.vue`: replace Banner and vertical cards with overview-first three-column grid driven by module metadata.
- Create `miniapp/src/pages/staff-workbench.regression.spec.ts`: source-level and asset regression coverage for the compact workbench.
- Modify `miniapp/src/pages/staff-orders/index.vue`: make “售后中” clearly expose the administrator refund-review queue without bypassing existing authorization.
- Create `miniapp/src/static/ui-icons/customers.png` and `miniapp/src/static/ui-icons/recipe-designer.png`: two 64×64 transparent, single-colour PNGs matching the existing workbench icon family.
- Modify `miniapp/src/pages.json`: unregister the now-unlinked `staff-refunds` page after the order-flow replacement is verified.
- Delete `miniapp/src/pages/staff-refunds/index.vue`: remove the redundant refund-only surface after its workflow remains reachable through orders.

### Task 1: Define and test the summary contract

**Files:**
- Create: `backend/tests/interfaces/controllers/staff-workbench.controller.spec.ts`
- Modify: `backend/src/interfaces/controllers/staff-workbench.controller.ts`

- [ ] **Step 1: Write the failing controller contract tests**

Create the controller with a `PrismaService` mock whose `count` calls resolve in the controller’s current `Promise.all` order. Assert that an administrator receives the order queue plus refund queue in one field, while staff receives only the order queue.

```ts
import { StaffWorkbenchController } from '../../../src/interfaces/controllers/staff-workbench.controller'

describe('StaffWorkbenchController summary', () => {
  const createController = () => {
    const prisma = {
      order: { count: jest.fn().mockResolvedValueOnce(12).mockResolvedValueOnce(5).mockResolvedValueOnce(5).mockResolvedValueOnce(2) },
      purchaseList: { count: jest.fn().mockResolvedValue(3) },
      packagingUnit: { count: jest.fn().mockResolvedValue(5) },
      reimbursement: { count: jest.fn().mockResolvedValue(1) },
      inventoryStocktake: { count: jest.fn().mockResolvedValue(6) },
    }
    return new StaffWorkbenchController(prisma as any)
  }

  it('folds pending refunds into the administrator order badge exactly once', async () => {
    const controller = createController()
    const response = await controller.getSummary('admin-1', 'ADMIN')
    expect(response.data.badges).toEqual({ purchasing: 3, production: 5, orders: 7, reimbursement: 1, inventory: 6 })
    expect(response.data.pendingTasks).toBe(22)
  })

  it('does not expose refund work to staff', async () => {
    const controller = createController()
    const response = await controller.getSummary('staff-1', 'STAFF')
    expect(response.data.badges.orders).toBe(5)
    expect(response.data.pendingTasks).toBe(20)
    expect(response.data.badges).not.toHaveProperty('refunds')
  })
})
```

- [ ] **Step 2: Run the new test to verify it fails**

Run: `cd backend && npm test -- --runInBand tests/interfaces/controllers/staff-workbench.controller.spec.ts`

Expected: FAIL because `badges.refunds` still exists and `badges.orders` does not include approved refunds.

- [ ] **Step 3: Implement the minimal summary-contract change**

Remove `refunds` from `WorkbenchBadgeKey` / `StaffWorkbenchSummary.badges`. Preserve the existing refund count query, then calculate the combined value only for administrators.

```ts
const ordersPending = orderPending + (role === 'ADMIN' ? refundPending : 0);
const badges = {
  purchasing: purchasePending,
  production: productionPending,
  orders: ordersPending,
  reimbursement: reimbursementPending,
  inventory: inventoryPending,
};
```

Keep `pendingTasks: Object.values(badges).reduce(...)`; this guarantees a refund is counted once, through `orders`.

- [ ] **Step 4: Run the controller contract test**

Run: `cd backend && npm test -- --runInBand tests/interfaces/controllers/staff-workbench.controller.spec.ts`

Expected: PASS, 2 tests.

- [ ] **Step 5: Commit the backend contract**

```bash
git add backend/src/interfaces/controllers/staff-workbench.controller.ts backend/tests/interfaces/controllers/staff-workbench.controller.spec.ts
git commit -m "feat: merge refund workload into order summary"
```

### Task 2: Add the missing local icon assets

**Files:**
- Create: `miniapp/src/static/ui-icons/customers.png`
- Create: `miniapp/src/static/ui-icons/recipe-designer.png`

- [ ] **Step 1: Create the two production PNGs**

Create two transparent 64×64 PNGs matching the visual weight of the existing `ui-icons/*.png` files: a person plus dog-head silhouette for `customers.png`, and a recipe card plus adjustment spark for `recipe-designer.png`. Use a single #216A4D foreground colour; do not include a coloured square, text glyph, emoji, or baked-in badge.

- [ ] **Step 2: Verify the asset dimensions and transparency**

Run: `sips -g pixelWidth -g pixelHeight miniapp/src/static/ui-icons/customers.png miniapp/src/static/ui-icons/recipe-designer.png`

Expected: each file reports `pixelWidth: 64` and `pixelHeight: 64`.

- [ ] **Step 3: Commit the icon assets**

```bash
git add miniapp/src/static/ui-icons/customers.png miniapp/src/static/ui-icons/recipe-designer.png
git commit -m "feat: add staff workbench icons"
```

### Task 3: Lock the compact workbench behavior with failing tests

**Files:**
- Create: `miniapp/src/pages/staff-workbench.regression.spec.ts`
- Modify: `miniapp/src/pages/staff-workbench/index.vue`

- [ ] **Step 1: Write source and asset regression tests**

Use `readFileSync` and `existsSync` in a new Vitest file. Cover the required visible behavior without rendering Uni-app:

```ts
it('renders overview before an eight-entry three-column module grid', () => {
  expect(source).toContain('今日概览')
  expect(source).toContain('workbench-grid')
  expect(source).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))')
  expect(source).toContain('const workbenchModules')
  expect(source).not.toContain('class="header"')
  expect(source).not.toContain('欢迎，')
  expect(source).not.toContain('退款管理')
})

it('uses local PNG icons for every workbench module', () => {
  ;['purchasing', 'production', 'orders', 'customers', 'inventory', 'recipes', 'reimbursement', 'recipe-designer']
    .forEach((name) => expect(existsSync(resolve(process.cwd(), `src/static/ui-icons/${name}.png`))).toBe(true))
  expect(source).not.toContain('🛒')
  expect(source).not.toContain('🏭')
  expect(source).not.toContain('📦')
})
```

Add an assertion that the order entry uses `badgeCount('orders')`, that the refund page route is absent, and that the recipe-designer route remains present.

- [ ] **Step 2: Run the new test to verify it fails**

Run: `cd miniapp && pnpm vitest run src/pages/staff-workbench.regression.spec.ts`

Expected: FAIL because the existing template has a `.header`, vertical `.modules`, emoji, and a refund module.

- [ ] **Step 3: Refactor the page to a typed configuration-driven grid**

Replace the repeated module markup with a typed metadata list and a single `v-for`. Keep the current navigation functions and permission handling. Use these exact visual rules:

```ts
type WorkbenchModule = {
  key: 'purchasing' | 'production' | 'orders' | 'customers' | 'inventory' | 'recipes' | 'reimbursement' | 'recipe-designer'
  title: string
  icon: string
  badgeKey?: WorkbenchBadgeKey
  onTap: () => void
}

const workbenchModules = computed<WorkbenchModule[]>(() => [
  { key: 'purchasing', title: '采购管理', icon: '/static/ui-icons/purchasing.png', badgeKey: 'purchasing', onTap: goToPurchasing },
  { key: 'production', title: '生产管理', icon: '/static/ui-icons/production.png', badgeKey: 'production', onTap: goToProduction },
  { key: 'orders', title: '订单管理', icon: '/static/ui-icons/orders.png', badgeKey: 'orders', onTap: viewTodayOrders },
  { key: 'customers', title: '客户与狗狗', icon: '/static/ui-icons/customers.png', onTap: goToCustomerDogs },
  { key: 'inventory', title: '库存管理', icon: '/static/ui-icons/inventory.png', badgeKey: 'inventory', onTap: goToInventory },
  { key: 'recipes', title: '食谱管理', icon: '/static/ui-icons/recipes.png', onTap: goToStaffRecipes },
  { key: 'reimbursement', title: '报销管理', icon: '/static/ui-icons/reimbursement.png', badgeKey: 'reimbursement', onTap: goToReimbursement },
  { key: 'recipe-designer', title: '食谱设计器', icon: '/static/ui-icons/recipe-designer.png', onTap: goToRecipeDesigner },
])
```

Render the overview first, then `.workbench-grid`. Each tile has a 72rpx icon container and 26rpx label; grid gap is 16rpx; use `grid-template-columns: repeat(3, minmax(0, 1fr))`. Retain the existing red `module-badge` semantics, resized for the grid. Delete the `refunds` type member, `isAdmin`, `roleText`, `workbenchTitle`, `goToRefunds`, the old welcome header, vertical module styles, and emoji icon styles.

- [ ] **Step 4: Run focused miniapp regressions**

Run: `cd miniapp && pnpm vitest run src/pages/staff-workbench.regression.spec.ts src/pages/staff-customer-service.regression.spec.ts src/pages/recipe-designer.regression.spec.ts`

Expected: PASS; customer and recipe-designer entry tests continue to prove their routes are preserved.

- [ ] **Step 5: Commit the grid refactor**

```bash
git add miniapp/src/pages/staff-workbench/index.vue miniapp/src/pages/staff-workbench.regression.spec.ts
git commit -m "feat: compact staff workbench into icon grid"
```

### Task 4: Surface refund review in the existing order workflow

**Files:**
- Modify: `miniapp/src/pages/staff-orders/index.vue`
- Modify: `miniapp/src/pages/staff-workbench.regression.spec.ts`

- [ ] **Step 1: Extend the failing regression coverage**

Add assertions that orders keep an `AFTERSALE` filter and expose administrator-only review wording while not adding a new refund route:

```ts
const ordersSource = readFileSync(resolve(process.cwd(), 'src/pages/staff-orders/index.vue'), 'utf8')
expect(ordersSource).toContain("{ label: '售后中', value: 'AFTERSALE'")
expect(ordersSource).toContain('退款待审核')
expect(ordersSource).toContain('const isAdmin = computed(() => getStoredStaffUser()?.role === \'ADMIN\')')
expect(ordersSource).not.toContain('/pages/staff-refunds/index')
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd miniapp && pnpm vitest run src/pages/staff-workbench.regression.spec.ts`

Expected: FAIL because the orders page currently labels all aftersale records only as “售后中”.

- [ ] **Step 3: Add a minimal administrator-only refund-review cue**

In `staff-orders/index.vue`, derive the stored user role once and add a small cue to the existing `AFTERSALE` filter and eligible order cards. It must identify only `order.status === 'AFTERSALE' && order.aftersaleType === 'REFUND'` as “退款待审核”. Tapping an eligible card continues to call `viewOrderDetail(order.id)`; do not duplicate `approveRefund`, `rejectRefund`, API calls, or payment logic in the list page.

```ts
function getStoredStaffUser(): { role?: string } | null {
  const stored = uni.getStorageSync('user') || uni.getStorageSync('userInfo')
  if (typeof stored !== 'string') return stored || null
  try {
    return JSON.parse(stored)
  } catch {
    return null
  }
}

const isAdmin = computed(() => getStoredStaffUser()?.role === 'ADMIN')
const isRefundReviewOrder = (order: Order) =>
  isAdmin.value && order.status === 'AFTERSALE' && order.aftersaleType === 'REFUND'
```

Use `v-if="isRefundReviewOrder(order)"` for the cue. Add `aftersaleType?: string | null` to the `Order` interface, because it is not currently present.

- [ ] **Step 4: Run the focused miniapp test**

Run: `cd miniapp && pnpm vitest run src/pages/staff-workbench.regression.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit the order-flow cue**

```bash
git add miniapp/src/pages/staff-orders/index.vue miniapp/src/pages/staff-workbench.regression.spec.ts
git commit -m "feat: surface refund reviews in staff orders"
```

### Task 5: Remove the redundant refund-only page and validate the build

**Files:**
- Modify: `miniapp/src/pages.json`
- Delete: `miniapp/src/pages/staff-refunds/index.vue`

- [ ] **Step 1: Add the deletion assertions**

Extend `staff-workbench.regression.spec.ts` to load `src/pages.json` and assert it no longer contains `pages/staff-refunds/index`; assert `existsSync(resolve(process.cwd(), 'src/pages/staff-refunds/index.vue'))` is false.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd miniapp && pnpm vitest run src/pages/staff-workbench.regression.spec.ts`

Expected: FAIL because the standalone page is still registered and present.

- [ ] **Step 3: Remove the route and page**

Delete the `staff-refunds` subpackage registration from `miniapp/src/pages.json`, then delete `miniapp/src/pages/staff-refunds/index.vue`. Before deletion, run `rg -n "staff-refunds" miniapp/src` and update any remaining navigation reference to `/pages/staff-orders/index`; the expected final result is no matches.

- [ ] **Step 4: Run regression suite and production build**

Run: `cd miniapp && pnpm vitest run src/pages/staff-workbench.regression.spec.ts src/pages/staff-customer-service.regression.spec.ts src/pages/recipe-designer.regression.spec.ts && pnpm build:mp-weixin`

Expected: all focused tests PASS and the build exits `0` with the two new PNG files copied into `dist/build/mp-weixin/static/ui-icons/`.

- [ ] **Step 5: Run backend regression and build**

Run: `cd backend && npm test -- --runInBand tests/interfaces/controllers/staff-workbench.controller.spec.ts && npm run build`

Expected: controller test PASS and Nest build exits `0`.

- [ ] **Step 6: Commit removal and verification-ready changes**

```bash
git add miniapp/src/pages.json miniapp/src/pages/staff-refunds/index.vue miniapp/src/pages/staff-workbench.regression.spec.ts
git commit -m "refactor: consolidate refund entry into orders"
```
