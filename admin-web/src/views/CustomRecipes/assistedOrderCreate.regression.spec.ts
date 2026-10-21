import { describe, expect, it } from 'vitest'
/**
 * 代客下单页接线回归（2026-10-21 · 顾客+狗狗合并选择）
 *
 * 背景：原来分「选顾客」和「选狗狗」两步，员工要先把顾客点中、再等狗列表加载、
 * 再点一次狗。同名顾客/同名狗多的时候极易选错，而且内部测试账号没有标记。
 *
 * 现在改成**一张卡片同时选顾客与狗**；内部账号默认不出现，打开开关后
 * 选中前还要二次确认。页面不能再出现独立的选狗步骤。
 *
 * admin-web 的 vitest 是 node 环境（没有 jsdom），页面挂不起来；
 * 页面接线用 `?raw` 读源码断言，合并/身份/内部账号判断在
 * `src/utils/__tests__/assistedOrder.spec.ts` 里真跑。
 *
 * ⚠️ 用 Vite 的 `?raw`，不要用 node:fs：构建的 tsconfig 里没有 node 类型。
 */
import page from './AssistedOrderCreate.vue?raw'
import apiSource from '@/api/customRecipe.ts?raw'
import helperSource from '@/utils/assistedOrder.ts?raw'
import roleSource from '@/utils/customerRole.ts?raw'
import orderCenterSource from '@/views/OrderCenter/index.vue?raw'
import orderDetailSource from '@/views/CustomRecipes/OrderDetail.vue?raw'
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
const cleanRole = stripComments(roleSource)
const cleanOrderCenter = stripComments(orderCenterSource)
const cleanOrderDetail = stripComments(orderDetailSource)
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

describe('顾客 + 狗狗合并搜索', () => {
  it('★ 搜索走新的合并接口，并带 includeInternal 开关', () => {
    expect(cleanPage).toContain('customRecipeApi.searchAssistedCustomerDogs(')
    expect(cleanPage).toContain('includeInternal.value')
    expect(cleanPage).toContain('包含内部账号（仅管理员）')
    expect(cleanApi).toContain('/customer-dog-search')
    expect(cleanApi).toContain('includeInternal: includeInternal ? \'true\' : \'false\'')
  })

  it('★ 内部账号开关默认关闭', () => {
    expect(cleanPage).toContain('const includeInternal = ref(false)')
    expect(cleanPage).toContain(':disabled="!isAdmin"')
  })

  it('★ 结果卡片同时展示顾客姓名/手机号/角色徽标和全部狗狗', () => {
    expect(cleanPage).toContain('buildCustomerDogCards(')
    expect(cleanPage).toContain('{{ card.name }}')
    expect(cleanPage).toContain("{{ card.phone || '未填写' }}")
    expect(cleanPage).toContain('{{ card.dogs.length }} 只狗')
    expect(cleanPage).toContain('INTERNAL_CUSTOMER_ACCOUNT_BADGE')
    expect(cleanPage).toContain("card.isInternal ? INTERNAL_CUSTOMER_ACCOUNT_BADGE : '真实顾客'")
    expect(cleanPage).toContain('v-for="dog in card.dogs"')
    expect(cleanPage).toContain('{{ dog.breedName || \'品种未填写\' }}')
    expect(cleanPage).toContain('{{ dog.ageText }}')
    expect(cleanPage).toContain('{{ dog.weightText }}')
  })

  it('★ 点一只狗就同时选中顾客和狗，不再分两步', () => {
    expect(cleanPage).toContain('@click="selectCustomerDog(card, dog)"')
    expect(cleanPage).toContain('form.customerId = card.customerId')
    expect(cleanPage).toContain('form.dogId = dog.id')
    expect(cleanPage).not.toContain('selectExistingCustomer')
    expect(cleanPage).not.toContain('第二步：狗狗')
    expect(cleanPage).not.toContain('section-title">选择狗狗')
  })
})

