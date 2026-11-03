# 预分装补剂下单页重构 Implementation Plan（小程序）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `miniapp/src/pages/supplement-order/index.vue` 重写成"金额永远可信、买几套都行、看得懂买的是什么"的下单页。

**Architecture:** 先把"算价状态机"抽成不依赖页面的 composable（可在 node 里单测），页面只留渲染与事件；再逐块换掉模板（来源卡/清单/套数/费用/地址/确认弹层），最后统一视觉。依赖后端计划 `2026-11-01-supplement-order-backend-contract.md` 的新字段。

**Tech Stack:** uni-app + Vue 3（`<script setup>`）+ vitest（node 环境，无组件测试）。

**Spec:** `docs/superpowers/specs/2026-11-01-supplement-order-page-redesign-design.md`

## Global Constraints

- 金额一律以**服务端返回为准**，前端不做乘法；提交时用**整数分**校验。
- 任何"本地已改、服务端未确认"的状态，都**禁止提交**；失败要回滚到上一次服务端确认的值。
- 补剂**没有"天"**：页面不得出现"天/用量天数/覆盖多少天"。
- 「份」全部改叫「套」；「改用量」改叫「改制作单」。
- 主色统一墨绿 `#1e3a2f` / 金 `#a97c33`，不得再出现旧蓝 `#4a90d9`。
- 文案是顾客看的：说人话，不出现"接口""字段""报价失败"这类词。
- 改完必须执行一次 `cd miniapp && npm run build:mp-weixin`（产物目录 `miniapp/dist/build/mp-weixin`）并告知老板；发布走体验版上传，不发布正式版。

## Review Focus

1. **算价还没回来就点提交**：金额是旧的、提交是新的 —— 必须由 `isAmountReady` 挡住。
2. **连续快速改套数**：先发的响应后到会把金额覆盖成旧值 —— 必须只认最新一次。
3. **老草稿的字段缺失**：复购草稿没有 `recipeItemId`，只有 `amount` —— 两种都要能报价。
4. **地址从列表页选回来但本地没有这条记录**：必须重新拉取，不能显示空白还允许提交。
5. **建单成功但支付失败**：不能提示"提交失败"，否则顾客会再下一单。

---

### Task 1: 提交辅助工具（金额换算 + 幂等键）

**Files:**
- Create: `miniapp/src/utils/supplement-order-submit.ts`
- Test: `miniapp/src/utils/supplement-order-submit.spec.ts`

**Interfaces:**
- Produces: `toCents(amount: number): number`、`createRequestId(): string`。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest'
import { toCents, createRequestId } from './supplement-order-submit'

