import { describe, expect, it } from 'vitest'
/**
 * ⚠️ 用 Vite 的 `?raw` 读源码，**不要用 `node:fs`**。
 * 构建的 tsconfig 没有 node 类型 —— `npm test` 能过，`npm run build` 会直接失败。
 */
import apiSource from '@/api/customRecipe.ts?raw'
import orderDetailSource from '@/views/CustomRecipes/OrderDetail.vue?raw'
import {
  buildMultiRecipeProgressText,
  canSubmitBatchDelivery,
  isBatchRecipeSelectable,
  isMultiRecipeOrderQuantity,
  normalizeRecipeQuantity,
} from '@/constants/customRecipeOrder'

/**
 * 多份订单 · 后台批量交付（2026-10-21 · 计划 Task 2）
 *
 * 对应老板的要求：
 *   · 多份订单显示「共 N 份，已设计 X 份」，并列出全部候选食谱；
 *   · 必须勾满 N 份才能点「一次性交付 N 份」，少一份都不行；
 *   · 只调一次 deliver-batch，成功后刷新；
 *   · 份数不对或后端拒绝时，把具体原因说清楚；
 *   · 1 份订单继续走原来的单份交付，不许被批量流程改坏。
 */
function stripComments(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

describe('多份订单批量交付 · 份数与勾选规则', () => {
  it('老订单 / 脏数据按 1 份处理，正数才认', () => {
    expect(normalizeRecipeQuantity(undefined)).toBe(1)
    expect(normalizeRecipeQuantity(null)).toBe(1)
    expect(normalizeRecipeQuantity(1)).toBe(1)
    expect(normalizeRecipeQuantity(3)).toBe(3)
    expect(normalizeRecipeQuantity(0)).toBe(1)
    expect(normalizeRecipeQuantity(-2)).toBe(1)
    expect(normalizeRecipeQuantity(2.5)).toBe(1)
  })

  it('只有多于 1 份才走批量交付', () => {
    expect(isMultiRecipeOrderQuantity(1)).toBe(false)
    expect(isMultiRecipeOrderQuantity(undefined)).toBe(false)
    expect(isMultiRecipeOrderQuantity(2)).toBe(true)
    expect(isMultiRecipeOrderQuantity(5)).toBe(true)
  })

  it('进度文案是「共 N 份，已设计 X 份」，X 不超过 N', () => {
    expect(buildMultiRecipeProgressText(3, 2)).toBe('共 3 份，已设计 2 份')
    expect(buildMultiRecipeProgressText(3, 0)).toBe('共 3 份，已设计 0 份')
    // 多设计出来的候选可以展示，但进度不能出现「3 份订单已设计 5 份」
    expect(buildMultiRecipeProgressText(3, 5)).toBe('共 3 份，已设计 3 份')
  })

  it('★ 必须恰好勾满 N 份（不能少、不能多）', () => {
    expect(canSubmitBatchDelivery(3, 3)).toBe(true)
    expect(canSubmitBatchDelivery(2, 3)).toBe(false)
    expect(canSubmitBatchDelivery(4, 3)).toBe(false)
    // 1 份订单走原来的单份交付，不属于批量入口
    expect(canSubmitBatchDelivery(1, 1)).toBe(false)
  })

  it('勾满后仍可取消已选项，但没勾满时不能继续加', () => {
    expect(isBatchRecipeSelectable('recipe-b', ['recipe-a', 'recipe-b'], 3)).toBe(true)
    expect(
      isBatchRecipeSelectable(
        'recipe-d',
        ['recipe-a', 'recipe-b', 'recipe-c'],
        3,
      ),
    ).toBe(false)
    expect(isBatchRecipeSelectable('recipe-c', ['recipe-a'], 3)).toBe(true)
  })
})

describe('多份订单批量交付 · 页面接线', () => {
  const cleanPage = stripComments(orderDetailSource)

  it('★ API 层声明 deliver-batch，载荷是 recipeIds', () => {
    expect(apiSource).toContain('deliverBatch:')
    expect(apiSource).toContain('`${BASE}/orders/${orderId}/deliver-batch`')
    expect(apiSource).toContain('{ recipeIds }')
    expect(apiSource).toContain('recipeQuantity?: number')
  })

  it('★ 多份订单展示份数进度，并列出全部候选', () => {
    expect(cleanPage).toContain('isMultiRecipeOrder')
    expect(cleanPage).toContain('multiRecipeQuantity')
    expect(cleanPage).toContain('multiRecipeProgressText')
    expect(cleanPage).toContain('<el-checkbox-group')
    expect(cleanPage).toContain('v-for="candidate in candidates"')
  })

  it('★ 勾选绑定到 selectedBatchRecipeIds，且不允许超过 N 份', () => {
    expect(cleanPage).toContain('v-model="selectedBatchRecipeIds"')
    expect(cleanPage).toContain('isBatchRecipeSelectable(candidate.recipeId)')
  })

  it('★ 没勾满 N 份时批量按钮禁用', () => {
    expect(cleanPage).toContain('一次性交付 {{ multiRecipeQuantity }} 份')
    expect(cleanPage).toContain(':disabled="!canSubmitBatchDelivery"')
    expect(cleanPage).toContain('@click="deliverBatchRecipes"')
  })

  it('★ 只调一次 deliver-batch，成功后刷新订单', () => {
    expect(cleanPage).toContain('const recipeIds = [...selectedBatchRecipeIds.value]')
    expect(cleanPage).toContain(
      'await customRecipeApi.deliverBatch(orderId, recipeIds)',
    )
    // 整页只允许出现一处批量交付请求，避免按钮误触发两次
    expect(cleanPage.match(/customRecipeApi\.deliverBatch\(/g)).toHaveLength(1)
    expect(cleanPage).toContain('await loadOrderDetail()')
    expect(cleanPage).toContain("emit('refresh')")
  })

  it('份数不对或后端拒绝时，页面上要留下具体原因', () => {
    expect(cleanPage).toContain('batchDeliverError')
    expect(cleanPage).toContain('getApiErrorMessage(')
    expect(cleanPage).toContain('batchDeliverError.value =')
    // 重新勾选时清掉旧错误，避免上次的报错一直挂着
    expect(cleanPage).toContain('watch(selectedBatchRecipeIds')
  })

  it('★ 1 份订单仍保留原来的单份交付入口', () => {
    expect(cleanPage).toContain('<el-radio-group')
    expect(cleanPage).toContain(
      'customRecipeApi.deliverRecipe(orderId, candidate.recipeId)',
    )
    expect(cleanPage).toContain(
      "{{ isRedelivery ? '重新交付' : '交付到订单' }}",
    )
  })
})
