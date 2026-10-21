import { describe, expect, it } from 'vitest'
/**
 * 代客下单页接线回归（2026-10-21 · Task 4）
 *
 * admin-web 的 vitest 是 node 环境（没有 jsdom），页面挂不起来；
 * 页面接线用 `?raw` 读源码断言，金额/校验/载荷在
 * `src/utils/__tests__/assistedOrder.spec.ts` 里真跑。
 *
 * ⚠️ 用 Vite 的 `?raw`，不要用 node:fs：构建的 tsconfig 里没有 node 类型。
 */
import page from './AssistedOrderCreate.vue?raw'
import apiSource from '@/api/customRecipe.ts?raw'
import helperSource from '@/utils/assistedOrder.ts?raw'
import orderCenterSource from '@/views/OrderCenter/index.vue?raw'
import routerSource from '@/router/index.ts?raw'

/** 剥注释后再断言 —— 注释里可能还会提到已移除/禁止的入口 */
function stripComments(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

const cleanPage = stripComments(page)
const cleanApi = stripComments(apiSource)
const cleanHelper = stripComments(helperSource)
const cleanOrderCenter = stripComments(orderCenterSource)
const cleanRouter = stripComments(routerSource)

describe('入口与路由', () => {
  it('★ 订单中心有「代客下单」按钮，仅管理员可点', () => {
    expect(cleanOrderCenter).toContain('代客下单')
    expect(cleanOrderCenter).toContain('useIsAdmin')
    expect(cleanOrderCenter).toContain("router.push('/custom-recipes/assisted-order')")
    expect(cleanOrderCenter).toContain('ADMIN_ONLY_TIP')
  })

  it('★ 代客下单页挂在 /custom-recipes/assisted-order', () => {
    expect(cleanRouter).toContain('path: "custom-recipes/assisted-order"')
    expect(cleanRouter).toContain('name: "CustomRecipeAssistedOrder"')
    expect(cleanRouter).toContain('CustomRecipes/AssistedOrderCreate.vue')
    // 旧的 /custom-recipes 仍然重定向到订单中心，不恢复独立列表
    expect(cleanRouter).toContain('redirect: "/order-center?type=CUSTOM_RECIPE"')
  })
})

describe('选顾客：已有账号 / 代客客户', () => {
  it('★ 两类顾客都能搜，代客客户还能新建', () => {
    expect(cleanPage).toContain('customRecipeApi.searchStaffCustomers')
    expect(cleanPage).toContain('customRecipeApi.searchGuestCustomers')
    expect(cleanPage).toContain('customRecipeApi.createGuestCustomer')
    expect(cleanPage).toContain('已有账号顾客')
    expect(cleanPage).toContain('代客客户（无账号）')
  })

  it('★ 结果与已选顾客都展示姓名 + 手机号 + 狗狗数量', () => {
    expect(cleanPage).toContain('item.phone || \'未填写\'')
    expect(cleanPage).toContain('{{ selectedCustomer.phone || \'未填写\' }}')
    expect(cleanPage).toContain('{{ selectedCustomer.dogCount }}')
    expect(cleanPage).toContain('describeCustomer(')
  })
})

describe('选狗狗：不能只靠名字', () => {
  it('★ 狗卡片显示头像/名字/品种/年龄/体重，并重复显示主人与手机号', () => {
    expect(cleanPage).toContain('dog.avatarUrl')
    expect(cleanPage).toContain('{{ dog.name }}')
    expect(cleanPage).toContain('dog.breedName || dog.customBreedName')
    expect(cleanPage).toContain('ageText(dog.birthday)')
    expect(cleanPage).toContain('weightText(dog.currentWeightKg)')
    expect(cleanPage).toContain('主人：{{ ownerSummary }}')
    expect(cleanPage).toContain('当前顾客：{{ ownerSummary }}')
  })

  it('★ 选狗只认 dog.id，并绑定 ownerId 查狗', () => {
    expect(cleanPage).toContain('@click="selectDog(dog)"')
    expect(cleanPage).toContain('form.dogId = dog.id')
    expect(cleanPage).toContain('customRecipeApi.listCustomerDogs(customer.id)')
    expect(cleanPage).toContain(':key="dog.id"')
  })

  it('★ 代客客户可以新建狗，ownerId 由后端按 customerId 指定', () => {
    expect(cleanPage).toContain('customRecipeApi.createGuestDog(customer.id')
    expect(cleanPage).toContain('新建狗狗档案')
    expect(cleanPage).toContain('v-if="isGuestSelected"')
  })
})

describe('定制问卷与选项字典', () => {
  it('★ 目标/当前食物/原因/肠胃的选项来自选项字典，不写死中文', () => {
    expect(cleanPage).toContain('customRecipeApi.getIntakeOptionSets()')
    expect(cleanPage).toContain('goalOptions')
    expect(cleanPage).toContain('currentFoodOptions')
    expect(cleanPage).toContain('changeReasonOptions')
    expect(cleanPage).toContain('stomachOptions')
    expect(cleanApi).toContain('custom_recipe_goal')
    expect(cleanApi).toContain('custom_recipe_current_food')
    expect(cleanApi).toContain('custom_recipe_change_reason')
    expect(cleanApi).toContain('custom_recipe_stomach')
  })

  it('★ 健康管理方向限定减重/维持/增重（code 固定，标签仍来自字典）', () => {
    expect(cleanPage).toContain('ASSISTED_TARGET_GOAL_CODES')
    expect(cleanHelper).toContain("'LOSE_WEIGHT'")
    expect(cleanHelper).toContain("'MAINTAIN'")
    expect(cleanHelper).toContain("'GAIN_WEIGHT'")
    expect(cleanHelper).not.toContain("'HEALTH_SUPPORT'")
  })

  it('★ 份数、主蛋白、过敏、饲喂历史、原因、肠胃、备注都有', () => {
    expect(cleanPage).toContain('form.recipeQuantity')
    expect(cleanPage).toContain('form.requestedProteinCodes')
    expect(cleanPage).toContain('form.allergyStatus')
    expect(cleanPage).toContain('form.allergyText')
    expect(cleanPage).toContain('form.currentFoodMain')
    expect(cleanPage).toContain('form.currentFoodOther')
    expect(cleanPage).toContain('form.changeReasons')
    expect(cleanPage).toContain('form.stomachConditions')
    expect(cleanPage).toContain('form.additionalNotes')
  })
})

describe('服务端报价', () => {
  it('★ 份数变化调用报价接口，不做前端算价', () => {
    expect(cleanPage).toContain('customRecipeApi.getQuote(quantity)')
    expect(cleanPage).toContain('watch(')
    expect(cleanPage).toContain('() => form.recipeQuantity')
    expect(cleanPage).not.toContain('feeAmount *')
    expect(cleanPage).not.toContain('unitAmount *')
    expect(cleanPage).not.toContain('payableAmount =')
  })

  it('★ 原价 / 优惠 / 应付都展示服务端字段', () => {
    expect(cleanPage).toContain('quote.originalAmount')
    expect(cleanPage).toContain('quote.discountAmount')
    expect(cleanPage).toContain('quote.discountRate')
    expect(cleanPage).toContain('quote.payableAmount')
  })

  it('★ 报价失败时挡住提交', () => {
    expect(cleanPage).toContain('quoteError')
    expect(cleanPage).toContain('quote.value !== null')
  })
})

describe('线下收款', () => {
  it('★ 收款状态、渠道、实收、流水号、差异原因都在', () => {
    expect(cleanPage).toContain('form.payment.collected')
    expect(cleanPage).toContain('ASSISTED_PAYMENT_CHANNELS')
    expect(cleanPage).toContain('form.payment.channel')
    expect(cleanPage).toContain('form.payment.amount')
    expect(cleanPage).toContain('form.payment.externalRef')
    expect(cleanPage).toContain('form.payment.overrideReason')
    expect(cleanPage).toContain('needsOverrideReason')
  })

  it('★ 实收默认等于服务端应付，改价才要原因', () => {
    expect(cleanPage).toContain('applyQuote')
    expect(cleanPage).toContain('shouldSyncActualAmount')
    expect(cleanPage).toContain('getPaymentValidationError')
    expect(cleanHelper).toContain('实收金额与系统报价不一致时，必须填写原因')
  })

  it('★ 不提供线上支付；支付渠道只从线下常量渲染', () => {
    for (const source of [cleanPage, cleanApi, cleanHelper]) {
      expect(source).not.toContain('WECHAT_ONLINE')
      expect(source).not.toContain('微信在线')
    }
    expect(cleanHelper).toContain("'OFFLINE_WECHAT'")
    expect(cleanHelper).toContain("'OFFLINE_ALIPAY'")
    expect(cleanHelper).toContain("'OTHER'")
  })
})

describe('提交载荷与成功跳转', () => {
  it('★ 提交走 assisted 接口，载荷由纯函数拼装', () => {
    expect(cleanPage).toContain('buildAssistedOrderPayload(form')
    expect(cleanPage).toContain('customRecipeApi.createAssistedOrder(payload)')
    expect(cleanApi).toContain('`${BASE}/orders/assisted`')
    expect(cleanApi).toContain('/orders/assisted')
  })

  it('★ 成功后跳订单中心并自动打开该定制订单', () => {
    expect(cleanPage).toContain('/order-center?type=CUSTOM_RECIPE&orderId=')
    expect(cleanPage).toContain('encodeURIComponent(orderId)')
    expect(cleanPage).toContain('router.replace(')
  })

  it('★ 后端错误原样带到页面，不只显示“失败”', () => {
    expect(cleanPage).toContain('getApiErrorMessage(error')
    expect(cleanPage).toContain('toastApiError(error')
    expect(cleanPage).toContain('submitError')
  })
})

describe('API 封装', () => {
  it('★ 代客客户/代客狗/客户搜索/报价/assisted 下单都有', () => {
    expect(cleanApi).toContain('/staff/customer-service/customers/search')
    expect(cleanApi).toContain('`${BASE}/guest-customers`')
    expect(cleanApi).toContain('/guest-customers/${encodeURIComponent(customerId)}/dogs')
    expect(cleanApi).toContain("'/custom-recipe/quote'")
    expect(cleanApi).toContain('`${BASE}/orders/assisted`')
  })

  it('★ 类型里不出现线上支付渠道', () => {
    expect(cleanApi).toContain("'OFFLINE_WECHAT'")
    expect(cleanApi).toContain("'OFFLINE_ALIPAY'")
    expect(cleanApi).not.toContain('WECHAT_ONLINE')
  })
})