describe('补剂下单辅助', () => {
  it('金额转整数分，不产生浮点误差', () => {
    expect(toCents(41.5)).toBe(4150)
    expect(toCents(0.1 + 0.2)).toBe(30)
    expect(toCents(99.99)).toBe(9999)
    expect(toCents(0)).toBe(0)
  })

  it('每次生成的请求 id 都不同，且长度可控', () => {
    const ids = new Set(Array.from({ length: 200 }, () => createRequestId()))
    expect(ids.size).toBe(200)
    for (const id of ids) expect(id.length).toBeLessThanOrEqual(64)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd miniapp && npx vitest run src/utils/supplement-order-submit.spec.ts`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 实现**

- `toCents`: `Math.round((Number(amount) + Number.EPSILON) * 100)`，非有限数返回 0。
- `createRequestId`: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd miniapp && npx vitest run src/utils/supplement-order-submit.spec.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add miniapp/src/utils/supplement-order-submit.ts miniapp/src/utils/supplement-order-submit.spec.ts
git commit -m "feat(miniapp): 补剂下单金额换算与幂等键工具"
```

---

### Task 2: 算价状态机 composable

**Files:**
- Create: `miniapp/src/composables/useSupplementQuote.ts`
- Test: `miniapp/src/composables/useSupplementQuote.spec.ts`

**Interfaces:**
- Consumes: `api/supplements.ts` 的 `quoteSupplements`（**通过参数注入**，不在文件里直接 import 具体实现，见下）。
- Produces:

```ts
export type QuoteStatus = 'idle' | 'loading' | 'ready' | 'failed'

export interface SeedLine {
  ingredientId: string
  recipeItemId?: string
  amount?: number
  name?: string
  unit?: string
  specText?: string
}

export interface QuoteLineState extends SeedLine {
  amount: number
  packedAmount: number
  unavailableReason?: string
}

export interface QuoteFn {
  (lines: Array<{ ingredientId: string; recipeItemId?: string; amount?: number }>,
   options: { portionMultiplier?: number; diySheetId?: string })
    : Promise<{ code: number; data: {
        quote: SupplementQuote
        unavailable: SupplementUnavailableLine[]
        enabled: boolean
        minOrderAmount: number
        paymentTimeoutMinutes: number
        bulkBagThreshold: number
      } }>
}

export function useSupplementQuote(options: {
  quote: QuoteFn
  diySheetId?: () => string | undefined
  initialPortionMultiplier?: number
}) : {
  lines: Ref<QuoteLineState[]>
  selectedIds: Ref<string[]>
  selectableLines: ComputedRef<QuoteLineState[]>
  allSelectableSelected: ComputedRef<boolean>
  portionMultiplier: Ref<number>
  summary: Ref<SupplementQuote | null>
  unavailable: Ref<SupplementUnavailableLine[]>
  status: Ref<QuoteStatus>
  errorMessage: Ref<string>
  /** 下面四个来自最近一次成功的报价响应，页面直接读，不要自己再发请求 */
  enabled: Ref<boolean>
  minOrderAmount: Ref<number>
  paymentTimeoutMinutes: Ref<number>
  bulkBagThreshold: Ref<number>
  bagCount: ComputedRef<number>
  isAmountReady: ComputedRef<boolean>
  canSubmit: ComputedRef<boolean>
  load(seed: SeedLine[]): Promise<void>
  toggleLine(ingredientId: string): Promise<void>
  toggleAll(): Promise<void>
  setPortion(next: number): Promise<void>
  retry(): Promise<void>
}
```

**行为约定（测试要锁死）：**
- 每次请求自带递增序号，只采纳最新一次的响应；旧响应直接丢弃。
- `status !== 'ready'` 时 `isAmountReady === false`，`canSubmit === false`。
- 报价失败：`status='failed'`、`errorMessage=真实原因`，并把 `selectedIds` 与 `portionMultiplier` **回滚到上一次成功时的值**。
- `summary` 只在成功时替换。
- `load()` 只发**一次**请求（首屏不得连发两次）。
- `toggleAll` 只选可购买的（没有 `unavailableReason` 的）。

- [ ] **Step 1: 写失败测试**（用可控的假 quote 函数）

```ts
function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

const okQuote = (multiplier = 1, bags = 3) => ({
  code: 0,
  data: {
    quote: { lines: [], bagCount: bags, total: 100 * multiplier, portionOptions: [], maxPortionMultiplier: 3 } as any,
    unavailable: [],
    enabled: true,
    minOrderAmount: 0,
    paymentTimeoutMinutes: 30,
    bulkBagThreshold: 60,
  },
})

it('加载成功后进入 ready，默认全选', async () => {
  const quote = vi.fn().mockResolvedValue(okQuote())
  const state = useSupplementQuote({ quote })
  await state.load([{ ingredientId: 'a', recipeItemId: 'r1' }, { ingredientId: 'b', amount: 50 }])
  expect(state.status.value).toBe('ready')
  expect(state.selectedIds.value).toEqual(['a', 'b'])
  expect(state.canSubmit.value).toBe(true)
  expect(quote.mock.calls[0][0]).toEqual([
    { ingredientId: 'a', recipeItemId: 'r1' },
    { ingredientId: 'b', amount: 50 },
  ])
  expect(quote).toHaveBeenCalledTimes(1)   // 首屏只发一次
})

it('改套数失败时，套数与勾选都回滚，且禁止提交', async () => {
  const quote = vi.fn().mockResolvedValueOnce(okQuote(1)).mockRejectedValueOnce(new Error('网络断了'))
  const state = useSupplementQuote({ quote })
  await state.load([{ ingredientId: 'a', recipeItemId: 'r1' }])
  await state.setPortion(5)
  expect(state.portionMultiplier.value).toBe(1)
  expect(state.status.value).toBe('failed')
  expect(state.errorMessage.value).toBe('网络断了')
  expect(state.canSubmit.value).toBe(false)
})

it('先发后到的旧响应会被丢弃', async () => {
  const slow = deferred<any>()
  const fast = deferred<any>()
  const quote = vi.fn().mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise)
  const state = useSupplementQuote({ quote })
  const p1 = state.load([{ ingredientId: 'a', recipeItemId: 'r1' }])
  const p2 = state.setPortion(2)
  fast.resolve(okQuote(2, 6))
  await p2
  slow.resolve(okQuote(1, 3))
  await p1
  expect(state.summary.value?.total).toBe(200)
  expect(state.portionMultiplier.value).toBe(2)
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd miniapp && npx vitest run src/composables/useSupplementQuote.spec.ts`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 实现**

按上面的 Interfaces 与行为约定实现。要点：

- `interval` 序号：`let seq = 0`，每次请求 `const mine = ++seq`，响应回来时 `if (mine !== seq) return`。
- `confirmed = { ids: string[], portion: number }`，成功时更新。
- 失败分支：回滚 → `status='failed'` → `errorMessage = error.message`。
- `isAmountReady = computed(() => status.value === 'ready' && summary.value !== null)`。
- `canSubmit = computed(() => isAmountReady.value && selectedLines.value.length > 0)`。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd miniapp && npx vitest run src/composables/useSupplementQuote.spec.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add miniapp/src/composables/useSupplementQuote.ts miniapp/src/composables/useSupplementQuote.spec.ts
git commit -m "feat(miniapp): 补剂报价状态机（竞态/回滚/待确认）"
```

---

### Task 3: API 层对齐新契约

**Files:**
- Modify: `miniapp/src/api/supplements.ts`

**Interfaces:**
- Produces: `SupplementQuoteResponse` 增加 `minOrderAmount: number`、`paymentTimeoutMinutes: number`、`bulkBagThreshold: number`。
- Produces: `CreateSupplementOrderPayload` 增加 `expectedTotal?: number`、`clientRequestId?: string`。
- Produces: `quoteSupplements` / `createSupplementOrder` 均带 `suppressErrorToast: true`（错误由页面用行内横幅展示，不再弹 toast）。

- [ ] **Step 1: 改类型与请求参数**

- 三个字段加到 `SupplementQuoteResponse`；两个字段加到 `CreateSupplementOrderPayload`。
- 两个请求函数加 `suppressErrorToast: true`（`request` 已支持该开关）。

- [ ] **Step 2: 类型检查**

Run: `cd miniapp && npx tsc --noEmit -p tsconfig.json`
Expected: 无新增报错（既有报错保持原样）。

- [ ] **Step 3: 提交**

```bash
git add miniapp/src/api/supplements.ts
git commit -m "feat(miniapp): 补剂 API 对齐新契约，错误交给页面展示"
```

---

### Task 4: 页面骨架（来源卡 / 说明图 / 清单 / 空态）

**Files:**
- Modify: `miniapp/src/pages/supplement-order/index.vue`（template + script 引入 composable，暂时保留原有套数/费用/提交逻辑）
- Modify: `miniapp/src/pages.json`（导航标题）
- Modify: `miniapp/src/pages/supplement-purchase.regression.spec.ts`

**Interfaces:**
- Consumes: Task 2 的 `useSupplementQuote`。

- [ ] **Step 1: 写/改回归断言**（先写，后改模板）

在 `supplement-purchase.regression.spec.ts` 追加：

```ts
it('清单用"整单量 + ×N 袋"表达，并给出总袋数', () => {
  expect(template).toContain('整单')
  expect(template).toContain('× ')
  expect(template).toContain('共 {{ summary.bagCount }} 袋')
})

it('标题与入口口径统一，且不再出现"改用量"', () => {
  const pagesJson = readFileSync(resolve(process.cwd(), 'src/pages.json'), 'utf-8')
  expect(pagesJson).toContain('"navigationBarTitleText": "购买预分装补剂"')
  expect(template).not.toContain('改用量')
  expect(template).toContain('改制作单')
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd miniapp && npx vitest run src/pages/supplement-purchase.regression.spec.ts`
Expected: FAIL。

- [ ] **Step 3: 改模板**

- 来源卡：副标题只保留狗名/`按当前制作单配比`；右上按钮文案「改制作单」，仅当 `draft.diySheetId` 存在时显示，点击按 T4 处理（页面栈 >1 → `navigateBack()`，否则 `redirectTo('/pages/diy-sheet-list/index')`，并 toast「改完再点『购买预分装补剂』」）。
- 说明图：首次展示；用 storage 键 `supplementPrepackExplainerSeen` 记住，之后渲染一行「为什么是预分装？」可展开。
- 清单：标题「本次要买的补剂」；副标「按这张制作单的配比算：{{ selectableLines.length }} 种，每种 1 袋」；每行右侧 `整单 {量}`，套数 > 1 时 `{量} × {N} 袋`；不可买行灰显 + 原因；不可买的不可选中。
- 清单下方：`共 {{ summary.bagCount }} 袋` + ⓘ「这个量是按你制作单里的食物总量和营养目标算出来的，不是你自己填的。」
- 空态：全部不可买时进入「这些补剂暂时无法购买」，列出 `unavailable` 的每条「名称 + 原因」，底部「联系客服」「返回我的制作单」。
- 商城关闭：`enabled === false` 时整页显示「补剂商城暂未开放」+「返回我的制作单」，不渲染清单与提交按钮。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd miniapp && npx vitest run src/pages/supplement-purchase.regression.spec.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add miniapp/src/pages/supplement-order/index.vue miniapp/src/pages/supplement-purchase.regression.spec.ts miniapp/src/pages.json
git commit -m "feat(miniapp): 补剂下单页清单与来源卡改版"
```

---

### Task 5: 套数：三张卡不变 + 自定义弹层

**Files:**
- Modify: `miniapp/src/pages/supplement-order/index.vue`
- Modify: `miniapp/src/pages/supplement-purchase.regression.spec.ts`

**Interfaces:**
- Consumes: `useSupplementQuote().setPortion(n)`（1–99）。

- [ ] **Step 1: 写回归断言**

```ts
it('套数：三张卡保留，第四张是自定义', () => {
  expect(template).toContain('portionOptionCards')
  expect(template).toContain('自定义')
  expect(template).toContain('showCustomPortion')
  // 不再拿服务端上限去夹套数
  expect(source).not.toContain('if (portionMultiplier.value > allowed)')
})

it('套数文案从"份"改成"套"', () => {
  expect(template).toContain('选择套数')
  expect(template).not.toContain('选择份数')
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd miniapp && npx vitest run src/pages/supplement-purchase.regression.spec.ts -t "套数"`
Expected: FAIL。

- [ ] **Step 3: 实现**

- 三张卡：仍渲染 `portionOptionCards`（服务端 `portionOptions`），点击调 `setPortion(opt.multiplier)`；高亮条件 `portionMultiplier === opt.multiplier`。
- 第四张卡：未选中时显示「自定义」；选中（`portionMultiplier > 3`）时显示 `{N} 套` 与当前合计单价文案。点击打开自定义弹层。
- 弹层：`− [N] +` 步进、数字可直接输入、`取消/确定`；打开默认值 = 当前套数（≤3 时取 4）；范围 1–99，越界按边界收敛；确定调 `setPortion(n)`。
- 去掉旧的"报价回来后把套数夹回 `maxPortionMultiplier`"逻辑。
- 控件常显（只要有可选购的补剂）。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd miniapp && npx vitest run src/pages/supplement-purchase.regression.spec.ts -t "套数"`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add miniapp/src/pages/supplement-order/index.vue miniapp/src/pages/supplement-purchase.regression.spec.ts
git commit -m "feat(miniapp): 套数支持自定义 1-99"
```

---

### Task 6: 费用区（明细、包材、大单、效期、最低起送、待确认态）

**Files:**
- Modify: `miniapp/src/pages/supplement-order/index.vue`
- Modify: `miniapp/src/pages/supplement-purchase.regression.spec.ts`

- [ ] **Step 1: 写回归断言**

```ts
it('费用明细只出现一个商品金额，不再重复两行同值', () => {
  expect(template).toContain('补剂商品金额')
  expect(template).not.toContain('补剂商品小计')
  expect(template).not.toContain('>补剂费<')
})

it('配了包材费才显示包材费那一行', () => {
  expect(template).toContain('summary.packagingFee > 0')
})

it('大单与效期各有一句提示', () => {
  expect(template).toContain('发货会顺延')
  expect(template).toContain('6 个月内吃完')
})

it('金额未确认时不能提交', () => {
  expect(template).toContain('isAmountReady')
  expect(template).toContain('更新中')
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd miniapp && npx vitest run src/pages/supplement-purchase.regression.spec.ts -t "费用"`
Expected: FAIL。

- [ ] **Step 3: 实现**

- 明细行：`补剂商品金额` → `分装服务费`（被门槛免掉时值显示「已免」）→ `包材费`（`summary.packagingFee > 0` 才出现）→ `运费`（包邮时「包邮」）→ `合计` → `预计发货`。
- 合计区在 `status !== 'ready'` 时显示「更新中」。
- 小字：`补剂分装后建议 6 个月内吃完（袋上印有效期）`。
- 大单：`bagCount > summary.bulkBagThreshold` 时显示 `本单分装量较大（约 {bagCount} 袋），实际发货会顺延，我们会联系你确认。`
- 最低起送：`summary.goodsSubtotal < minOrderAmount` 时显示 `商品金额 ¥X，未达最低起送 ¥Y`，并禁用提交。
- 上述阈值一律读 composable 暴露的 `minOrderAmount` / `bulkBagThreshold` 字段，不要在页面里再发请求。
- 报价失败：费用区上方行内横幅 `价格没拿到：{errorMessage}` + 「重试」按钮（调 `retry()`）。
- 删掉库存提示块与其三个类名。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd miniapp && npx vitest run src/pages/supplement-purchase.regression.spec.ts -t "费用"`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add miniapp/src/pages/supplement-order/index.vue miniapp/src/pages/supplement-purchase.regression.spec.ts
git commit -m "feat(miniapp): 补剂费用区改版（包材/大单/效期/待确认）"
```

---

### Task 7: 收货地址

**Files:**
- Modify: `miniapp/src/pages/supplement-order/index.vue`
- Test: `miniapp/src/pages/supplement-purchase.regression.spec.ts`

- [ ] **Step 1: 写回归断言**

```ts
it('地址：回页面就重拉列表，且兼容字符串型事件载荷', () => {
  expect(source).toContain('void loadAddresses()')   // onShow 里无条件调用
  expect(source).toMatch(/typeof payload === 'string'/)
  expect(source).toContain('地址已失效')
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd miniapp && npx vitest run src/pages/supplement-purchase.regression.spec.ts -t "地址"`
Expected: FAIL。

- [ ] **Step 3: 实现**

- `onShow`：无条件 `void loadAddresses()`。
- `onAddressSelected(payload)`：兼容 `{ addressId }` 与纯字符串；本地 `addresses` 里没有该 id 时先 `await loadAddresses()` 再回填。
- `canSubmit` 改用 `!!selectedAddress.value`（不是 id 非空）。
- 地址存在但列表里找不到 → 卡片显示「地址已失效，请重新选择」并禁用提交。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd miniapp && npx vitest run src/pages/supplement-purchase.regression.spec.ts -t "地址"`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add miniapp/src/pages/supplement-order/index.vue miniapp/src/pages/supplement-purchase.regression.spec.ts
git commit -m "fix(miniapp): 补剂下单页地址回显与失效处理"
```

---

### Task 8: 提交确认弹层与提交流程

**Files:**
- Modify: `miniapp/src/pages/supplement-order/index.vue`
- Test: `miniapp/src/pages/supplement-purchase.regression.spec.ts`

**Interfaces:**
- Consumes: Task 1 的 `toCents` / `createRequestId`；Task 2 的 `isAmountReady` / `summary`。

- [ ] **Step 1: 写回归断言**

```ts
it('提交前有确认弹层，弹层里重新取价', () => {
  expect(template).toContain('确认订单')
  expect(source).toContain('openConfirmSheet')
  expect(source).toContain('await retry()')       // 打开弹层时重新取价
  expect(template).toContain('提交并支付')
})

it('提交带幂等键与期望金额', () => {
  expect(source).toContain('clientRequestId')
  expect(source).toContain('expectedTotal: toCents(')
})

it('建单与支付分开处理：建单成功后一定跳详情', () => {
  const block = source.slice(source.indexOf('async function submitOrder'), source.indexOf('async function submitOrder') + 3000)
  expect(block).toContain('redirectTo')
  expect(source).not.toContain('提交失败，请稍后重试')
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd miniapp && npx vitest run src/pages/supplement-purchase.regression.spec.ts -t "提交"`
Expected: FAIL。

- [ ] **Step 3: 实现**

- 底部按钮 → `openConfirmSheet()`：先 `await retry()` 重新取价；弹层展示地址、`{种类} 种 · 共 {袋数} 袋`、商品/服务费/运费/合计、预计发货、售后一句、`paymentTimeoutMinutes > 0` 时「未付款 N 分钟内自动取消」、主按钮「提交并支付」。
- 弹层打开后若金额与进弹层前不同，显示「价格有更新」并保持弹层，让顾客再点一次。
- `submitOrder()`：
  - `if (submitting.value) return`；`submitting = true`；生成一次 `clientRequestId`（重试复用同一个变量）。
  - `createSupplementOrder({ ...payload, expectedTotal: toCents(summary.total), clientRequestId })`。
  - 建单成功 → `clearSupplementPurchaseDraft()` → `settlePayment(order)` → **无论支付结果如何都 `redirectTo` 订单详情**，结果用 modal 说明。
  - 建单失败 → 关闭 submitting，`errorMessage` 展示服务端消息，并自动 `retry()` 刷新金额；**不显示"提交失败，请稍后重试"这种泛化文案**。
- 提交期间按钮文案「处理中…」且不可点。

- [ ] **Step 4: 跑测试 + 构建**

Run: `cd miniapp && npx vitest run src/pages/supplement-purchase.regression.spec.ts -t "提交"`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add miniapp/src/pages/supplement-order/index.vue miniapp/src/pages/supplement-purchase.regression.spec.ts
git commit -m "feat(miniapp): 补剂下单确认弹层与防重复提交流程"
```

---

### Task 9: 视觉统一与客服入口

**Files:**
- Modify: `miniapp/src/pages/supplement-order/index.vue`
- Modify: `miniapp/src/pages/supplement-purchase.regression.spec.ts`
- Modify: `miniapp/src/pages/customer-service-placement.regression.spec.ts`

- [ ] **Step 1: 写回归断言**

```ts
it('主按钮与勾选框用品牌色，不再有旧蓝', () => {
  expect(source).not.toContain('#4a90d9')
  expect(source).toContain('#1e3a2f')
})

it('勾选框是方形', () => {
  expect(source).toMatch(/\.checkbox\s*\{[^}]*border-radius:\s*6rpx/)
})
```

在 `customer-service-placement.regression.spec.ts` 的 `fixedBottomPages` 数组里加一条：

```ts
{ path: 'src/pages/supplement-order/index.vue', title: '补剂下单咨询', context: 'supplement order bottom bar' },
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd miniapp && npx vitest run src/pages/customer-service-placement.regression.spec.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

- 底部栏左侧放 `CustomerServiceInlineButton`（`title="补剂下单咨询"`、`path="/pages/supplement-order/index"`、`source-type="PRODUCT"`、`:product-id="draft.recipeId"`、`:product-name="draft.recipeName"`），包一层 `class="customer-service-bottom-action"`。
- 主按钮背景 `#1e3a2f`、禁用态 `#c0c4cc`；勾选框 `border-radius: 6rpx`，选中用 `#1e3a2f`；地址「更换」链接改 `#a97c33`。
- 文字型按钮（全不选 / 改制作单 / 重试）加内边距，热区 ≥ 88rpx。
- 删除未使用的样式类（`portion-summary`、`portion-days`、`portion-perday`、`portion-hint`、`inventory-warning-*`）。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd miniapp && npx vitest run src/pages/customer-service-placement.regression.spec.ts && npx vitest run src/pages/supplement-purchase.regression.spec.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add miniapp/src/pages/supplement-order/index.vue miniapp/src/pages/*.regression.spec.ts
git commit -m "style(miniapp): 补剂下单页视觉统一并补客服入口"
```

---

### Task 10: 全量验证与交付

- [ ] **Step 1: 跑全部相关测试**

Run: `cd miniapp && npx vitest run`
Expected: 全绿。

- [ ] **Step 2: 构建**

Run: `cd miniapp && npm run build:mp-weixin`
Expected: 成功；产物在 `miniapp/dist/build/mp-weixin`。

- [ ] **Step 3: 提交并告知**

```bash
git add -A miniapp
git commit -m "chore(miniapp): 补剂下单页改版收尾"
```

向老板报告：微信开发者工具打开 `miniapp/dist/build/mp-weixin`；上传体验版执行 `bash scripts/upload-trial.sh "补剂下单页改版"`，**不发布正式版**。

---

## 交付后必须做

- 小程序只上传体验版，报版本号；不发布正式版。
- 后端/后台按后端计划单独部署（若后端计划已部署，本次只上传小程序）。