describe('内部账号确认与已选身份', () => {
  it('★ 选中内部账号前必须二次确认，文案明确“仅用于测试”', () => {
    expect(cleanPage).toContain('ElMessageBox.confirm(')
    expect(cleanPage).toContain('这是内部账号，不是真实顾客，仅用于测试？')
    expect(cleanPage).toContain('requiresInternalConfirmation(card)')
    expect(cleanHelper).toContain('export function requiresInternalConfirmation')
  })

  it('★ 顶部身份卡同时显示顾客与狗，内部账号有明确标记', () => {
    expect(cleanPage).toContain('selectedIdentity')
    expect(cleanPage).toContain('buildSelectedIdentity(selectedCustomer.value, selectedDog.value)')
    expect(cleanPage).toContain('当前顾客')
    expect(cleanPage).toContain('selectedIdentity.customerName')
    expect(cleanPage).toContain('selectedIdentity.customerPhone')
    expect(cleanPage).toContain('selectedIdentity.dogName')
    expect(cleanPage).toContain('这是内部账号，不是真实顾客，仅用于测试。')
    expect(cleanHelper).toContain('export function buildSelectedIdentity')
  })

  it('★「重新选择」把顾客和狗一起重置', () => {
    expect(cleanPage).toContain('重新选择')
    expect(cleanPage).toContain('@click="resetSelection"')
    expect(cleanPage).toContain('function resetSelection()')
    expect(cleanPage).toContain("selectedCustomer.value = null")
    expect(cleanPage).toContain("selectedDog.value = null")
    expect(cleanPage).toContain("form.customerId = ''")
    expect(cleanPage).toContain("form.dogId = ''")
  })
})

describe('代客客户流程保持不变', () => {
  it('★ 无账号顾客仍可搜索 / 新建，再选或新建狗狗', () => {
    expect(cleanPage).toContain('customRecipeApi.searchGuestCustomers')
    expect(cleanPage).toContain('customRecipeApi.createGuestCustomer')
    expect(cleanPage).toContain('customRecipeApi.createGuestDog(customer.id')
    expect(cleanPage).toContain('customRecipeApi.listCustomerDogs(customer.id)')
    expect(cleanPage).toContain('新建狗狗档案')
    expect(cleanPage).toContain('v-if="isGuestSelected"')
  })

  it('★ 代客客户的狗卡片仍重复显示主人与手机号', () => {
    expect(cleanPage).toContain('{{ dog.name }}')
    expect(cleanPage).toContain('dog.breedName || dog.customBreedName')
    expect(cleanPage).toContain('ageText(dog.birthday)')
    expect(cleanPage).toContain('weightText(dog.currentWeightKg)')
    expect(cleanPage).toContain('主人：{{ ownerSummary }}')
    expect(cleanPage).toContain('当前顾客：{{ ownerSummary }}')
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
  it('★ 提交走 assisted 接口，载荷由纯函数拼装，结构与之前一致', () => {
    expect(cleanPage).toContain('buildAssistedOrderPayload(form')
    expect(cleanPage).toContain('customRecipeApi.createAssistedOrder(payload)')
    expect(cleanApi).toContain('`${BASE}/orders/assisted`')
    expect(cleanApi).toContain('/orders/assisted')
    expect(cleanHelper).toContain('customerId: form.customerId')
    expect(cleanHelper).toContain('dogId: form.dogId')
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

describe('内部测试标记', () => {
  it('★ 订单中心与订单详情都用同一套角色判断标「内部测试」', () => {
    expect(cleanRole).toContain("INTERNAL_CUSTOMER_BADGE = '内部测试'")
    expect(cleanRole).toContain('export function isInternalCustomerRole')
    expect(cleanOrderCenter).toContain('isInternalCustomerRole(row.customerRole)')
    expect(cleanOrderCenter).toContain('INTERNAL_CUSTOMER_BADGE')
    expect(cleanOrderDetail).toContain('isInternalCustomerRole(order.value?.customer?.role)')
    expect(cleanOrderDetail).toContain('INTERNAL_CUSTOMER_BADGE')
  })
})

describe('API 封装', () => {
  it('★ 合并搜索 / 代客客户 / 代客狗 / 报价 / assisted 下单都有', () => {
    expect(cleanApi).toContain('/customer-dog-search')
    expect(cleanApi).toContain('`${BASE}/guest-customers`')
    expect(cleanApi).toContain('/guest-customers/${encodeURIComponent(customerId)}/dogs')
    expect(cleanApi).toContain("'/custom-recipe/quote'")
    expect(cleanApi).toContain('`${BASE}/orders/assisted`')
  })

  it('★ 员工端客户搜索接口保持原样（补剂/客服流程还在用）', () => {
    expect(cleanApi).toContain('/staff/customer-service/customers/search')
    expect(cleanApi).toContain('searchStaffCustomers')
  })

  it('★ 类型里不出现线上支付渠道', () => {
    expect(cleanApi).toContain("'OFFLINE_WECHAT'")
    expect(cleanApi).toContain("'OFFLINE_ALIPAY'")
    expect(cleanApi).not.toContain('WECHAT_ONLINE')
  })
})
