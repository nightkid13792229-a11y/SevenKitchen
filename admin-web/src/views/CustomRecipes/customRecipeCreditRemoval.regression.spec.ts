import { describe, expect, it } from 'vitest'
/**
 * ⚠️ 用 Vite 的 `?raw` 读源码，**不要用 `node:fs`**（原因见
 * customRecipeOrderPage.regression.spec.ts 文件头：`npm test` 会绿，
 * `npm run build` 却因为 tsconfig 没有 node 类型直接失败）。
 *
 * 定制费抵扣成品货款这条链路已于 2026-10-20 整体下线（后端先删字段与接口，
 * 见 e367b817）。后台这边的风险不是"逻辑没删干净"，而是**入口还留着**：
 * 配置页还有一个额度输入框、列表还有一列余额、详情还有一个恢复按钮，
 * 点下去只会撞后端 404。这里把"页面、API、类型里都不许再出现"钉死。
 */
import configSource from '@/views/CustomRecipes/Config.vue?raw'
import orderDetailSource from '@/views/CustomRecipes/OrderDetail.vue?raw'
import orderListSource from '@/views/CustomRecipes/OrderList.vue?raw'
import finishedOrderDetailSource from '@/views/Orders/Detail.vue?raw'
import customRecipeApiSource from '@/api/customRecipe.ts?raw'
import orderTypesSource from '@/types/order.ts?raw'

/** 已经删除的数据库字段 / 接口载荷字段，一个都不许回到前端 */
const REMOVED_FIELD_TOKENS = [
  'creditAmount',
  'creditAmountApplied',
  'creditOriginalProductAmount',
  'creditUsed',
  'creditRemaining',
  'customRecipeCreditOrderId',
] as const

/** 用户能看到的文案：可抵扣 / 成品抵扣 / 恢复额度 */
const REMOVED_COPY_TOKENS = [
  '可抵扣',
  '成品抵扣',
  '恢复额度',
  '恢复抵扣',
  '定制费抵扣',
] as const

/** 恢复额度的动作与接口 */
const REMOVED_ACTION_TOKENS = [
  'restore-credit',
  'restoreCredit',
  'RESTORE_CREDIT',
] as const

describe('定制抵扣下线：后台设置页', () => {
  it('不再有「可抵扣金额」输入项与校验', () => {
    for (const token of REMOVED_FIELD_TOKENS) {
      expect(configSource).not.toContain(token)
    }
    for (const token of REMOVED_COPY_TOKENS) {
      expect(configSource).not.toContain(token)
    }
    expect(configSource).not.toContain('handleFeeChange')
  })

  it('定制费本身仍然可读可存（不能把整页一起删掉）', () => {
    expect(configSource).toContain('label="定制费（元）"')
    expect(configSource).toContain('form.feeAmount')
    expect(configSource).toContain('customRecipeApi.updateConfig')
  })
})

describe('定制抵扣下线：定制订单列表', () => {
  it('不再有「可抵扣余额」列与额度字段', () => {
    for (const token of REMOVED_FIELD_TOKENS) {
      expect(orderListSource).not.toContain(token)
    }
    for (const token of REMOVED_COPY_TOKENS) {
      expect(orderListSource).not.toContain(token)
    }
  })

  it('不再有 RESTORE_CREDIT 行内动作', () => {
    for (const token of REMOVED_ACTION_TOKENS) {
      expect(orderListSource).not.toContain(token)
    }
    // 其余行内动作照旧由后端契约驱动
    for (const code of ['CONFIRM_PAYMENT', 'ACCEPT_ORDER', 'DELIVER']) {
      expect(orderListSource).toContain(`case '${code}'`)
    }
  })
})

describe('定制抵扣下线：定制订单详情', () => {
  it('不再有额度台账、恢复额度按钮与提示', () => {
    for (const token of REMOVED_FIELD_TOKENS) {
      expect(orderDetailSource).not.toContain(token)
    }
    for (const token of REMOVED_COPY_TOKENS) {
      expect(orderDetailSource).not.toContain(token)
    }
    for (const token of REMOVED_ACTION_TOKENS) {
      expect(orderDetailSource).not.toContain(token)
    }
    expect(orderDetailSource).not.toContain('restoringCredit')
  })

  it('交付 / 取消等原有能力还在（只删抵扣，不误删订单动线）', () => {
    expect(orderDetailSource).toContain('customRecipeApi.deliverRecipe')
    expect(orderDetailSource).toContain('customRecipeApi.updateStatus')
    expect(orderDetailSource).toContain('饲喂历史')
  })
})

describe('定制抵扣下线：成品订单详情', () => {
  it('不再展示「定制费抵扣」与抵扣来源定制单', () => {
    for (const token of REMOVED_FIELD_TOKENS) {
      expect(finishedOrderDetailSource).not.toContain(token)
    }
    for (const token of REMOVED_COPY_TOKENS) {
      expect(finishedOrderDetailSource).not.toContain(token)
    }
  })

  it('价格明细与订单总价仍然展示（只删抵扣两行）', () => {
    expect(finishedOrderDetailSource).toContain('价格明细')
    expect(finishedOrderDetailSource).toContain('label="订单总价"')
    expect(finishedOrderDetailSource).toContain('pricingBreakdownSnapshot.totalPrice')
  })
})

describe('定制抵扣下线：API 与类型', () => {
  it('API 层不再声明恢复额度接口', () => {
    for (const token of REMOVED_ACTION_TOKENS) {
      expect(customRecipeApiSource).not.toContain(token)
    }
    // 其余定制单接口照旧
    expect(customRecipeApiSource).toContain('`${BASE}/orders/${orderId}/deliver-recipe`')
    expect(customRecipeApiSource).toContain('`${BASE}/orders/${orderId}/create-recipe`')
  })

  it('配置与订单类型不再带额度字段', () => {
    for (const token of REMOVED_FIELD_TOKENS) {
      expect(customRecipeApiSource).not.toContain(token)
      expect(orderTypesSource).not.toContain(token)
    }
    // 类型文件本身仍可用（防止路径写错导致断言空过）
    expect(orderTypesSource).toContain('export interface Order {')
    expect(orderTypesSource).toContain('amountProduct')
  })
})
