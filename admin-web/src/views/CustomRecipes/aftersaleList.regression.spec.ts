import { describe, expect, it } from 'vitest'
// admin-web 的 vitest 是 node 环境（没有 jsdom），Element Plus 页面挂不起来，
// 所以页面接线用"读源码断言"锁住 —— 这是本项目既有做法。
//
// ⚠️ 用 Vite 的 `?raw` 导入，**不要用 node:fs** ——
// 构建时的 tsconfig 里没有 node 类型（`npm run build` 会因为
// `Cannot find module 'node:path'` 直接失败）。我第一版就是这么挂的。
import page from '@/views/CustomRecipes/AftersaleList.vue?raw'
import apiSource from '@/api/customRecipe.ts?raw'
import routerSource from '@/router/index.ts?raw'
import layoutSource from '@/layouts/MainLayout.vue?raw'

/**
 * 售后待办页 · 守卫（2026-10-16，批次 3.1）
 *
 * ## 这一页最容易出的两类错
 *
 * **一、前端自己排顺序。** 排序规则（等太久的排前面；同等的"调整食谱"
 * 比"问个问题"急）在后端领域层，前端再排一次就会出现两套口径。
 *
 * **二、前端自己判断"现在能做什么 / 急不急"。** 后端每条都给了
 * `actions` 与 `isUrgent`，前端照着渲染即可 ——
 * 自己写 `status === 'PENDING'` 就又变成三处维护。
 *
 * 这两条与顾客侧渲染契约是同一套思路，所以守卫也照同一套写。
 */

