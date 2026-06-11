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
    expect(pagesJson).toContain('"path": "assisted-order"')
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

  it('assisted order page creates offline-payment orders and opens staff order detail', () => {
    const assistedOrderPage = readOptionalPage('staff-customer-service/assisted-order.vue')
    expect(assistedOrderPage).toContain('createStaffAssistedOrder')
    expect(assistedOrderPage).toContain('listStaffCustomerAddresses')
    expect(assistedOrderPage).toContain('listStaffDogFinishedFoodRecipeOptions')
    expect(assistedOrderPage).toContain('selectedAddressId')
    expect(assistedOrderPage).toContain('selectedRecipeId')
    expect(assistedOrderPage).toContain('选择成品食谱')
    expect(assistedOrderPage).toContain('选择收货地址')
    expect(assistedOrderPage).toContain('线下收款')
    expect(assistedOrderPage).toContain('实际收款金额')
    expect(assistedOrderPage).not.toContain('食谱ID')
    expect(assistedOrderPage).not.toContain('收货地址ID')
    expect(assistedOrderPage).toContain('/pages/staff-orders/detail')
  })
})
