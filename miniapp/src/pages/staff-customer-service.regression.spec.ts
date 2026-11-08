import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const pagesJson = readFileSync(resolve(__dirname, '../pages.json'), 'utf8')
const ordersApiSource = readFileSync(resolve(__dirname, '../api/orders.ts'), 'utf8')
const dogsApiSource = readFileSync(resolve(__dirname, '../api/dogs.ts'), 'utf8')
const workbenchSource = readFileSync(resolve(__dirname, 'staff-workbench/index.vue'), 'utf8')

function readOptionalPage(path: string) {
  try {
    return readFileSync(resolve(__dirname, path), 'utf8')
  } catch {
    return ''
  }
}

describe('staff customer service customer and dog workflows', () => {
  it('registers customer search and assisted order staff pages', () => {
    expect(pagesJson).toContain('"root": "pages/staff-customer-service"')
    expect(pagesJson).toContain('"path": "customers"')
    // 旧的 assisted-order 页已下线（2026-11-08）：代客下单搬到
    // `pages/staff-assisted-order` 分包，旧路径不再注册。
    expect(pagesJson).not.toContain('"path": "assisted-order"')
    expect(pagesJson).toContain('"root": "pages/staff-assisted-order"')
    expect(pagesJson).toContain('客户与狗狗')
    expect(pagesJson).toContain('代客下单')
  })

  it('exposes staff customer search, assisted order, and dog history API helpers', () => {
    expect(ordersApiSource).toContain('searchStaffCustomers')
    expect(ordersApiSource).toContain('/staff/customer-service/customers/search')
    expect(ordersApiSource).toContain('listStaffCustomerAddresses')
    expect(ordersApiSource).toContain('/staff/customer-service/customers/${customerId}/addresses')
    expect(ordersApiSource).toContain('listStaffDogFinishedFoodRecipeOptions')
    expect(ordersApiSource).toContain('/staff/customer-service/dogs/${dogId}/finished-food-recipe-options')
    expect(ordersApiSource).toContain('createStaffAssistedOrder')
    expect(ordersApiSource).toContain('/staff/customer-service/orders/assisted')
    expect(ordersApiSource).toContain('getStaffDogFinishedFoodHistory')
    expect(ordersApiSource).toContain('/staff/customer-service/dogs/${dogId}/finished-food-history')
    expect(dogsApiSource).toContain('finishedFoodHistory')
    expect(dogsApiSource).toContain('/dogs/${dogId}/finished-food-history')
  })

  it('adds a workbench entry for customer and dog search', () => {
    expect(workbenchSource).toContain('客户与狗狗')
    expect(workbenchSource).toContain('goToCustomerDogs')
    expect(workbenchSource).toContain('/pages/staff-customer-service/customers')
  })

  it('customer search page opens assisted ordering and finished-food history', () => {
    const customerPage = readOptionalPage('staff-customer-service/customers.vue')
    expect(customerPage).toContain('searchStaffCustomers')
    expect(customerPage).toContain('代客下单')
    expect(customerPage).toContain('成品食谱历史')
    expect(customerPage).toContain('openAssistedOrder')
    expect(customerPage).toContain('getStaffDogFinishedFoodHistory')
  })

  it('旧代客下单页已下线，新流程接管', () => {
    const retiredPage = readOptionalPage('staff-customer-service/assisted-order.vue')
    expect(retiredPage).toBe('')
    const customerPage = readOptionalPage('staff-customer-service/customers.vue')
    expect(customerPage).toContain('/pages/staff-assisted-order/index')
  })
})