/** 剥注释再断言 —— 本项目被"注释骗过断言"坑过 4 次 */
function stripComments(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

describe('售后待办页 · 顺序与动作都由后端定', () => {
  const pageCode = stripComments(page)
  const apiCode = stripComments(apiSource)

  it('★ 前端不自己排序（排序规则在后端领域层）', () => {
    expect(pageCode).not.toContain('.sort(')
    // 顺序直接用后端给的数组
    expect(pageCode).toContain('data?.items')
  })

  it('★ 按钮清单来自后端，前端不判断状态', () => {
    expect(pageCode).toContain('item.actions')
    // 不许在渲染逻辑里按状态决定显示哪些按钮
    expect(pageCode).not.toContain("status === 'PENDING'")
    expect(pageCode).not.toContain("status === 'ACCEPTED'")
    expect(pageCode).not.toContain("status === 'PROCESSING'")
  })

  it('★ "急不急"也用后端算好的（阈值不该改前端）', () => {
    expect(pageCode).toContain('item.isUrgent')
    // 不许在页面里拿 hoursWaiting 跟 24 比
    expect(pageCode).not.toContain('hoursWaiting >=')
  })

  it('★ 处理说明必填（前端先拦一道，后端也会拦）', () => {
    expect(pageCode).toContain('resolveForm.handleNote.trim()')
    expect(pageCode).toContain('给顾客的处理说明')
  })

  it('★ 不受理的原因必填', () => {
    expect(pageCode).toContain('rejectForm.reason.trim()')
    expect(pageCode).toContain('为什么不受理')
  })

  it('失败了显示后端给的原因，不是通用文案', () => {
    expect(pageCode).toContain('toastApiError')
  })

  it('★ "等了多久"用后端算好的，前端不自己减时间', () => {
    expect(pageCode).toContain('item.hoursWaiting')
    // 不许在页面里拿 createdAt 去算等待时长
    expect(pageCode).not.toContain('item.createdAt')
  })

  it('受理 / 标记处理中要有二次确认（避免手滑）', () => {
    expect(pageCode).toContain('ElMessageBox.confirm')
    expect(pageCode).toContain('再想想')
  })

  it('路由与菜单都挂上了', () => {
    expect(routerSource).toContain('custom-recipes/aftersales')
    expect(routerSource).toContain('AftersaleList.vue')
    expect(layoutSource).toContain('/custom-recipes/aftersales')
  })

  it('API 层调的是后台地址（不是顾客端那个）', () => {
    expect(apiCode).toContain('/admin/custom-recipe/aftersales')
    // 受理 / 处理完成 / 不受理三个动作都要有
    expect(apiCode).toContain('/accept')
    expect(apiCode).toContain('/resolve')
    expect(apiCode).toContain('/reject')
  })
})

/**
 * 多份售后（2026-10-21）
 *
 * 顾客现在可以一次选中几份食谱提售后，每份写自己的诉求。
 * 后台此前只显示一条共用说明 —— 客服看不出「要改的是鸡肉南瓜还是鸭肉西兰花」。
 *
 * 展示部分：按选中份数、食谱名、逐份说明渲染；老的单份售后一个字都不变。
 * 重新交付选中份在下一期接（见文末），这里先锁住展示口径。
 */
describe('售后待办页 · 多份售后只做展示', () => {
  const pageCode = stripComments(page)
  const apiCode = stripComments(apiSource)

  it('★ API 类型补齐后端返回的批次 / 明细 / 逐份说明 / 食谱名', () => {
    expect(apiCode).toContain('deliveryBatchId: string | null')
    expect(apiCode).toContain('deliveryItemIds: string[]')
    expect(apiCode).toContain('recipeRequests: AdminAftersaleRecipeRequest[]')
    expect(apiCode).toContain('items: AdminAftersaleSelectedRecipe[]')
    expect(apiCode).toContain('recipeId: string | null')
    expect(apiCode).toContain('recipeName: string | null')
  })

  it('★ 多份售后显示「涉及 N 份食谱」、食谱名与每份的说明', () => {
    expect(pageCode).toContain('涉及')
    expect(pageCode).toContain('份食谱')
    expect(pageCode).toContain('batchRecipesOf(item).length')
    expect(pageCode).toContain('v-for="recipe in batchRecipesOf(item)"')
    expect(pageCode).toContain('recipe.recipeName')
    expect(pageCode).toContain('recipe.requestDescription')
  })

  it('老的单份售后保持原样：仍显示那条共用说明，不出现空的多份块', () => {
    expect(pageCode).toContain('{{ item.description }}')
    // 没有选中明细（空数组 / 老订单）时整块不渲染，不会冒出「涉及 0 份」
    expect(pageCode).toContain('v-if="batchRecipesOf(item).length"')
  })

  it('★ 重新交付选中份只走按份接口，不再复用首次交付 / 单份交付', () => {
    expect(pageCode).toContain('customRecipeApi.redeliverBatch(')
    expect(pageCode).not.toContain('customRecipeApi.deliverBatch(')
    // 老单份售后走 deliverRecipe；多份售后仍只走 redeliverBatch
    expect(pageCode).toContain('customRecipeApi.deliverRecipe(')
  })
})

/**
 * 按选中份重新交付（2026-10-21 · 多份售后改稿）
 *
 * 顾客只对其中几份不满意时，处理人改完那几份后只重交选中的份：
 *   · 按钮只出现在多份售后卡上（有选中明细 + 订单号），老的单份售后没有；
 *   · 点击后先确认，对话框必须列出这次要重交的食谱名；
 *   · 只调一次 `redeliver-batch`，成功后刷新列表；
 *   · 后端拒绝的原因留在卡片上，运行期间按钮不能重复点。
 *
 * 页面在 node 环境挂不起来（vitest 无 jsdom），所以接线用源码断言锁住；
 * "什么时候显示 / 发什么载荷" 由 `customRecipeAftersale` 的纯函数单测覆盖。
 */
describe('售后待办页 · 按选中份重新交付', () => {
  const pageCode = stripComments(page)
  const apiCode = stripComments(apiSource)

  it('★ API 层声明 redeliver-batch，载荷是 deliveryItemIds', () => {
    expect(apiCode).toContain('redeliverBatch:')
    expect(apiCode).toContain(
      '`${BASE}/orders/${orderId}/redeliver-batch`',
    )
    expect(apiCode).toContain('{ deliveryItemIds }')
    // 后端返回新批次与本次真正刷新的份，页面用它报"已重交几份"
    expect(apiCode).toContain('selectedItemIds: string[]')
    expect(apiCode).toContain('selectedRecipes:')
  })

  it('★ 按钮只在多份售后卡上显示（有选中明细 + 订单号）', () => {
    expect(pageCode).toContain('v-if="canRedeliverAftersaleBatch(item)"')
    expect(pageCode).toContain('按选中份重新交付')
    // 判断交给纯函数，页面不自己拼 `item.deliveryItemIds.length` 这类条件
    expect(pageCode).not.toContain('item.deliveryItemIds.length')
  })

  it('★ 点击后先确认，对话框列出选中的食谱名', () => {
    expect(pageCode).toContain('ElMessageBox.confirm(')
    expect(pageCode).toContain('确认按选中份重新交付')
    expect(pageCode).toContain('batchRecipesOf(item)')
    expect(pageCode).toContain('recipeNames')
  })

  it('★ 只调一次 redeliver-batch，载荷来自选中的明细', () => {
    expect(pageCode).toContain(
      'const deliveryItemIds = resolveAftersaleRedeliverItemIds(item)',
    )
    expect(pageCode.match(/customRecipeApi\.redeliverBatch\(/g)).toHaveLength(1)
    expect(pageCode).toContain('item.orderId,')
    expect(pageCode).toContain('deliveryItemIds,')
    // 成功后刷新列表，顾客侧/售后状态才会跟着变
    expect(pageCode).toContain('await load()')
  })

  it('★ 运行期间按钮 loading + disabled，不能重复提交', () => {
    expect(pageCode).toContain(':loading="redeliveringId === item.id"')
    expect(pageCode).toContain(':disabled="Boolean(redeliveringId)"')
  })

  it('★ 后端拒绝时把具体原因留在卡片上（不是只弹一个 toast）', () => {
    expect(pageCode).toContain('redeliverErrors[item.id]')
    expect(pageCode).toContain('getApiErrorMessage(')
    expect(pageCode).toContain('const message = getApiErrorMessage(')
  })
})
