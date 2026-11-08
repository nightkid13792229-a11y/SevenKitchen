import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const pagesJson = readFileSync(resolve(__dirname, '../pages.json'), 'utf8')
const orderCenter = readFileSync(
  resolve(__dirname, 'staff-order-center/index.vue'),
  'utf8',
)
const customersPage = readFileSync(
  resolve(__dirname, 'staff-customer-service/customers.vue'),
  'utf8',
)
const indexPage = readFileSync(
  resolve(__dirname, 'staff-assisted-order/index.vue'),
  'utf8',
)
const recipePage = readFileSync(
  resolve(__dirname, 'staff-assisted-order/recipe.vue'),
  'utf8',
)
const confirmPage = readFileSync(
  resolve(__dirname, 'staff-assisted-order/confirm.vue'),
  'utf8',
)
const guestDogPage = readFileSync(
  resolve(__dirname, 'staff-assisted-order/guest-dog.vue'),
  'utf8',
)
const addressPage = readFileSync(
  resolve(__dirname, 'staff-assisted-order/address.vue'),
  'utf8',
)
const apiSource = readFileSync(
  resolve(__dirname, '../api/staffAssistedOrder.ts'),
  'utf8',
)

describe('订单中心 · 代客下单（成品鲜食）', () => {
  it('分包已注册，五个页面都在', () => {
    expect(pagesJson).toContain('"root": "pages/staff-assisted-order"')
    for (const path of ['index', 'recipe', 'confirm', 'guest-dog', 'address']) {
      expect(pagesJson).toContain(`"path": "${path}"`)
    }
  })

  it('订单中心有入口，且只对管理员渲染', () => {
    expect(orderCenter).toContain('代客下单')
    expect(orderCenter).toContain('/pages/staff-assisted-order/index')
    expect(orderCenter).toContain("role === 'ADMIN'")
  })

  it('客户与狗狗页的代客下单改跳新流程，且只对管理员渲染', () => {
    expect(customersPage).toContain('/pages/staff-assisted-order/index')
    expect(customersPage).toContain("role === 'ADMIN'")
    expect(customersPage).not.toContain('/pages/staff-customer-service/assisted-order')
  })

  it('选狗页：搜索、无账号标、新建顾客入口', () => {
    expect(indexPage).toContain('searchCustomersForAssist')
    expect(indexPage).toContain('无账号')
    expect(indexPage).toContain('createGuestCustomer')
    expect(indexPage).toContain('guest-dog')
  })

  it('食谱页：四档筛选 + 其他定制提示 + 分页', () => {
    expect(recipePage).toContain("value: 'WINDOW'")
    expect(recipePage).toContain("value: 'OWN_CUSTOM'")
    expect(recipePage).toContain("value: 'OTHER_CUSTOM'")
    expect(recipePage).toContain('这条是给')
    expect(recipePage).toContain('pageSize')
  })

  it('确认页：自动饭量、报价、差额原因、地址必填、无微信通知提示', () => {
    expect(confirmPage).toContain('previewPortion')
    expect(confirmPage).toContain('previewAssistedPricing')
    expect(confirmPage).toContain('amountAdjustReason')
    expect(confirmPage).toContain('不会给顾客发微信通知')
    expect(confirmPage).toContain('请选择收货地址')
    expect(confirmPage).toContain('QuickCyclePackagePlan')
  })

  it('新建狗狗页覆盖 8 项档案字段', () => {
    expect(guestDogPage).toContain('createGuestDog')
    for (const field of [
      'name',
      'breedId',
      'birthday',
      'gender',
      'isNeutered',
      'currentWeightKg',
      'bcsScore',
      'activityLevel',
    ]) {
      expect(guestDogPage).toContain(field)
    }
  })

  it('新增地址页用省市区选择器并落在顾客名下', () => {
    expect(addressPage).toContain('createCustomerAddress')
    expect(addressPage).toContain('mode="region"')
  })

  it('接口封装指向代客下单的三个新接口', () => {
    expect(apiSource).toContain('/assisted-recipe-options')
    expect(apiSource).toContain('/portion-preview')
    expect(apiSource).toContain('/orders/pricing-preview')
    expect(apiSource).toContain('/customers/${customerId}/addresses')
  })

  it('确认页把分装计划传给 getPrimaryPackageSpecG（不传会 TypeError，报价/提交全挂）', () => {
    expect(confirmPage).toContain(
      'getPrimaryPackageSpecG(normalizedPackagePlan.value)',
    )
    expect(confirmPage).not.toContain('getPrimaryPackageSpecG()')
  })

  it('建狗提交体带上必填的 lifeStageOverride（后端 DTO 没有 @IsOptional）', () => {
    expect(guestDogPage).toContain('lifeStageOverride')
    expect(guestDogPage).toContain("'NONE'")
  })

  it('新增地址后确认页会自动选中这一条，不会继续发旧地址', () => {
    expect(addressPage).toContain('assisted_address_created')
    expect(confirmPage).toContain('pendingAddressId')
  })

  it('建地址不再默认抢顾客原有的默认地址', () => {
    expect(addressPage).toContain('isDefault: false')
  })

  it('食谱筛选下推到后端（ownership 参数），不是前端只筛已加载页', () => {
    expect(recipePage).toContain('ownership: activeFilter.value')
  })

  it('确认页用真实分装总重抬天数（3 餐向下取整也要够 1000g）', () => {
    expect(confirmPage).toContain('resolveDaysUntilMinOrder')
  })

  it('实收金额在员工没手动改过时跟随最新报价', () => {
    expect(confirmPage).toContain('amountTouched')
  })
})
